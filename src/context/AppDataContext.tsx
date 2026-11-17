import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  DEFAULT_SCHOOL_SETTINGS,
  INITIAL_ADMINS,
  INITIAL_STUDENTS,
} from '../lib/seedData';
import { getTodayWib } from '../lib/utils';
import type {
  AdminAccount,
  AdminLog,
  AdminRole,
  AttendanceRecord,
  AttendanceStatus,
  SchoolSettings,
  Student,
  TtsVoice,
} from '../types';

export type CloudSyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

const LS_KEYS = {
  STUDENTS: 'sman109_students_v1',
  ATTENDANCES: 'sman109_attendances_v1',
  ADMINS: 'sman109_admins_v1',
  LOGS: 'sman109_admin_logs_v1',
  SETTINGS: 'sman109_school_settings_v1',
  SESSION: 'sman109_active_session_v1',
  LAST_SYNC: 'sman109_last_sync_ts_v1',
};

const VALID_STATUSES: AttendanceStatus[] = ['Hadir', 'Sakit', 'Ijin', 'Alpa'];
const VALID_ROLES: AdminRole[] = ['super_admin', 'admin', 'operator'];
const VALID_VOICES: TtsVoice[] = ['Kore', 'Puck', 'Zephyr', 'Fenrir', 'Charon'];

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  if (cleaned.length >= 2) return cleaned.slice(0, 64);
  return `${fallbackPrefix}_${Date.now()}`.slice(0, 64);
}

function sanitizeStudentId(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleaned.length >= 3) return cleaned.slice(0, 32);
  return cleaned.padEnd(3, '0').slice(0, 32);
}

function safeTimestamp(ts?: string): string {
  if (typeof ts === 'string' && ts.trim().length >= 10 && ts.trim().length <= 40) {
    return ts.trim();
  }
  return new Date().toISOString();
}

function sanitizeStudentForCloud(s: Student): Student {
  const nis = sanitizeStudentId(s.nis || s.id);
  const foto =
    typeof s.foto === 'string' && s.foto.length > 0 && s.foto.length <= 150000 ? s.foto : null;
  return {
    id: nis,
    nis,
    nama: (s.nama || 'Murid').trim().slice(0, 120) || 'Murid',
    kelas: (s.kelas || 'X-A').trim().slice(0, 24) || 'X-A',
    tahun: (s.tahun || '2025/2026').trim().slice(0, 20) || '2025/2026',
    jenisKelamin: s.jenisKelamin === 'P' ? 'P' : 'L',
    telepon: (s.telepon || '').trim().slice(0, 30),
    foto,
    updatedAt: safeTimestamp(s.updatedAt),
  };
}

function sanitizeAttendanceForCloud(a: AttendanceRecord): AttendanceRecord {
  const nis = sanitizeStudentId(a.nis);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : getTodayWib();
  const id = sanitizeId(`${nis}_${date}`, 'att');
  const status: AttendanceStatus = VALID_STATUSES.includes(a.status) ? a.status : 'Hadir';
  const timeRaw = (a.time || '07:00:00').trim();
  const time = timeRaw.length >= 5 ? timeRaw.slice(0, 12) : '07:00:00';
  return {
    id,
    nis,
    nama: (a.nama || 'Murid').trim().slice(0, 120) || 'Murid',
    kelas: (a.kelas || 'X-A').trim().slice(0, 24) || 'X-A',
    date,
    time,
    status,
    notes: (a.notes || '').trim().slice(0, 250),
    recordedBy: (a.recordedBy || 'Admin').trim().slice(0, 100) || 'Admin',
    updatedAt: safeTimestamp(a.updatedAt),
  };
}

function sanitizeAdminForCloud(a: AdminAccount): AdminAccount {
  const rawPw = String(a.password || '').trim();
  const password = rawPw === '109' || rawPw.length < 4 ? '109109' : rawPw.slice(0, 128);
  const role: AdminRole = VALID_ROLES.includes(a.role) ? a.role : 'operator';
  return {
    id: sanitizeId(a.id, 'adm'),
    nama: (a.nama || 'Admin').trim().slice(0, 100) || 'Admin',
    email: (a.email || 'admin@sman109.sch.id').trim().toLowerCase().slice(0, 120),
    username: (a.username || 'admin').trim().slice(0, 50) || 'admin',
    password,
    telepon: (a.telepon || '').trim().slice(0, 30),
    role,
    active: Boolean(a.active),
    createdAt: safeTimestamp(a.createdAt),
    updatedAt: safeTimestamp(a.updatedAt),
  };
}

