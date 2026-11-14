export type AttendanceStatus = 'Hadir' | 'Sakit' | 'Ijin' | 'Alpa';

export type AdminRole = 'super_admin' | 'admin' | 'operator';

export type TtsVoice = 'Kore' | 'Puck' | 'Zephyr' | 'Fenrir' | 'Charon';

export type TabId =
  | 'scan'
  | 'absent'
  | 'students'
  | 'report'
  | 'card'
  | 'ai'
  | 'admins'
  | 'settings';

export interface Student {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  tahun: string;
  jenisKelamin: 'L' | 'P';
  telepon?: string;
  foto?: string | null;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  status: AttendanceStatus;
  notes?: string;
  recordedBy: string;
  updatedAt: string;
}

export interface AdminAccount {
  id: string;
  nama: string;
  email: string;
  username: string;
  password: string;
  telepon?: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLog {
  id: string;
  adminId: string;
  adminName: string;
  adminRole: AdminRole;
  action: string;
  detail: string;
  timestamp: string;
}

export interface SchoolSettings {
  schoolName: string;
  address: string;
  npsn: string;
  academicYear: string;
  principalName: string;
  principalNip: string;
  homeroomTeachers: Record<string, string>;
  customLogo: string | null;
  cardBackTitle: string;
  cardBackRules: string[];
  cardBackFooter: string;
  ttsVoice: TtsVoice;
  ttsEnabled: boolean;
  updatedAt: string;
}

export interface ScanFeedback {
  type: 'success' | 'duplicate' | 'error';
  title: string;
  detail: string;
  student?: Student;
  time?: string;
}
