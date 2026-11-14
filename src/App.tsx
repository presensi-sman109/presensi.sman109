import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  Cloud,
  CloudOff,
  FileSpreadsheet,
  IdCard,
  LogOut,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AbsentTab } from './components/AbsentTab';
import { AdminsTab } from './components/AdminsTab';
import { AiAnalysisTab } from './components/AiAnalysisTab';
import { CardTab } from './components/CardTab';
import { LoginScreen } from './components/LoginScreen';
import { ReportTab } from './components/ReportTab';
import { ScanTab } from './components/ScanTab';
import { SchoolLogo } from './components/SchoolLogo';
import { SettingsTab } from './components/SettingsTab';
import { StudentsTab } from './components/StudentsTab';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import { canAccessTab, formatIndonesianDate, ROLE_META } from './lib/utils';
import type { TabId } from './types';

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'scan', label: 'Pindai Absensi', icon: Camera },
  { id: 'absent', label: 'Belum Absen', icon: AlertTriangle },
  { id: 'students', label: 'Data Murid', icon: Users },
  { id: 'report', label: 'Rekap & Ekspor', icon: FileSpreadsheet },
  { id: 'card', label: 'Cetak Kartu', icon: IdCard },
  { id: 'ai', label: 'Analisis AI', icon: Sparkles },
  { id: 'admins', label: 'Kelola Admin', icon: Shield },
  { id: 'settings', label: 'Pengaturan', icon: Settings },
];

function formatSyncTimeWib(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

const MainShell: React.FC = () => {
  const {
    activeAdmin,
    settings,
    activeDate,
    isOffline,
    syncStatus,
    lastSyncedAt,
    syncError,
    syncNowToFirestore,
    clearSyncError,
    saveSettings,
    logout,
  } = useAppData();

  const [activeTab, setActiveTab] = useState<TabId>('scan');
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectFeedback, setConnectFeedback] = useState<string | null>(null);

  // Automatic Route Protection when switching roles/sessions
  useEffect(() => {
    if (activeAdmin && !canAccessTab(activeAdmin.role, activeTab)) {
      setActiveTab('scan');
    }
  }, [activeAdmin, activeTab]);

  if (!activeAdmin) {
    return <LoginScreen />;
  }

  const roleMeta = ROLE_META[activeAdmin.role];
  const visibleTabs = NAV_ITEMS.filter((item) => canAccessTab(activeAdmin.role, item.id));

  const toggleMute = () => {
    void saveSettings({ ...settings, ttsEnabled: !settings.ttsEnabled });
  };

  const handleCloudAction = async () => {
    setConnectBusy(true);
    setConnectFeedback(null);
    const res = await syncNowToFirestore();
    setConnectBusy(false);
    if (!res.ok && res.error) {
      setConnectFeedback(res.error);
    }
  };

  const syncTimeLabel = formatSyncTimeWib(lastSyncedAt);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Institutional Header (hidden on print) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 no-print">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 p-1 flex items-center justify-center shrink-0">
              <SchoolLogo customLogo={settings.customLogo} className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm sm:text-base text-slate-900 truncate leading-tight">
                {settings.schoolName}
              </h1>
              <div className="text-xs text-slate-500 flex items-center gap-2 truncate">
                <span className="font-mono tabular-nums">{formatIndonesianDate(activeDate)}</span>
                <span aria-hidden="true">·</span>
                <span>TA {settings.academicYear}</span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    isOffline
                      ? 'text-amber-700 font-medium'
                      : syncStatus === 'error'
                      ? 'text-rose-700 font-medium'
                      : 'text-emerald-700 font-medium'
                  }
                >
                  {isOffline
                    ? 'Offline Cache'
                    : syncStatus === 'syncing' || connectBusy
                    ? 'Menyinkronkan Firestore...'
                    : syncStatus === 'error'
                    ? 'Sinkronisasi Terganggu'
                    : `Firestore Realtime${syncTimeLabel ? ` (${syncTimeLabel})` : ''}`}
                </span>
              </div>
            </div>
          </div>

          {/* Right Controls: Cloud Sync, Voice Mute, Active Role, Logout */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={connectBusy || isOffline}
              onClick={() => void handleCloudAction()}
              title="Sinkronkan ulang data dengan Cloud Firestore sekarang"
              className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                isOffline
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              {isOffline ? (
                <CloudOff className="w-4 h-4 text-amber-700" />
              ) : syncStatus === 'syncing' || connectBusy ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              <span className="hidden md:inline">{isOffline ? 'Offline' : 'Sinkronkan'}</span>
            </button>

            <button
              type="button"
              onClick={toggleMute}
              title={settings.ttsEnabled ? 'Matikan Pengumuman Suara' : 'Aktifkan Pengumuman Suara'}
              className={`p-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                settings.ttsEnabled
                  ? 'bg-slate-50 border-slate-300 text-slate-800 hover:bg-slate-100'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {settings.ttsEnabled ? (
                <Volume2 className="w-4 h-4 text-blue-700" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
              <span className="hidden lg:inline">
                {settings.ttsEnabled ? 'Suara Aktif' : 'Suara Bisu'}
              </span>
            </button>

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="text-right leading-tight">
                <div className="text-xs font-bold text-slate-900 max-w-[150px] truncate">
                  {activeAdmin.nama}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  {roleMeta.shortLabel}
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${roleMeta.badgeClass}`}
              >
                {roleMeta.shortLabel}
              </span>
            </div>

            <button
              type="button"
              onClick={() => void logout()}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar
            </button>
          </div>
        </div>

        {/* Dynamic Role-Filtered Navigation Bar */}
        <div className="border-t border-slate-100 bg-slate-50/70">
          <nav className="max-w-[1400px] mx-auto px-4 sm:px-6 flex items-center gap-1.5 overflow-x-auto py-2">
            {visibleTabs.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-blue-700 text-white shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 print:p-0 print:max-w-none space-y-4">
        {(syncError || connectFeedback) && (
          <div className="no-print p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{syncError || connectFeedback}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCloudAction()}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              >
                Coba Sinkronkan
              </button>
              <button
                type="button"
                onClick={() => {
                  clearSyncError();
                  setConnectFeedback(null);
                }}
                className="px-2 py-1 text-amber-800 underline font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {activeTab === 'scan' && <ScanTab />}
        {activeTab === 'absent' && <AbsentTab />}
        {activeTab === 'students' && <StudentsTab />}
        {activeTab === 'report' && <ReportTab />}
        {activeTab === 'card' && canAccessTab(activeAdmin.role, 'card') && <CardTab />}
        {activeTab === 'ai' && canAccessTab(activeAdmin.role, 'ai') && <AiAnalysisTab />}
        {activeTab === 'admins' && canAccessTab(activeAdmin.role, 'admins') && <AdminsTab />}
        {activeTab === 'settings' && canAccessTab(activeAdmin.role, 'settings') && (
          <SettingsTab />
        )}
      </main>
    </div>
  );
};

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full space-y-3 text-center">
            <h2 className="font-bold text-base text-slate-900">Terjadi Kendala Aplikasi</h2>
            <p className="text-xs text-slate-600">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold"
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppDataProvider>
        <MainShell />
      </AppDataProvider>
    </AppErrorBoundary>
  );
}