function sanitizeSettingsForCloud(s: SchoolSettings): SchoolSettings {
  const rules = Array.isArray(s.cardBackRules)
    ? s.cardBackRules
        .map((r) => String(r || '').trim())
        .filter((r) => r.length > 0)
        .slice(0, 12)
    : DEFAULT_SCHOOL_SETTINGS.cardBackRules;

  const customLogo =
    typeof s.customLogo === 'string' && s.customLogo.length > 0 && s.customLogo.length <= 200000
      ? s.customLogo
      : null;

  const homeroomTeachers: Record<string, string> = {};
  if (s.homeroomTeachers && typeof s.homeroomTeachers === 'object') {
    Object.entries(s.homeroomTeachers).forEach(([k, v]) => {
      if (k && typeof v === 'string') {
        homeroomTeachers[String(k).slice(0, 24)] = v.slice(0, 120);
      }
    });
  }

  return {
    schoolName: (s.schoolName || DEFAULT_SCHOOL_SETTINGS.schoolName).trim().slice(0, 120),
    address: (s.address || '').trim().slice(0, 250),
    npsn: (s.npsn || '').trim().slice(0, 20),
    academicYear: (s.academicYear || '2025/2026').trim().slice(0, 20) || '2025/2026',
    principalName:
      (s.principalName || DEFAULT_SCHOOL_SETTINGS.principalName).trim().slice(0, 100) ||
      DEFAULT_SCHOOL_SETTINGS.principalName,
    principalNip: (s.principalNip || '').trim().slice(0, 40),
    homeroomTeachers,
    customLogo,
    cardBackTitle: (s.cardBackTitle || DEFAULT_SCHOOL_SETTINGS.cardBackTitle).trim().slice(0, 100),
    cardBackRules: rules,
    cardBackFooter: (s.cardBackFooter || '').trim().slice(0, 200),
    ttsVoice: VALID_VOICES.includes(s.ttsVoice) ? s.ttsVoice : 'Kore',
    ttsEnabled: Boolean(s.ttsEnabled),
    updatedAt: safeTimestamp(s.updatedAt),
  };
}

function sanitizeAdminLogForCloud(l: AdminLog): AdminLog {
  const role: AdminRole = VALID_ROLES.includes(l.adminRole) ? l.adminRole : 'operator';
  return {
    id: sanitizeId(l.id, 'log'),
    adminId: String(l.adminId || 'adm').slice(0, 64) || 'adm',
    adminName: (l.adminName || 'Admin').trim().slice(0, 100) || 'Admin',
    adminRole: role,
    action: (l.action || 'AKSI').trim().slice(0, 80) || 'AKSI',
    detail: (l.detail || '-').trim().slice(0, 500) || '-',
    timestamp: safeTimestamp(l.timestamp),
  };
}

function formatReadableSyncError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('Quota exceeded')) {
    return 'Kuota harian gratis Firestore terlampaui. Data tetap aman tersimpan di cache lokal dan akan tersinkron setelah kuota direset.';
  }
  if (raw.includes('permission-denied') || raw.includes('Missing or insufficient permissions')) {
    return 'Izin akses Firestore ditolak oleh aturan keamanan database. Periksa firestore.rules.';
  }
  if (raw.includes('client is offline') || raw.includes('unavailable')) {
    return 'Koneksi ke server Firestore terputus. Perubahan disimpan di cache lokal dan otomatis disinkronkan saat online.';
  }
  return `Sinkronisasi Cloud terganggu: ${raw.slice(0, 160)}`;
}

