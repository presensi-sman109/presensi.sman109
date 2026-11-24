import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Html5Qrcode } from 'html5-qrcode';
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardList,
  Keyboard,
  RefreshCw,
  ScanLine,
  Users,
  VideoOff,
  XCircle,
  Zap,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import {
  formatIndonesianDate,
  getTimeWib,
  getTodayWib,
  playTone,
  speakAnnouncement,
} from '../lib/utils';
import type { AttendanceRecord, AttendanceStatus, ScanFeedback } from '../types';
import { BulkDateAttendanceModal } from './BulkDateAttendanceModal';
import { StudentAvatar } from './SchoolLogo';

export const ScanTab: React.FC = () => {
  const {
    students,
    attendances,
    settings,
    activeAdmin,
    activeDate,
    setActiveDate,
    recordAttendance,
    addAdminLog,
  } = useAppData();

  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [detectedCameras, setDetectedCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('auto_environment');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [autoBarcodeEnabled, setAutoBarcodeEnabled] = useState(true);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ code: string; ts: number }>({ code: '', ts: 0 });
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const cameraGenRef = useRef(0);
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputBurstRef = useRef<{ lastTs: number; fastCount: number; pasted: boolean }>({
    lastTs: 0,
    fastCount: 0,
    pasted: false,
  });

  const isSuperAdmin = activeAdmin?.role === 'super_admin';
  const todayWib = getTodayWib();
  const isCustomDate = activeDate !== todayWib;

  const processScanCode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;

      // Debounce rapid duplicate frame reads from camera (2.5 seconds)
      const nowMs = Date.now();
      if (lastScanRef.current.code === code && nowMs - lastScanRef.current.ts < 2500) {
        return;
      }
      lastScanRef.current = { code, ts: nowMs };

      const student = students.find(
        (s) => s.nis.toLowerCase() === code.toLowerCase() || s.id.toLowerCase() === code.toLowerCase()
      );

      if (!student) {
        playTone('error');
        setFeedback({
          type: 'error',
          title: 'Kartu Tidak Dikenal',
          detail: `Kode "${code}" tidak terdaftar pada database SMA Negeri 109 Jakarta.`,
        });
        if (settings.ttsEnabled) {
          void speakAnnouncement(
            'Maaf, kartu pelajar tidak terdaftar dalam sistem.',
            settings.ttsVoice,
            true
          );
        }
        return;
      }

      const existing = attendances.find(
        (a) => a.nis === student.nis && a.date === activeDate
      );

      if (existing) {
        playTone('duplicate');
        setFeedback({
          type: 'duplicate',
          title: `Sudah Presensi (${existing.status})`,
          detail: `${student.nama} (${student.kelas}) sudah tercatat pada ${existing.time} WIB.`,
          student,
          time: existing.time,
        });
        if (settings.ttsEnabled) {
          void speakAnnouncement(
            `${student.nama} kelas ${student.kelas} sudah melakukan presensi hari ini.`,
            settings.ttsVoice,
            true
          );
        }
        return;
      }

      const timeNow = getTimeWib();
      const record: AttendanceRecord = {
        id: `${student.nis}_${activeDate}`,
        nis: student.nis,
        nama: student.nama,
        kelas: student.kelas,
        date: activeDate,
        time: timeNow,
        status: 'Hadir',
        notes: isCustomDate ? `Scan tanggal khusus oleh ${activeAdmin?.nama || 'Super Admin'}` : '',
        recordedBy: activeAdmin?.nama || 'Petugas Piket',
        updatedAt: new Date().toISOString(),
      };

      await recordAttendance(record);
      await addAdminLog(
        'SCAN_ABSENSI',
        `Presensi Hadir: ${student.nama} (${student.kelas}) pada ${activeDate} ${timeNow} WIB`
      );

      playTone('success');
      try {
        confetti({
          particleCount: 45,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch {
        // Ignore confetti errors in headless tests
      }

      setFeedback({
        type: 'success',
        title: 'Presensi Berhasil Dicatat',
        detail: `${student.nama} · ${student.kelas} · ${timeNow} WIB`,
        student,
        time: timeNow,
      });

      if (settings.ttsEnabled) {
        void speakAnnouncement(
          `Selamat datang ${student.nama}, kelas ${student.kelas}. Presensi berhasil dicatat.`,
          settings.ttsVoice,
          true
        );
      }
    },
    [
      students,
      attendances,
      activeDate,
      isCustomDate,
      activeAdmin,
      settings.ttsEnabled,
      settings.ttsVoice,
      recordAttendance,
      addAdminLog,
    ]
  );

  const processScanCodeRef = useRef(processScanCode);
  useEffect(() => {
    processScanCodeRef.current = processScanCode;
  }, [processScanCode]);

  const safeStopScanner = useCallback(async (instance: Html5Qrcode | null) => {
    if (!instance) return;
    try {
      const state = typeof instance.getState === 'function' ? instance.getState() : 0;
      // 2 = SCANNING, 3 = PAUSED in html5-qrcode
      if (state === 2 || state === 3 || instance.isScanning) {
        await instance.stop();
      }
    } catch {
      // Ignore if scanner is already stopped or not running
    }
    try {
      instance.clear();
    } catch {
      // Ignore DOM clear errors on unmount
    }
  }, []);

  const refreshDetectedCameras = useCallback(async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (Array.isArray(devices)) {
        const formatted = devices.map((d, idx) => ({
          id: d.id,
          label: d.label?.trim() || `Kamera Terdeteksi ${idx + 1}`,
        }));
        setDetectedCameras(formatted);
      }
    } catch {
      // Ignore camera enumeration errors if permission not yet granted or unsupported
    }
  }, []);

  useEffect(() => {
    void refreshDetectedCameras();
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    const onDeviceChange = () => {
      void refreshDetectedCameras();
    };
    mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
    };
  }, [refreshDetectedCameras]);

  // Start / Restart / Stop Html5Qrcode camera
  const startCamera = useCallback(async () => {
    const gen = ++cameraGenRef.current;
    setCameraError(null);

    if (scannerRef.current) {
      const prev = scannerRef.current;
      scannerRef.current = null;
      await safeStopScanner(prev);
    }

    if (gen !== cameraGenRef.current) return;

    if (!cameraEnabled) {
      setCameraActive(false);
      return;
    }

    const container = document.getElementById('sman109-qr-reader');
    if (!container) return;

    try {
      const qr = new Html5Qrcode('sman109-qr-reader');
      const cameraConfig: string | { facingMode: 'environment' | 'user' } =
        selectedCameraId === 'auto_environment'
          ? { facingMode: 'environment' }
          : selectedCameraId === 'auto_user'
          ? { facingMode: 'user' }
          : selectedCameraId;

      await qr.start(
        cameraConfig,
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          void processScanCodeRef.current(decodedText);
        },
        () => {
          // Ignore per-frame decode misses
        }
      );
      if (gen !== cameraGenRef.current) {
        await safeStopScanner(qr);
        return;
      }
      scannerRef.current = qr;
      setCameraActive(true);
      void refreshDetectedCameras();
    } catch (err) {
      if (gen !== cameraGenRef.current) return;
      setCameraActive(false);
      const msg = err instanceof Error ? err.message : 'Kamera tidak tersedia';
      setCameraError(
        `Kamera tidak aktif (${msg}). Gunakan Barcode Gun USB atau ketik NIS manual di bawah.`
      );
    }
  }, [cameraEnabled, selectedCameraId, safeStopScanner, refreshDetectedCameras]);

  useEffect(() => {
    void startCamera();
    return () => {
      cameraGenRef.current += 1;
      const instance = scannerRef.current;
      scannerRef.current = null;
      void safeStopScanner(instance);
    };
  }, [startCamera, safeStopScanner]);

  const clearAutoSubmitTimer = useCallback(() => {
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearAutoSubmitTimer();
    };
  }, [clearAutoSubmitTimer]);

  const submitScannedCode = useCallback(
    (rawValue: string, keepFocus = true) => {
      clearAutoSubmitTimer();
      inputBurstRef.current = { lastTs: 0, fastCount: 0, pasted: false };
      const code = rawValue.trim();
      if (!code) return;
      void processScanCodeRef.current(code);
      setManualInput('');
      if (keepFocus) {
        manualInputRef.current?.focus();
      }
    },
    [clearAutoSubmitTimer]
  );

  // Global HID USB/Bluetooth barcode scanner listener (works even when NIS input is not focused)
  useEffect(() => {
    if (!autoBarcodeEnabled || bulkModalOpen) return;

    let buffer = '';
    let lastKeyTs = 0;
    let rapidCount = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const resetBuffer = () => {
      buffer = '';
      lastKeyTs = 0;
      rapidCount = 0;
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const flushBuffer = () => {
      const code = buffer.trim();
      const validBurst = code.length >= 3 && rapidCount >= 2;
      resetBuffer();
      if (validBurst) {
        void processScanCodeRef.current(code);
      }
    };

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.trim().length >= 3 && rapidCount >= 1) {
          e.preventDefault();
          const code = buffer.trim();
          resetBuffer();
          void processScanCodeRef.current(code);
        } else {
          resetBuffer();
        }
        return;
      }

      if (e.key.length !== 1) return;

      const now = Date.now();
      const delta = now - lastKeyTs;
      if (lastKeyTs > 0 && delta > 90) {
        buffer = e.key;
        rapidCount = 0;
      } else {
        if (buffer.length > 0 && delta <= 90) {
          rapidCount += 1;
        }
        buffer += e.key;
      }
      lastKeyTs = now;

      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(flushBuffer, 180);
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [autoBarcodeEnabled, bulkModalOpen]);

  const handleManualInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    setManualInput(nextValue);
    clearAutoSubmitTimer();

    if (!autoBarcodeEnabled) return;

    // Immediate submit if scanner/paste includes newline
    if (nextValue.includes('\n') || nextValue.includes('\r')) {
      submitScannedCode(nextValue);
      return;
    }

    const now = Date.now();
    const delta = now - inputBurstRef.current.lastTs;
    if (nextValue.length <= 1 || (inputBurstRef.current.lastTs > 0 && delta > 120)) {
      if (!inputBurstRef.current.pasted) {
        inputBurstRef.current.fastCount = 0;
      }
    } else if (inputBurstRef.current.lastTs > 0 && delta <= 120) {
      inputBurstRef.current.fastCount += 1;
    }
    inputBurstRef.current.lastTs = now;

    const trimmed = nextValue.trim();
    if (!trimmed) {
      inputBurstRef.current.pasted = false;
      return;
    }

    const isScannerBurst =
      inputBurstRef.current.pasted ||
      (trimmed.length >= 3 && inputBurstRef.current.fastCount >= 2);
    const isExactStudentMatch = students.some(
      (s) =>
        s.nis.toLowerCase() === trimmed.toLowerCase() ||
        s.id.toLowerCase() === trimmed.toLowerCase()
    );

    if (isScannerBurst) {
      autoSubmitTimerRef.current = setTimeout(() => {
        submitScannedCode(nextValue);
      }, 160);
    } else if (isExactStudentMatch) {
      autoSubmitTimerRef.current = setTimeout(() => {
        submitScannedCode(nextValue);
      }, 320);
    }
  };

  const handleManualInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || (e.key === 'Tab' && autoBarcodeEnabled && manualInput.trim().length > 0)) {
      e.preventDefault();
      submitScannedCode(manualInput);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitScannedCode(manualInput);
  };

  const todayLogs = useMemo(
    () =>
      attendances
        .filter((a) => a.date === activeDate)
        .sort((a, b) => b.time.localeCompare(a.time)),
    [attendances, activeDate]
  );

  const hadirCount = todayLogs.filter((a) => a.status === 'Hadir').length;

  const quickUpdateStatus = async (record: AttendanceRecord, status: AttendanceStatus) => {
    await recordAttendance({
      ...record,
      status,
      recordedBy: activeAdmin?.nama || record.recordedBy,
      updatedAt: new Date().toISOString(),
    });
    await addAdminLog(
      'UBAH_STATUS',
      `Mengubah status ${record.nama} (${record.date}) menjadi ${status}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Super Admin Active Date Banner */}
      {isSuperAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-blue-700 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Tanggal Presensi Aktif: {formatIndonesianDate(activeDate)}
              </h3>
              <p className="text-xs text-slate-500">
                {isCustomDate
                  ? 'Mode Tanggal Khusus aktif — pemindaian dan edit status otomatis tercatat ke tanggal ini.'
                  : 'Mode Hari Ini (Real-Time WIB). Super Admin dapat memilih tanggal lampau atau input massal.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={activeDate}
              onChange={(e) => setActiveDate(e.target.value || todayWib)}
              className="px-3 py-1.5 text-xs font-mono font-semibold border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {isCustomDate && (
              <button
                type="button"
                onClick={() => setActiveDate(todayWib)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 whitespace-nowrap"
              >
                Kembali ke Hari Ini
              </button>
            )}
            <button
              type="button"
              onClick={() => setBulkModalOpen(true)}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5" />
              Input Presensi Massal
            </button>
          </div>
        </div>
      )}

      {/* Main 2-Column Scanner & Live Log Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Scanner + USB Barcode Gun Input */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-blue-700" />
                Pemindai QR Code & Barcode Kartu Pelajar
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Dukung kamera langsung, barcode gun USB otomatis, dan input manual NIS siswa.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Pilih Jenis Kamera"
                  value={selectedCameraId}
                  onChange={(e) => {
                    setSelectedCameraId(e.target.value);
                    if (!cameraEnabled) setCameraEnabled(true);
                  }}
                  className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 max-w-[210px] truncate focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="auto_environment">Otomatis · Kamera Belakang</option>
                  <option value="auto_user">Otomatis · Kamera Depan</option>
                  {detectedCameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void refreshDetectedCameras()}
                  title="Deteksi ulang kamera yang terpasang"
                  className="p-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setCameraEnabled((prev) => !prev)}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  cameraEnabled
                    ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                    : 'bg-blue-700 border-blue-700 text-white hover:bg-blue-800'
                }`}
              >
                {cameraEnabled ? (
                  <>
                    <VideoOff className="w-3.5 h-3.5" />
                    Nonaktifkan Kamera
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5" />
                    Aktifkan Kamera
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Camera Viewport */}
          <div className="relative w-full max-w-lg mx-auto bg-slate-950 rounded-2xl overflow-hidden min-h-[290px] flex items-center justify-center border border-slate-800">
            <div id="sman109-qr-reader" className={cameraEnabled ? 'w-full' : 'hidden'} />
            {cameraEnabled && cameraActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-56 h-56 border-2 border-dashed border-sky-400/80 rounded-2xl flex items-end justify-center pb-3">
                  <span className="text-[11px] font-medium text-white bg-slate-950/75 px-2.5 py-1 rounded-md">
                    Arahkan QR / Barcode ke Bingkai
                  </span>
                </div>
              </div>
            )}
            {!cameraEnabled && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-300 gap-3">
                <VideoOff className="w-9 h-9 text-slate-400" />
                <div className="space-y-1 max-w-sm">
                  <p className="text-sm font-semibold text-white">Kamera Pemindai Dinonaktifkan</p>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Anda tetap dapat mencatat presensi menggunakan Barcode Gun USB atau mengetik NIS
                    siswa pada kolom di bawah.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCameraEnabled(true)}
                  className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Aktifkan Kamera
                </button>
              </div>
            )}
            {cameraEnabled && !cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-300 gap-3">
                {cameraError ? (
                  <>
                    <VideoOff className="w-9 h-9 text-slate-400" />
                    <p className="text-xs max-w-sm leading-relaxed text-slate-300">
                      {cameraError}
                    </p>
                    <button
                      type="button"
                      onClick={() => void startCamera()}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Aktifkan Kamera Lagi
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">Menyiapkan kamera pemindai...</p>
                )}
              </div>
            )}
          </div>

          {/* Manual / USB Barcode Gun Input */}
          <form onSubmit={handleManualSubmit} className="pt-4 border-t border-slate-200 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="manual-nis-input"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
              >
                <Keyboard className="w-3.5 h-3.5 text-slate-500" />
                Pemindai Barcode Gun USB / Input Manual NIS Siswa
              </label>
              <button
                type="button"
                onClick={() => {
                  clearAutoSubmitTimer();
                  setAutoBarcodeEnabled((prev) => !prev);
                }}
                aria-pressed={autoBarcodeEnabled}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border inline-flex items-center gap-1.5 transition-colors ${
                  autoBarcodeEnabled
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Zap className="w-3 h-3" />
                {autoBarcodeEnabled
                  ? 'Catat Otomatis Barcode: Aktif'
                  : 'Catat Otomatis Barcode: Manual'}
              </button>
            </div>
            <div className="flex gap-2">
              <input
                ref={manualInputRef}
                id="manual-nis-input"
                type="text"
                value={manualInput}
                onChange={handleManualInputChange}
                onKeyDown={handleManualInputKeyDown}
                onPaste={() => {
                  inputBurstRef.current.pasted = true;
                }}
                placeholder={
                  autoBarcodeEnabled
                    ? 'Pindai dengan Barcode Gun (otomatis tercatat) atau ketik NIS siswa...'
                    : 'Arahkan kursor ke sini untuk Barcode Gun atau ketik NIS (mis. 1092501001)...'
                }
                className="flex-1 px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
              >
                Catat Presensi
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              {autoBarcodeEnabled
                ? 'Mode otomatis aktif: hasil pemindaian barcode gun langsung mencatat kehadiran tanpa perlu menekan tombol Catat Presensi.'
                : 'Mode manual aktif: pindai atau ketik NIS lalu tekan Enter atau klik tombol Catat Presensi.'}
            </p>
          </form>
        </div>

        {/* Right: Instant Result Banner & Live Attendance Feed */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-emerald-700" />
                Catatan Presensi
              </h2>
              <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                {formatIndonesianDate(activeDate)}
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold font-mono text-slate-900 tabular-nums">
                {hadirCount} / {students.length}
              </div>
              <div className="text-xs text-slate-500">Hadir Tercatat</div>
            </div>
          </div>

          {/* Instant Feedback Banner */}
          {feedback && (
            <div
              className={`mt-4 p-4 rounded-xl border flex items-center gap-3.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : feedback.type === 'duplicate'
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950'
              }`}
            >
              {feedback.student ? (
                <StudentAvatar
                  foto={feedback.student.foto}
                  nama={feedback.student.nama}
                  className="w-10 h-14 shrink-0"
                />
              ) : feedback.type === 'success' ? (
                <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
              ) : feedback.type === 'duplicate' ? (
                <AlertTriangle className="w-7 h-7 text-amber-600 shrink-0" />
              ) : (
                <XCircle className="w-7 h-7 text-rose-600 shrink-0" />
              )}
              <div className="min-w-0">
                <h4 className="font-bold text-sm leading-snug">{feedback.title}</h4>
                <p className="text-xs mt-0.5 opacity-90">{feedback.detail}</p>
              </div>
            </div>
          )}

          {/* Attendance Feed */}
          <div className="mt-4 flex-1 overflow-y-auto max-h-[380px] divide-y divide-slate-100 pr-1">
            {todayLogs.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                Belum ada murid yang melakukan presensi pada {formatIndonesianDate(activeDate)}.
              </div>
            ) : (
              todayLogs.map((log) => (
                <div
                  key={log.id}
                  className="py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 truncate text-sm">
                        {log.nama}
                      </span>
                    </div>
                    <div className="text-slate-500 mt-0.5 flex items-center gap-1.5 font-mono tabular-nums">
                      <span>{log.kelas}</span>
                      <span>·</span>
                      <span>{log.nis}</span>
                      <span>·</span>
                      <span>{log.time} WIB</span>
                    </div>
                  </div>
                  <select
                    aria-label={`Ubah status ${log.nama}`}
                    value={log.status}
                    onChange={(e) =>
                      void quickUpdateStatus(log, e.target.value as AttendanceStatus)
                    }
                    className={`px-2.5 py-1 rounded-lg border text-xs font-semibold focus:outline-none ${
                      log.status === 'Hadir'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : log.status === 'Sakit'
                        ? 'bg-sky-50 text-sky-800 border-sky-200'
                        : log.status === 'Ijin'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    <option value="Hadir">Hadir</option>
                    <option value="Sakit">Sakit</option>
                    <option value="Ijin">Ijin</option>
                    <option value="Alpa">Alpa</option>
                  </select>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <BulkDateAttendanceModal open={bulkModalOpen} onClose={() => setBulkModalOpen(false)} />
    </div>
  );
};
