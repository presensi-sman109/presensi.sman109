import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  DatabaseBackup,
  Download,
  RefreshCw,
  RotateCcw,
  Save,
  School,
  Search,
  Trash2,
  Upload,
  Users,
  Volume2,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { getTodayWib, sortClassesAcademic, speakAnnouncement } from '../lib/utils';
import type { AttendanceRecord, SchoolSettings, Student, TtsVoice } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

const VOICE_OPTIONS: Array<{ id: TtsVoice; desc: string }> = [
  { id: 'Kore', desc: 'Kore — Ramah & Jelas (Standar)' },
  { id: 'Puck', desc: 'Puck — Energik & Cerah' },
  { id: 'Zephyr', desc: 'Zephyr — Tenang & Natural' },
  { id: 'Fenrir', desc: 'Fenrir — Tegas & Berwibawa' },
  { id: 'Charon', desc: 'Charon — Formal & Stabil' },
];

export const SettingsTab: React.FC = () => {
  const {
    students,
    attendances,
    settings,
    activeDate,
    firebaseUser,
    isOffline,
    syncStatus,
    lastSyncedAt,
    connectCloudSync,
    syncNowToFirestore,
    saveSettings,
    restoreBackup,
    clearDateAttendances,
    clearAllAttendances,
    addAdminLog,
  } = useAppData();

  const [draft, setDraft] = useState<SchoolSettings>(settings);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'today' | 'all' | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [classSearch, setClassSearch] = useState('');

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const photoCount = students.filter((s) => Boolean(s.foto)).length;

  const { classesFromStudents, classCounts } = useMemo(() => {
    const counts: Record<string, number> = {};
    students.forEach((st) => {
      const cls = (st.kelas || '').trim();
      if (!cls) return;
      counts[cls] = (counts[cls] || 0) + 1;
    });
    return {
      classesFromStudents: sortClassesAcademic(Object.keys(counts)),
      classCounts: counts,
    };
  }, [students]);

  const filteredClasses = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    if (!q) return classesFromStudents;
    return classesFromStudents.filter((cls) => cls.toLowerCase().includes(q));
  }, [classesFromStudents, classSearch]);

  const staleClassKeys = useMemo(() => {
    const activeSet = new Set(classesFromStudents);
    const defaults = new Set(['X', 'XI', 'XII']);
    return Object.keys(draft.homeroomTeachers || {}).filter(
      (k) => !defaults.has(k) && !activeSet.has(k)
    );
  }, [classesFromStudents, draft.homeroomTeachers]);

  const handleCleanupStaleHomerooms = () => {
    if (staleClassKeys.length === 0) return;
    const nextMap = { ...(draft.homeroomTeachers || {}) };
    staleClassKeys.forEach((k) => {
      delete nextMap[k];
    });
    setDraft({ ...draft, homeroomTeachers: nextMap });
    setNotice(
      `${staleClassKeys.length} entri wali kelas yang tidak ada di Data Murid telah dibersihkan dari draft. Klik Simpan Pengaturan untuk menerapkan.`
    );
  };

  const handleSetHomeroom = (key: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      homeroomTeachers: {
        ...(prev.homeroomTeachers || {}),
        [key]: value,
      },
    }));
  };

  const handleManualSync = async () => {
    setSyncBusy(true);
    const res = firebaseUser?.emailVerified
      ? await syncNowToFirestore()
      : await connectCloudSync();
    setSyncBusy(false);
    if (res.ok) {
      setNotice('Data murid, pas foto, presensi, dan pengaturan berhasil disinkronkan dengan Cloud Firestore.');
    } else if (res.error) {
      setNotice(res.error);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedHomerooms: Record<string, string> = {};
    Object.entries(draft.homeroomTeachers || {}).forEach(([k, v]) => {
      const trimmed = String(v || '').trim().slice(0, 120);
      if (trimmed || k === 'X' || k === 'XI' || k === 'XII') {
        cleanedHomerooms[k.slice(0, 24)] = trimmed;
      }
    });
    const nextSettings: SchoolSettings = {
      ...draft,
      homeroomTeachers: cleanedHomerooms,
    };
    await saveSettings(nextSettings);
    await addAdminLog(
      'UBAH_PENGATURAN',
      `Memperbarui identitas sekolah, daftar wali kelas (${classesFromStudents.length} kelas), dan pengaturan suara TTS`
    );
    setNotice('Pengaturan sekolah, daftar wali kelas, & suara berhasil disimpan permanen.');
  };

  const handleTestVoice = () => {
    void speakAnnouncement(
      `Selamat datang di ${draft.schoolName}. Sistem presensi dan pengumuman suara aktif menggunakan karakter suara ${draft.ttsVoice}.`,
      draft.ttsVoice,
      true
    );
  };

  const handleDownloadJsonBackup = () => {
    const payload = {
      school: settings.schoolName,
      exportedAt: new Date().toISOString(),
      students,
      attendances,
      settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cadangan_Database_SMAN109_${getTodayWib()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    void addAdminLog('CADANGAN_JSON', 'Mengunduh cadangan lengkap database JSON');
  };

  const handleRestoreJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        students?: Student[];
        attendances?: AttendanceRecord[];
        settings?: SchoolSettings;
      };
      await restoreBackup(parsed);
      await addAdminLog('PULIHKAN_JSON', `Memulihkan database dari file ${file.name}`);
      setNotice('Database berhasil dipulihkan dari file cadangan JSON.');
    } catch {
      setNotice('File JSON cadangan tidak valid atau rusak.');
    }
  };

  const executeReset = async () => {
    if (confirmAction === 'today') {
      await clearDateAttendances(activeDate);
      await addAdminLog('RESET_HARIAN', `Menghapus data presensi tanggal ${activeDate}`);
      setNotice(`Presensi tanggal ${activeDate} telah direset.`);
    } else if (confirmAction === 'all') {
      await clearAllAttendances();
      await addAdminLog('RESET_SEMUA', 'Menghapus seluruh riwayat presensi dari database');
      setNotice('Seluruh riwayat presensi telah dihapus.');
    }
    setConfirmAction(null);
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex justify-between items-center">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="underline">
            Tutup
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* School Identity & Voice Settings */}
        <form
          onSubmit={(e) => void handleSaveSettings(e)}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-5 text-xs"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <School className="w-5 h-5 text-blue-700" />
              Identitas Sekolah, Pejabat, & Pengaturan Suara
            </h2>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold inline-flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              Simpan Pengaturan
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Sekolah</label>
              <input
                type="text"
                required
                value={draft.schoolName}
                onChange={(e) => setDraft({ ...draft, schoolName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">NPSN</label>
              <input
                type="text"
                value={draft.npsn}
                onChange={(e) => setDraft({ ...draft, npsn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Alamat Sekolah</label>
              <input
                type="text"
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tahun Pelajaran Aktif
              </label>
              <input
                type="text"
                value={draft.academicYear}
                onChange={(e) => setDraft({ ...draft, academicYear: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nama Kepala Sekolah</label>
              <input
                type="text"
                value={draft.principalName}
                onChange={(e) => setDraft({ ...draft, principalName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">NIP Kepala Sekolah</label>
              <input
                type="text"
                value={draft.principalNip}
                onChange={(e) => setDraft({ ...draft, principalNip: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div className="sm:col-span-2 pt-3 border-t border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-700" />
                    Wali Kelas Sesuai Data Murid ({classesFromStudents.length} Kelas)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Daftar kelas otomatis mengikuti Data Murid. Jika dikosongkan, laporan memakai
                    wali kelas cadangan per tingkat (X / XI / XII).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {staleClassKeys.length > 0 && (
                    <button
                      type="button"
                      onClick={handleCleanupStaleHomerooms}
                      className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-semibold"
                    >
                      Bersihkan {staleClassKeys.length} Kelas Lama
                    </button>
                  )}
                  {classesFromStudents.length > 6 && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={classSearch}
                        onChange={(e) => setClassSearch(e.target.value)}
                        placeholder="Cari kelas..."
                        className="pl-7 pr-2.5 py-1 border border-slate-300 rounded-lg text-xs w-32"
                      />
                    </div>
                  )}
                </div>
              </div>

              {classesFromStudents.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-center">
                  Belum ada kelas di Data Murid. Tambahkan atau impor murid terlebih dahulu pada menu
                  Data Murid.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
                  {filteredClasses.map((kelas) => {
                    const gradePrefix = kelas.split(/[-\s_]/)[0]?.trim().toUpperCase();
                    const fallbackTeacher = gradePrefix
                      ? draft.homeroomTeachers?.[gradePrefix]
                      : '';
                    return (
                      <div
                        key={kelas}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="font-bold text-slate-900">
                            Wali Kelas {kelas}
                          </label>
                          <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                            {classCounts[kelas] || 0} Murid
                          </span>
                        </div>
                        <input
                          type="text"
                          value={draft.homeroomTeachers?.[kelas] || ''}
                          onChange={(e) => handleSetHomeroom(kelas, e.target.value)}
                          placeholder={
                            fallbackTeacher
                              ? `Default ${gradePrefix}: ${fallbackTeacher}`
                              : 'Nama Wali Kelas (NIP. ...)'
                          }
                          maxLength={120}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Fallback defaults per grade level */}
              <div className="pt-2 border-t border-slate-100">
                <div className="text-[11px] font-semibold text-slate-600 mb-2">
                  Wali Kelas Cadangan per Tingkat (Digunakan jika kelas spesifik belum diisi)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(['X', 'XI', 'XII'] as const).map((tingkat) => (
                    <div key={tingkat}>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Default Tingkat {tingkat}
                      </label>
                      <input
                        type="text"
                        value={draft.homeroomTeachers?.[tingkat] || ''}
                        onChange={(e) => handleSetHomeroom(tingkat, e.target.value)}
                        placeholder={`Wali Tingkat ${tingkat}`}
                        maxLength={120}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-[11px]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Voice Settings */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-blue-700" />
              Pengumuman Suara Cerdas (Gemini TTS)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Pilihan Karakter Suara
                </label>
                <select
                  value={draft.ttsVoice}
                  onChange={(e) => setDraft({ ...draft, ttsVoice: e.target.value as TtsVoice })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold"
                >
                  {VOICE_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.desc}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleTestVoice}
                className="px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5"
              >
                <Volume2 className="w-4 h-4 text-blue-700" />
                Uji Suara
              </button>
            </div>
            <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.ttsEnabled}
                onChange={(e) => setDraft({ ...draft, ttsEnabled: e.target.checked })}
                className="w-4 h-4 accent-blue-700"
              />
              Aktifkan pengumuman suara otomatis saat pemindaian kartu
            </label>
          </div>
        </form>

        {/* Cloud Sync, Backup, Restore & Safe Reset */}
        <div className="lg:col-span-5 space-y-6 text-xs">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {isOffline ? (
                  <CloudOff className="w-5 h-5 text-amber-600" />
                ) : (
                  <Cloud className="w-5 h-5 text-blue-700" />
                )}
                Sinkronisasi Real-Time Firestore
              </h3>
              <span
                className={`px-2.5 py-0.5 rounded-md border text-[11px] font-semibold ${
                  isOffline
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : firebaseUser?.emailVerified
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                {isOffline
                  ? 'Offline'
                  : firebaseUser?.emailVerified
                  ? 'Tersinkron Realtime'
                  : 'Mode Lokal'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-slate-700">
              <div className="flex items-center justify-between gap-2">
                <span>Project Google Cloud:</span>
                <span className="font-mono font-semibold text-slate-900 truncate">
                  {firebaseConfig.projectId}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Firestore Database:</span>
                <span className="font-mono text-[11px] text-slate-700 truncate max-w-[190px]">
                  {firebaseConfig.firestoreDatabaseId}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Akun Cloud Google:</span>
                <span className="font-mono font-semibold text-slate-900 truncate">
                  {firebaseUser?.email || 'Belum Terhubung'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Koleksi Tersinkron:</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {students.length} Murid ({photoCount} Foto) · {attendances.length} Presensi
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Sinkronisasi Terakhir:</span>
                <span className="font-mono text-slate-600 tabular-nums">
                  {lastSyncedAt
                    ? new Date(lastSyncedAt).toLocaleTimeString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                      }) + ' WIB'
                    : 'Menunggu koneksi Cloud'}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={syncBusy || isOffline}
              onClick={() => void handleManualSync()}
              className={`w-full py-2.5 px-4 rounded-xl font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 ${
                firebaseUser?.emailVerified
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-blue-700 hover:bg-blue-800 text-white'
              }`}
            >
              {syncBusy || syncStatus === 'syncing' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : firebaseUser?.emailVerified ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              {firebaseUser?.emailVerified
                ? 'Sinkronkan & Gabungkan Data Sekarang'
                : 'Hubungkan Google & Sinkronkan ke Firestore'}
            </button>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Aplikasi siap dipublish gratis melalui Google AI Studio / Cloud Run (Free Tier)
              dengan database Firestore paket gratis (Spark). Klik tombol di atas untuk memastikan
              seluruh data lokal & foto murid sudah tersimpan di Cloud sebelum dipublikasikan.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <DatabaseBackup className="w-5 h-5 text-blue-700" />
              Pencadangan & Pemulihan Database JSON
            </h3>
            <p className="text-slate-500 leading-relaxed">
              Unduh seluruh data murid, pas foto, riwayat presensi, dan konfigurasi sekolah dalam
              satu berkas JSON, atau pulihkan kapan saja.
            </p>

            <button
              type="button"
              onClick={handleDownloadJsonBackup}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Pencadangan JSON Lengkap ({students.length} Murid · {attendances.length} Presensi)
            </button>

            <div className="pt-3 border-t border-slate-200">
              <label className="block font-semibold text-slate-700 mb-1.5">
                Pulihkan Database dari File JSON
              </label>
              <label className="flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer font-semibold text-slate-700">
                <Upload className="w-4 h-4 text-blue-700" />
                <span>Pilih File Cadangan (.json)</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => void handleRestoreJson(e)}
                />
              </label>
            </div>
          </div>

          <div className="bg-white border border-rose-200 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              Reset Data Presensi
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Gunakan secara hati-hati untuk mengulang pencatatan tanggal aktif atau membersihkan
              riwayat presensi lama saat pergantian tahun ajaran.
            </p>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setConfirmAction('today')}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold inline-flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Presensi Tanggal ({activeDate})
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction('all')}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold inline-flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Hapus Seluruh Riwayat Presensi
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl text-center">
            <AlertTriangle className="w-10 h-10 text-rose-600 mx-auto" />
            <h4 className="font-bold text-base text-slate-900">Konfirmasi Penghapusan Data</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              {confirmAction === 'today'
                ? `Seluruh catatan presensi pada tanggal ${activeDate} akan dihapus permanen.`
                : 'Seluruh riwayat presensi dari semua tanggal akan dihapus permanen. Data induk murid tetap aman.'}
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void executeReset()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