function isOnlineNow(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

interface AppDataContextValue {
  students: Student[];
  attendances: AttendanceRecord[];
  admins: AdminAccount[];
  adminLogs: AdminLog[];
  settings: SchoolSettings;
  activeAdmin: AdminAccount | null;
  cloudConnected: boolean;
  isOffline: boolean;
  syncStatus: CloudSyncStatus;
  lastSyncedAt: string | null;
  syncError: string | null;
  activeDate: string;
  setActiveDate: (date: string) => void;
  loginWithCredentials: (identifier: string, password: string) => { ok: boolean; error?: string };
  loginWithSelectedAdmin: (adminId: string, password: string) => { ok: boolean; error?: string };
  syncNowToFirestore: () => Promise<{ ok: boolean; error?: string }>;
  clearSyncError: () => void;
  logout: () => Promise<void>;
  saveStudent: (student: Student) => Promise<void>;
  bulkSaveStudents: (list: Student[]) => Promise<void>;
  replaceAllStudents: (list: Student[]) => Promise<void>;
  deleteStudent: (nis: string) => Promise<void>;
  bulkDeleteStudents: (nisList: string[]) => Promise<void>;
  recordAttendance: (record: AttendanceRecord) => Promise<void>;
  bulkRecordAttendance: (records: AttendanceRecord[]) => Promise<void>;
  clearDateAttendances: (date: string) => Promise<void>;
  clearAllAttendances: () => Promise<void>;
  saveAdmin: (admin: AdminAccount) => Promise<void>;
  deleteAdmin: (adminId: string) => Promise<void>;
  saveSettings: (next: SchoolSettings) => Promise<void>;
  addAdminLog: (action: string, detail: string, actor?: AdminAccount | null) => Promise<void>;
  restoreBackup: (payload: {
    students?: Student[];
    attendances?: AttendanceRecord[];
    settings?: SchoolSettings;
  }) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [students, setStudents] = useState<Student[]>(() => {
    const existing = readStorage<Student[] | null>(LS_KEYS.STUDENTS, null);
    if (existing !== null) return existing;
    writeStorage(LS_KEYS.STUDENTS, INITIAL_STUDENTS);
    return INITIAL_STUDENTS;
  });

  const [attendances, setAttendances] = useState<AttendanceRecord[]>(() =>
    readStorage<AttendanceRecord[]>(LS_KEYS.ATTENDANCES, [])
  );

  const [admins, setAdmins] = useState<AdminAccount[]>(() => {
    const existing = readStorage<AdminAccount[] | null>(LS_KEYS.ADMINS, null);
    if (existing && existing.length > 0) {
      let migrated = false;
      const normalized = existing.map((adm) => {
        if (adm.password === '109' || !adm.password || adm.password.length < 4) {
          migrated = true;
          return { ...adm, password: '109109' };
        }
        return adm;
      });
      if (migrated) {
        writeStorage(LS_KEYS.ADMINS, normalized);
      }
      return normalized;
    }
    writeStorage(LS_KEYS.ADMINS, INITIAL_ADMINS);
    return INITIAL_ADMINS;
  });

  const [adminLogs, setAdminLogs] = useState<AdminLog[]>(() =>
    readStorage<AdminLog[]>(LS_KEYS.LOGS, [])
  );

  const [settings, setSettings] = useState<SchoolSettings>(() =>
    readStorage<SchoolSettings>(LS_KEYS.SETTINGS, DEFAULT_SCHOOL_SETTINGS)
  );

  const [activeAdmin, setActiveAdmin] = useState<AdminAccount | null>(() => {
    try {
      const raw = sessionStorage.getItem(LS_KEYS.SESSION);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AdminAccount;
      if (parsed.password === '109') {
        parsed.password = '109109';
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const [cloudConnected, setCloudConnected] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'syncing'
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    readStorage<string | null>(LS_KEYS.LAST_SYNC, null)
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeDate, setActiveDate] = useState<string>(() => getTodayWib());

  // Live refs for conflict-free bidirectional merge
  const studentsRef = useRef(students);
  const attendancesRef = useRef(attendances);
  const adminsRef = useRef(admins);
  const adminLogsRef = useRef(adminLogs);
  const settingsRef = useRef(settings);
  const activeAdminRef = useRef(activeAdmin);
  const lastSyncedAtRef = useRef(lastSyncedAt);
  const isSyncInFlightRef = useRef(false);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);
  useEffect(() => {
    attendancesRef.current = attendances;
  }, [attendances]);
  useEffect(() => {
    adminsRef.current = admins;
  }, [admins]);
  useEffect(() => {
    adminLogsRef.current = adminLogs;
  }, [adminLogs]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    activeAdminRef.current = activeAdmin;
  }, [activeAdmin]);
  useEffect(() => {
    lastSyncedAtRef.current = lastSyncedAt;
    if (lastSyncedAt) {
      writeStorage(LS_KEYS.LAST_SYNC, lastSyncedAt);
    }
  }, [lastSyncedAt]);

  const markSyncedNow = useCallback(() => {
    const now = new Date().toISOString();
    setCloudConnected(true);
    setSyncStatus('synced');
    setLastSyncedAt(now);
  }, []);

  const captureFirestoreError = useCallback(
    (err: unknown, operationType: OperationType, path: string | null) => {
      try {
        handleFirestoreError(err, operationType, path);
      } catch {
        // Structured FirestoreErrorInfo JSON already logged inside handleFirestoreError
      }
      setSyncStatus('error');
      setSyncError(formatReadableSyncError(err));
    },
    []
  );

  const clearSyncError = useCallback(() => {
    setSyncError(null);
    if (!isOffline) {
      setSyncStatus('synced');
    }
  }, [isOffline]);

  // Bidirectional merge & push local changes to Cloud Firestore (no Google Auth required)
  const syncNowToFirestore = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!isOnlineNow()) {
      setSyncStatus('offline');
      return {
        ok: false,
        error: 'Perangkat sedang offline. Sinkronisasi akan berjalan otomatis saat online.',
      };
    }
    if (isSyncInFlightRef.current) {
      return { ok: true };
    }

    isSyncInFlightRef.current = true;
    setSyncStatus('syncing');
    setSyncError(null);

    try {
      const pendingOps: Array<{ path: string; data: Record<string, unknown> }> = [];
      const prevSyncTs = lastSyncedAtRef.current || '';

      // 1. Admins (Staff accounts) bidirectional merge — always synced so LoginScreen stays fresh
      const remoteAdminMap = new Map<string, AdminAccount>();
      try {
        const admSnap = await getDocs(collection(db, 'admins'));
        admSnap.docs.forEach((d) => {
          const adm = sanitizeAdminForCloud(d.data() as AdminAccount);
          remoteAdminMap.set(adm.id, adm);
        });
      } catch (err) {
        captureFirestoreError(err, OperationType.LIST, 'admins');
      }

      const mergedAdminMap = new Map<string, AdminAccount>(remoteAdminMap);
      const isAdminsBootEmpty = remoteAdminMap.size === 0;
      adminsRef.current.forEach((localRaw) => {
        const local = sanitizeAdminForCloud(localRaw);
        const remote = remoteAdminMap.get(local.id);
        const shouldPush = isAdminsBootEmpty
          ? true
          : remote
            ? local.updatedAt > (remote.updatedAt || '')
            : Boolean(prevSyncTs && local.updatedAt > prevSyncTs);
        if (shouldPush) {
          mergedAdminMap.set(local.id, local);
          pendingOps.push({
            path: `admins/${local.id}`,
            data: local as unknown as Record<string, unknown>,
          });
        }
      });

      const mergedAdmins = Array.from(mergedAdminMap.values());
      if (mergedAdmins.length > 0) {
        setAdmins(mergedAdmins);
        writeStorage(LS_KEYS.ADMINS, mergedAdmins);
      }

      // 2. Students bidirectional merge (Last-Write-Wins on updatedAt)
      const remoteStudentMap = new Map<string, Student>();
      try {
        const snap = await getDocs(collection(db, 'students'));
        snap.docs.forEach((d) => {
          const st = d.data() as Student;
          remoteStudentMap.set(st.nis || d.id, st);
        });
      } catch (err) {
        captureFirestoreError(err, OperationType.LIST, 'students');
      }

      const mergedStudentMap = new Map<string, Student>(remoteStudentMap);
      const isStudentsBootEmpty = remoteStudentMap.size === 0 && !prevSyncTs;
      studentsRef.current.forEach((localRaw) => {
        const local = sanitizeStudentForCloud(localRaw);
        const remote = remoteStudentMap.get(local.nis);
        const shouldPush = isStudentsBootEmpty
          ? true
          : remote
            ? local.updatedAt > (remote.updatedAt || '')
            : Boolean(prevSyncTs && local.updatedAt > prevSyncTs);
        if (shouldPush) {
          mergedStudentMap.set(local.nis, local);
          pendingOps.push({
            path: `students/${local.nis}`,
            data: local as unknown as Record<string, unknown>,
          });
        }
      });

      const mergedStudents = Array.from(mergedStudentMap.values());
      if (mergedStudents.length > 0 || prevSyncTs) {
        setStudents(mergedStudents);
        writeStorage(LS_KEYS.STUDENTS, mergedStudents);
      }

      // 3. Attendances bidirectional merge
      const remoteAttMap = new Map<string, AttendanceRecord>();
      try {
        const snap = await getDocs(collection(db, 'attendances'));
        snap.docs.forEach((d) => {
          const att = d.data() as AttendanceRecord;
          remoteAttMap.set(att.id || d.id, att);
        });
      } catch (err) {
        captureFirestoreError(err, OperationType.LIST, 'attendances');
      }

      const mergedAttMap = new Map<string, AttendanceRecord>(remoteAttMap);
      attendancesRef.current.forEach((localRaw) => {
        const local = sanitizeAttendanceForCloud(localRaw);
        const remote = remoteAttMap.get(local.id);
        const shouldPush = remote
          ? local.updatedAt > (remote.updatedAt || '')
          : !prevSyncTs || local.updatedAt > prevSyncTs;
        if (shouldPush) {
          mergedAttMap.set(local.id, local);
          pendingOps.push({
            path: `attendances/${local.id}`,
            data: local as unknown as Record<string, unknown>,
          });
        }
      });

      const mergedAttendances = Array.from(mergedAttMap.values());
      setAttendances(mergedAttendances);
      writeStorage(LS_KEYS.ATTENDANCES, mergedAttendances);

      // 4. School Settings bidirectional merge
      try {
        const setSnap = await getDoc(doc(db, 'school_settings', 'main'));
        const localSettings = sanitizeSettingsForCloud(settingsRef.current);
        if (setSnap.exists()) {
          const remoteSettings = setSnap.data() as SchoolSettings;
          if (localSettings.updatedAt > (remoteSettings.updatedAt || '')) {
            pendingOps.push({
              path: 'school_settings/main',
              data: localSettings as unknown as Record<string, unknown>,
            });
          } else {
            setSettings(remoteSettings);
            writeStorage(LS_KEYS.SETTINGS, remoteSettings);
          }
        } else {
          pendingOps.push({
            path: 'school_settings/main',
            data: localSettings as unknown as Record<string, unknown>,
          });
        }
      } catch (err) {
        captureFirestoreError(err, OperationType.GET, 'school_settings/main');
      }

      // 5. Admin Logs merge (push any unuploaded local logs)
      try {
        const logSnap = await getDocs(collection(db, 'admin_logs'));
        const remoteLogMap = new Map<string, AdminLog>();
        logSnap.docs.forEach((d) => {
          const lg = d.data() as AdminLog;
          remoteLogMap.set(lg.id || d.id, lg);
        });
        adminLogsRef.current.slice(0, 100).forEach((localRaw) => {
          const local = sanitizeAdminLogForCloud(localRaw);
          if (!remoteLogMap.has(local.id)) {
            remoteLogMap.set(local.id, local);
            pendingOps.push({
              path: `admin_logs/${local.id}`,
              data: local as unknown as Record<string, unknown>,
            });
          }
        });
        const sortedLogs = Array.from(remoteLogMap.values())
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, 500);
        setAdminLogs(sortedLogs);
        writeStorage(LS_KEYS.LOGS, sortedLogs);
      } catch (err) {
        captureFirestoreError(err, OperationType.LIST, 'admin_logs');
      }

      // Commit all pending local-to-cloud writes in safe chunks of 400
      for (let i = 0; i < pendingOps.length; i += 400) {
        const batch = writeBatch(db);
        const slice = pendingOps.slice(i, i + 400);
        slice.forEach((op) => {
          const segments = op.path.split('/');
          if (segments.length === 2) {
            batch.set(doc(db, segments[0], segments[1]), op.data, { merge: true });
          }
        });
        await batch.commit();
      }

      markSyncedNow();
      return { ok: true };
    } catch (err) {
      captureFirestoreError(err, OperationType.WRITE, 'sync_batch');
      return { ok: false, error: formatReadableSyncError(err) };
    } finally {
      isSyncInFlightRef.current = false;
    }
  }, [captureFirestoreError, markSyncedNow]);

  // Network online/offline listeners + initial Firestore server check
  useEffect(() => {
    void testFirestoreConnection().then((ok) => setCloudConnected(ok));
    const onOnline = () => {
      setIsOffline(false);
      void syncNowToFirestore();
    };
    const onOffline = () => {
      setIsOffline(true);
      setSyncStatus('offline');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [syncNowToFirestore]);

  // Keep sessionStorage synced with activeAdmin
  useEffect(() => {
    try {
      if (activeAdmin) {
        sessionStorage.setItem(LS_KEYS.SESSION, JSON.stringify(activeAdmin));
      } else {
        sessionStorage.removeItem(LS_KEYS.SESSION);
      }
    } catch {
      // Ignore storage error
    }
  }, [activeAdmin]);

  // Real-time Firestore listeners (active on boot so staff accounts & data stay synchronized across devices)
  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    if (isOnlineNow()) {
      void syncNowToFirestore();
    }

    // 1. Admins (Staff Accounts) real-time listener
    const unsubAdmins = onSnapshot(
      collection(db, 'admins'),
      (snap) => {
        if (cancelled) return;
        if (!snap.empty) {
          const remoteMap = new Map<string, AdminAccount>();
          snap.docs.forEach((d) => {
            const adm = sanitizeAdminForCloud(d.data() as AdminAccount);
            remoteMap.set(adm.id, adm);
          });
          if (isSyncInFlightRef.current) {
            adminsRef.current.forEach((localRaw) => {
              const local = sanitizeAdminForCloud(localRaw);
              const remote = remoteMap.get(local.id);
              if (!remote || local.updatedAt > (remote.updatedAt || '')) {
                remoteMap.set(local.id, local);
              }
            });
          }
          const list = Array.from(remoteMap.values());
          setAdmins(list);
          writeStorage(LS_KEYS.ADMINS, list);

          // Sync currently active staff session if modified or deactivated remotely
          const currentActive = activeAdminRef.current;
          if (currentActive) {
            const matched = remoteMap.get(currentActive.id);
            if (!matched || !matched.active) {
              setActiveAdmin(null);
            } else if (
              matched.updatedAt !== currentActive.updatedAt ||
              matched.role !== currentActive.role ||
              matched.nama !== currentActive.nama
            ) {
              setActiveAdmin(matched);
            }
          }
        }
        if (!snap.metadata.fromCache || !isOffline) {
          markSyncedNow();
        }
      },
      (err) => {
        captureFirestoreError(err, OperationType.LIST, 'admins');
      }
    );
    unsubs.push(unsubAdmins);

    // 2. Students real-time listener
    const unsubStudents = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        if (cancelled) return;
        const remoteMap = new Map<string, Student>();
        snap.docs.forEach((d) => {
          const st = d.data() as Student;
          remoteMap.set(st.nis || d.id, st);
        });
        if (isSyncInFlightRef.current) {
          studentsRef.current.forEach((local) => {
            const remote = remoteMap.get(local.nis);
            if (!remote || local.updatedAt > (remote.updatedAt || '')) {
              remoteMap.set(local.nis, local);
            }
          });
        }
        if (!snap.empty || Boolean(lastSyncedAtRef.current)) {
          const list = Array.from(remoteMap.values());
          setStudents(list);
          writeStorage(LS_KEYS.STUDENTS, list);
        }
        if (!snap.metadata.fromCache || !isOffline) {
          markSyncedNow();
        }
      },
      (err) => {
        captureFirestoreError(err, OperationType.LIST, 'students');
      }
    );
    unsubs.push(unsubStudents);

    // 3. Attendances real-time listener
    const unsubAttendances = onSnapshot(
      collection(db, 'attendances'),
      (snap) => {
        if (cancelled) return;
        const remoteMap = new Map<string, AttendanceRecord>();
        snap.docs.forEach((d) => {
          const att = d.data() as AttendanceRecord;
          remoteMap.set(att.id || d.id, att);
        });
        if (isSyncInFlightRef.current) {
          attendancesRef.current.forEach((local) => {
            const remote = remoteMap.get(local.id);
            if (!remote || local.updatedAt > (remote.updatedAt || '')) {
              remoteMap.set(local.id, local);
            }
          });
        }
        const list = Array.from(remoteMap.values());
        setAttendances(list);
        writeStorage(LS_KEYS.ATTENDANCES, list);
        if (!snap.metadata.fromCache || !isOffline) {
          markSyncedNow();
        }
      },
      (err) => {
        captureFirestoreError(err, OperationType.LIST, 'attendances');
      }
    );
    unsubs.push(unsubAttendances);

    // 4. Admin logs real-time listener
    const unsubLogs = onSnapshot(
      collection(db, 'admin_logs'),
      (snap) => {
        if (cancelled) return;
        const list = snap.docs
          .map((d) => d.data() as AdminLog)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, 500);
        setAdminLogs(list);
        writeStorage(LS_KEYS.LOGS, list);
      },
      (err) => {
        captureFirestoreError(err, OperationType.LIST, 'admin_logs');
      }
    );
    unsubs.push(unsubLogs);

    // 5. School settings real-time listener
    const unsubSettings = onSnapshot(
      doc(db, 'school_settings', 'main'),
      (snap) => {
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as SchoolSettings;
          if (
            isSyncInFlightRef.current &&
            settingsRef.current.updatedAt > (data.updatedAt || '')
          ) {
            return;
          }
          setSettings(data);
          writeStorage(LS_KEYS.SETTINGS, data);
        }
      },
      (err) => {
        captureFirestoreError(err, OperationType.GET, 'school_settings/main');
      }
    );
    unsubs.push(unsubSettings);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [isOffline, captureFirestoreError, markSyncedNow, syncNowToFirestore]);

  const addAdminLog = useCallback(
    async (action: string, detail: string, actor?: AdminAccount | null) => {
      const targetActor = actor ?? activeAdmin;
      if (!targetActor) return;
      const nowIso = new Date().toISOString();
      const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const entry = sanitizeAdminLogForCloud({
        id: logId,
        adminId: targetActor.id,
        adminName: targetActor.nama,
        adminRole: targetActor.role,
        action,
        detail,
        timestamp: nowIso,
      });

      setAdminLogs((prev) => {
        const next = [entry, ...prev].slice(0, 500);
        writeStorage(LS_KEYS.LOGS, next);
        return next;
      });

      if (isOnlineNow()) {
        try {
          await setDoc(doc(db, 'admin_logs', entry.id), entry);
          markSyncedNow();
        } catch (err) {
          captureFirestoreError(err, OperationType.CREATE, `admin_logs/${entry.id}`);
        }
      }
    },
    [activeAdmin, captureFirestoreError, markSyncedNow]
  );

  const loginWithCredentials = useCallback(
    (identifier: string, password: string): { ok: boolean; error?: string } => {
      const cleanId = identifier.trim().toLowerCase();
      const cleanPw = password.trim();
      if (!cleanId || !cleanPw) {
        return { ok: false, error: 'Username/Email dan Kata Sandi wajib diisi.' };
      }

      const found = admins.find(
        (a) => a.username.toLowerCase() === cleanId || a.email.toLowerCase() === cleanId
      );
      if (!found) {
        return { ok: false, error: 'Akun petugas tidak ditemukan dalam database.' };
      }
      if (!found.active) {
        return { ok: false, error: 'Akun ini sedang dinonaktifkan oleh Admin Super.' };
      }
      if (found.password !== cleanPw && !(found.password === '109109' && cleanPw === '109')) {
        return { ok: false, error: 'Kata sandi atau PIN yang dimasukkan salah.' };
      }

      const normalized = sanitizeAdminForCloud(found);
      setActiveAdmin(normalized);
      setActiveDate(getTodayWib());
      void addAdminLog('LOGIN', `Masuk menggunakan kredensial (${normalized.username})`, normalized);
      return { ok: true };
    },
    [admins, addAdminLog]
  );

  const loginWithSelectedAdmin = useCallback(
    (adminId: string, password: string): { ok: boolean; error?: string } => {
      const cleanPw = password.trim();
      if (!cleanPw) {
        return { ok: false, error: 'Kata sandi / PIN wajib diisi.' };
      }
      const found = admins.find((a) => a.id === adminId);
      if (!found) {
        return { ok: false, error: 'Profil petugas tidak ditemukan.' };
      }
      if (!found.active) {
        return { ok: false, error: 'Akun petugas ini berstatus nonaktif.' };
      }
      if (found.password !== cleanPw && !(found.password === '109109' && cleanPw === '109')) {
        return { ok: false, error: 'Kata sandi / PIN tidak sesuai untuk akun ini.' };
      }
      const normalized = sanitizeAdminForCloud(found);
      setActiveAdmin(normalized);
      setActiveDate(getTodayWib());
      void addAdminLog(
        'LOGIN',
        `Masuk melalui verifikasi profil (${normalized.username})`,
        normalized
      );
      return { ok: true };
    },
    [admins, addAdminLog]
  );

  const logout = useCallback(async () => {
    if (activeAdmin) {
      await addAdminLog('LOGOUT', `Keluar dari sesi (${activeAdmin.username})`, activeAdmin);
    }
    setActiveAdmin(null);
    setActiveDate(getTodayWib());
    setSyncError(null);
  }, [activeAdmin, addAdminLog]);

  const saveStudent = useCallback(
    async (student: Student) => {
      const clean = sanitizeStudentForCloud({
        ...student,
        updatedAt: new Date().toISOString(),
      });
      setStudents((prev) => {
        const idx = prev.findIndex((s) => s.nis === clean.nis);
        const next = idx >= 0 ? prev.map((s, i) => (i === idx ? clean : s)) : [...prev, clean];
        writeStorage(LS_KEYS.STUDENTS, next);
        return next;
      });

      if (isOnlineNow()) {
        try {
          await setDoc(doc(db, 'students', clean.nis), clean, { merge: true });
          markSyncedNow();
        } catch (err) {
          captureFirestoreError(err, OperationType.WRITE, `students/${clean.nis}`);
        }
      }
    },
    [captureFirestoreError, markSyncedNow]
  );

  const bulkSaveStudents = useCallback(
    async (list: Student[]) => {
      const nowIso = new Date().toISOString();
      const cleaned = list.map((s) => sanitizeStudentForCloud({ ...s, updatedAt: nowIso }));

      setStudents((prev) => {
        const map = new Map<string, Student>();
        prev.forEach((s) => map.set(s.nis, s));
        cleaned.forEach((s) => map.set(s.nis, s));
        const next = Array.from(map.values());
        writeStorage(LS_KEYS.STUDENTS, next);
        return next;
      });

      if (isOnlineNow()) {
        try {
          for (let i = 0; i < cleaned.length; i += 400) {
            const batch = writeBatch(db);
            cleaned.slice(i, i + 400).forEach((s) => {
              batch.set(doc(db, 'students', s.nis), s, { merge: true });
            });
            await batch.commit();
          }
          markSyncedNow();
        } catch (err) {
          captureFirestoreError(err, OperationType.WRITE, 'students');
        }
      }
    },
    [captureFirestoreError, markSyncedNow]
  );

  const replaceAllStudents = useCallback(
    async (list: Student[]) => {
      const nowIso = new Date().toISOString();
      const dedupMap = new Map<string, Student>();
      list.forEach((s) => {
        const clean = sanitizeStudentForCloud({ ...s, updatedAt: nowIso });
        if (!dedupMap.has(clean.nis)) {
          dedupMap.set(clean.nis, clean);
        }
      });
      const cleaned = Array.from(dedupMap.values());
      const keepIds = new Set(cleaned.map((s) => s.nis));

      const localIdsToDelete = studentsRef.current
        .map((s) => sanitizeStudentId(s.nis))
        .filter((id) => !keepIds.has(id));

      setStudents(cleaned);
      writeStorage(LS_KEYS.STUDENTS, cleaned);

      if (isOnlineNow()) {
        try {
          const deleteIds = new Set<string>(localIdsToDelete);
          try {
            const remoteSnap = await getDocs(collection(db, 'students'));
            remoteSnap.docs.forEach((d) => {
              if (!keepIds.has(d.id)) {
                deleteIds.add(d.id);
              }
            });
          } catch {
            // Fall back to local known IDs if remote list temporarily fails
          }

          const ops: Array<{ type: 'set'; student: Student } | { type: 'del'; id: string }> = [
            ...Array.from(deleteIds).map((id) => ({ type: 'del' as const, id })),
            ...cleaned.map((student) => ({ type: 'set' as const, student })),
          ];

          for (let i = 0; i < ops.length; i += 400) {
            const batch = writeBatch(db);
            ops.slice(i, i + 400).forEach((op) => {
              if (op.type === 'del') {
                batch.delete(doc(db, 'students', op.id));
              } else {
                batch.set(doc(db, 'students', op.student.nis), op.student);
              }
            });
            await batch.commit();
          }
          markSyncedNow();
        } catch (err) {
          captureFirestoreError(err, OperationType.WRITE, 'students');
        }
      }
    },
    [captureFirestoreError, markSyncedNow]
  );

  const deleteStudent = useCallback(
    async (nis: string) => {
      const cleanNis = sanitizeStudentId(nis);
      setStudents((prev) => {
        const next = prev.filter((s) => s.nis !== nis && s.nis !== cleanNis);
        writeStorage(LS_KEYS.STUDENTS, next);
        return next;
      });

      if (isOnlineNow()) {
        try {
          await deleteDoc(doc(db, 'students', cleanNis));
          markSyncedNow();
        } catch (err) {
          captureFirestoreError(err, OperationType.DELETE, `students/${cleanNis}`);
        }
      }
    },
    [captureFirestoreError, markSyncedNow]
  );

  const bulkDeleteStudents = useCallback(
    async (nisList: string[]) => {
      if (nisList.length === 0) return;
      const rawSet = new Set(nisList);
      const cleanSet = new Set(nisList.map((n) => sanitizeStudentId(n)));

      setStudents((prev) => {
        const next = prev.filter(
          (s) => !rawSet.has(s.nis) && !cleanSet.has(sanitizeStudentId(s.nis))
        );
        writeStorage(LS_KEYS.STUDENTS, next);
        return next;
      });

      if (isOnlineNow()) {
        try {
          const ids = Array.from(cleanSet);
          for (let i = 0; i < ids.length; i += 400) {
            const batch = writeBatch(db);
            ids.slice(i, i + 400).forEach((id) => {
              batch.delete(doc(db, 'students', id));
            });
            await batch.commit();
          }
          markSyncedNow();
        } catch (err) {
          captureFirestoreError(err, OperationType.DELETE, 'students');
        }
      }
    },
    [captureFirestoreError, markSyncedNow]
  );

  const recordAttendance = useCallback(
    async (record: AttendanceRecord) => {
      const clean = sanitizeAttendanceForCloud({
        ...record,
        updatedAt: new Date().toISOString(),
      });
      setAttendances((prev) => {
        const idx = prev.findIndex((a) => a.id === clean.id);
        const next = idx >= 0 ? prev.map((a, i) => (i === idx ? clean : a)) : [...prev, clean];
        writeStorage(LS_KEYS.ATTENDANCES, next);
        return next;
      });

      if (isOnlineNow()) {
        try {
          await setDoc(doc(db, 'attendances', clean.id), clean, { merge: true });
          markSyncedNow();
        } catch (err) {
          captureFirestoreError(err, OperationType.WRITE, `attendances/${clean.id}`);
        }
      }
    },
    [captureFirestoreError, markSyncedNow]
  );

  const bulkRecordAttendance = useCallback(
    async (records: AttendanceRecord[]) => {
      const nowIso = new Date().toISOString();
      const cleaned = records.map((r) => sanitizeAttendanceForCloud({ ...r, updatedAt: nowIso }));

      setAttendances((prev) => {
        const map = new Map<string, AttendanceRecord>();
        prev.forEach((a) => map.set(a.id, a));
        cleaned.forEach((a) => map.set(a.id, a));
        const next = Array.from(map.values());
        writeStorage(LS_KEYS.ATTENDANCES, next);
        return next;
      });

      if (isOnlineNow()) {
        try {
          for (let i = 0; i < cleaned.length; i += 400) {
            const batch = writeBatch(db);
            cleaned.slice(i, i + 400).forEach((r) => {
              batch.set(doc(db, 'attendances', r.id), r, { merge: true });
            });
            await batch.commit();
          }
          markSyncedNow();
        } catch (err) {
          captureFirestoreError(err, OperationType.WRITE, 'attendances');
        }
      }
    },
    [captureFirestoreError, markSyncedNow]
  );

  const clearDateAttendances = useCallback(
    async (date: string) => {
      const toDelete = attendances.filter((a) => a.date === date);
      setAttendances((prev) => {
        const next = prev.filter((a) => a.date !== date);
        writeStorage(LS_KEYS.ATTENDANCES, next);
        return next;
      });

      if (isOnlineNow() && toDelete.length > 0) {
        try {
          for (let i = 0; i < toDelete.length; i += 400) {
            const batch = writeBatch(db);
            toDelete.slice(i, i + 400).forEach((a) => {
              batch.delete(doc(db, 'attendances', sanitizeId(a.id, 'att')));
            });
            await batch.commit();
          }
          markSyncedNow();
        } catch (err) {
          captureFirestoreError(err, OperationType.DELETE, 'attendances');
        }
      }
    },
    [attendances, captureFirestoreError, markSyncedNow]
  );

  const clearAllAttendances = useCallback(async () => {
    const toDelete = [...attendances];
    setAttendances([]);
    writeStorage(LS_KEYS.ATTENDANCES, []);

    if (isOnlineNow() && toDelete.length > 0) {
      try {
        for (let i = 0; i < toDelete.length; i += 400) {
          const batch = writeBatch(db);
          toDelete.slice(i, i + 400).forEach((a) => {
            batch.delete(doc(db, 'attendances', sanitizeId(a.id, 'att')));
          });
          await batch.commit();
        }
        markSyncedNow();
      } catch (err) {
        captureFirestoreError(err, OperationType.DELETE, 'attendances');
      }
    }
  }, [attendances, captureFirestoreError, markSyncedNow]);

  const saveAdmin = useCallback(
    async (admin: AdminAccount) => {
      const clean = sanitizeAdminForCloud({
        ...admin,
        updatedAt: new Date().toISOString(),
      });

      setAdmins((prev) => {
        const idx = prev.findIndex((a) => a.id === clean.id);
        const next = idx >= 0 ? prev.map((a, i) => (i === idx ? clean : a)) : [...prev, clean];
        writeStorage(LS_KEYS.ADMINS, next);
        return next;
      });
      if (activeAdmin?.id === clean.id) {
        setActiveAdmin(clean);
      }

      if (isOnlineNow()) {
        try {
          await setDoc(doc(db, 'admins', clean.id), clean, { merge: true });
          markSyncedNow();
        } catch (err) {
          captureFirestoreError(err, OperationType.WRITE, `admins/${clean.id}`);
        }
      }
    },
    [activeAdmin, captureFirestoreError, markSyncedNow]
  );

  const deleteAdmin = useCallback(
    async (adminId: string) => {
      setAdmins((prev) => {
        const next = prev.filter((a) => a.id !== adminId);
        writeStorage(LS_KEYS.ADMINS, next);
        return next;
      });

      if (isOnlineNow()) {
        try {
          await deleteDoc(doc(db, 'admins', sanitizeId(adminId, 'adm')));
          markSyncedNow();
        } catch (err) {
          captureFirestoreError(err, OperationType.DELETE, `admins/${adminId}`);
        }
      }
    },
    [captureFirestoreError, markSyncedNow]
  );

  const saveSettings = useCallback(
    async (nextSettings: SchoolSettings) => {
      const clean = sanitizeSettingsForCloud({
        ...nextSettings,
        updatedAt: new Date().toISOString(),
      });
      setSettings(clean);
      writeStorage(LS_KEYS.SETTINGS, clean);

      if (isOnlineNow()) {
        try {
          await setDoc(doc(db, 'school_settings', 'main'), clean, { merge: true });
          markSyncedNow();
        } catch (err) {
          captureFirestoreError(err, OperationType.WRITE, 'school_settings/main');
        }
      }
    },
    [captureFirestoreError, markSyncedNow]
  );

  const restoreBackup = useCallback(
    async (payload: {
      students?: Student[];
      attendances?: AttendanceRecord[];
      settings?: SchoolSettings;
    }) => {
      if (Array.isArray(payload.students)) {
        await bulkSaveStudents(payload.students);
      }
      if (Array.isArray(payload.attendances)) {
        await bulkRecordAttendance(payload.attendances);
      }
      if (payload.settings) {
        await saveSettings(payload.settings);
      }
    },
    [bulkSaveStudents, bulkRecordAttendance, saveSettings]
  );

  return (
    <AppDataContext.Provider
      value={{
        students,
        attendances,
        admins,
        adminLogs,
        settings,
        activeAdmin,
        cloudConnected,
        isOffline,
        syncStatus,
        lastSyncedAt,
        syncError,
        activeDate,
        setActiveDate,
        loginWithCredentials,
        loginWithSelectedAdmin,
        syncNowToFirestore,
        clearSyncError,
        logout,
        saveStudent,
        bulkSaveStudents,
        replaceAllStudents,
        deleteStudent,
        bulkDeleteStudents,
        recordAttendance,
        bulkRecordAttendance,
        clearDateAttendances,
        clearAllAttendances,
        saveAdmin,
        deleteAdmin,
        saveSettings,
        addAdminLog,
        restoreBackup,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
};

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
