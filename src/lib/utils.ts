import type { AdminRole, AttendanceStatus, TabId } from '../types';

export const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const ROLE_META: Record<
  AdminRole,
  { label: string; shortLabel: string; badgeClass: string; allowedTabs: TabId[] }
> = {
  super_admin: {
    label: 'Admin Super',
    shortLabel: 'Super Admin',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    allowedTabs: ['scan', 'absent', 'students', 'report', 'card', 'ai', 'admins', 'settings'],
  },
  admin: {
    label: 'Admin Presensi & TU',
    shortLabel: 'Admin TU',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
    allowedTabs: ['scan', 'absent', 'students', 'report', 'card', 'ai', 'settings'],
  },
  operator: {
    label: 'Operator Piket Harian',
    shortLabel: 'Operator Piket',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    allowedTabs: ['scan', 'absent', 'students', 'report'],
  },
};

export function canAccessTab(role: AdminRole, tab: TabId): boolean {
  return ROLE_META[role]?.allowedTabs.includes(tab) ?? false;
}

export function getTodayWib(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

export function getTimeWib(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return fmt.format(now);
}

export function formatIndonesianDate(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${day} ${MONTH_NAMES_ID[month - 1] || ''} ${year}`;
}

export function getDaysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function isWeekendDay(year: number, monthIndex0: number, day: number): boolean {
  const d = new Date(year, monthIndex0, day).getDay();
  return d === 0 || d === 6; // Minggu atau Sabtu (5 hari sekolah DKI Jakarta)
}

export function getEffectiveDaysInMonth(year: number, monthIndex0: number): number {
  const total = getDaysInMonth(year, monthIndex0);
  let count = 0;
  for (let day = 1; day <= total; day++) {
    if (!isWeekendDay(year, monthIndex0, day)) {
      count++;
    }
  }
  return count;
}

export function getDisciplinePredicate(pct: number): { label: string; colorClass: string } {
  if (pct >= 95) return { label: 'Sangat Baik', colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (pct >= 85) return { label: 'Baik', colorClass: 'text-sky-700 bg-sky-50 border-sky-200' };
  if (pct >= 75) return { label: 'Cukup', colorClass: 'text-amber-700 bg-amber-50 border-amber-200' };
  return { label: 'Perlu Pembinaan', colorClass: 'text-rose-700 bg-rose-50 border-rose-200' };
}

export function getHomeroomForClass(
  kelas: string,
  homeroomTeachers: Record<string, string>
): string {
  const exact = homeroomTeachers?.[kelas]?.trim();
  if (exact) return exact;
  const grade = kelas.split(/[-\s_]/)[0]?.trim().toUpperCase();
  const gradeVal = grade ? homeroomTeachers?.[grade]?.trim() : '';
  if (gradeVal) return gradeVal;
  return 'Wali Kelas (NIP. -)';
}

export function sortClassesAcademic(classes: string[]): string[] {
  const gradeRank = (cls: string): number => {
    const prefix = cls.split(/[-\s_]/)[0]?.trim().toUpperCase();
    if (prefix === 'X' || prefix === '10') return 10;
    if (prefix === 'XI' || prefix === '11') return 11;
    if (prefix === 'XII' || prefix === '12') return 12;
    return 99;
  };
  return [...classes].sort((a, b) => {
    const rankDiff = gradeRank(a) - gradeRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' });
  });
}

export function statusCodeShort(status?: AttendanceStatus): string {
  switch (status) {
    case 'Hadir':
      return 'H';
    case 'Sakit':
      return 'S';
    case 'Ijin':
      return 'I';
    case 'Alpa':
      return 'A';
    default:
      return '-';
  }
}

/**
 * Compress uploaded image to crisp 2:3 passport ratio (~25-40KB JPEG)
 */
export function compressImageToPassport(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
      img.onload = () => {
        const targetW = 240;
        const targetH = 360; // Exact 2:3 ratio
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia.'));
          return;
        }

        // Center-crop to 2:3 aspect ratio
        const srcAspect = img.width / img.height;
        const targetAspect = targetW / targetH;
        let sx = 0;
        let sy = 0;
        let sw = img.width;
        let sh = img.height;

        if (srcAspect > targetAspect) {
          sw = img.height * targetAspect;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetAspect;
          sy = (img.height - sh) / 2;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

        // Aim for ~25-40KB
        let quality = 0.78;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 52000 && quality > 0.35) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.src = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export function compressLogoImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca logo.'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format logo tidak didukung.'));
      img.onload = () => {
        const maxDim = 256;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia.'));
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let out = canvas.toDataURL('image/png');
        if (out.length > 160000) {
          out = canvas.toDataURL('image/webp', 0.85);
        }
        if (out.length > 160000) {
          out = canvas.toDataURL('image/jpeg', 0.75);
        }
        resolve(out);
      };
      img.src = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  });
}

// --- Multi-Tone Web Audio Synthesis ---
let sharedAudioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  try {
    if (!sharedAudioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function playTone(type: 'success' | 'duplicate' | 'error') {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const playBeep = (freq: number, startOffset: number, dur: number, wave: OscillatorType = 'sine', vol = 0.12) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, now + startOffset);
    gain.gain.setValueAtTime(vol, now + startOffset);
    gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + dur);
  };

  if (type === 'success') {
    // Harmonious dual-tone chime
    playBeep(784, 0, 0.12, 'sine', 0.12);
    playBeep(1046.5, 0.11, 0.2, 'sine', 0.14);
  } else if (type === 'duplicate') {
    // Warning double tone
    playBeep(523.25, 0, 0.12, 'triangle', 0.14);
    playBeep(440, 0.15, 0.18, 'triangle', 0.14);
  } else {
    // Buzzer for unknown card
    playBeep(196, 0, 0.18, 'sawtooth', 0.1);
    playBeep(164.8, 0.19, 0.22, 'sawtooth', 0.1);
  }
}

let currentAudioElement: HTMLAudioElement | null = null;

export async function speakAnnouncement(
  text: string,
  voiceName: string,
  enabled: boolean
): Promise<void> {
  if (!enabled || !text.trim()) return;

  try {
    const res = await fetch('/api/ai/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceName }),
    });

    if (res.ok) {
      const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
      if (data.audioBase64) {
        if (currentAudioElement) {
          currentAudioElement.pause();
          currentAudioElement = null;
        }
        const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
        currentAudioElement = audio;
        await audio.play();
        return;
      }
    }
  } catch {
    // Fallback below if offline / API unavailable
  }

  // Browser Web Speech fallback
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'id-ID';
      utter.rate = 1.02;
      window.speechSynthesis.speak(utter);
    }
  } catch {
    // Ignore audio errors
  }
}
