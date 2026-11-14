import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  WifiOff,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { ROLE_META } from '../lib/utils';
import type { AdminAccount } from '../types';
import { SchoolLogo } from './SchoolLogo';

export const LoginScreen: React.FC = () => {
  const {
    admins,
    settings,
    cloudConnected,
    isOffline,
    syncStatus,
    loginWithCredentials,
    loginWithSelectedAdmin,
    syncNowToFirestore,
  } = useAppData();

  const [mode, setMode] = useState<'form' | 'quick'>('quick');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [selectedProfile, setSelectedProfile] = useState<AdminAccount | null>(null);
  const [profilePin, setProfilePin] = useState('');
  const [showProfilePin, setShowProfilePin] = useState(false);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  useEffect(() => {
    if (selectedProfile && pinInputRef.current) {
      pinInputRef.current.focus();
    }
  }, [selectedProfile]);

  const activeStaffList = admins.filter((a) => a.active);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const res = loginWithCredentials(identifier, password);
    if (!res.ok) {
      setErrorMsg(res.error || 'Gagal masuk.');
    }
  };

  const handleProfileVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile) return;
    setErrorMsg(null);
    const res = loginWithSelectedAdmin(selectedProfile.id, profilePin);
    if (!res.ok) {
      setErrorMsg(res.error || 'Kata sandi atau PIN tidak valid.');
    }
  };

  const handleSyncStaffAccounts = async () => {
    setErrorMsg(null);
    setSyncBusy(true);
    const res = await syncNowToFirestore();
    setSyncBusy(false);
    if (!res.ok && res.error) {
      setErrorMsg(res.error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-8">
      {/* Main Centered Institutional Gateway */}
      <div className="max-w-5xl w-full mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Left Brand & Identity Column */}
        <div className="lg:col-span-5 bg-slate-900 text-white p-8 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-white p-1.5 flex items-center justify-center shrink-0">
                <SchoolLogo customLogo={settings.customLogo} className="w-full h-full" />
              </div>
              <div>
                <p className="text-xs font-medium text-sky-300 tracking-wide">
                  Sistem Informasi Sekolah
                </p>
                <h1 className="text-xl font-bold tracking-tight leading-snug text-white">
                  {settings.schoolName}
                </h1>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-800">
              <h2 className="text-2xl font-bold tracking-tight leading-tight text-balance">
                Gerbang Otentikasi Presensi & Kartu Pelajar
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Masuk menggunakan akun petugas terdaftar yang tersinkron real-time dengan Firebase
                Cloud Firestore untuk mengakses pemindai presensi, manajemen data murid, cetak
                kartu CR80, dan laporan A4.
              </p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800 space-y-2.5 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Tahun Pelajaran Aktif</span>
              <span className="font-mono font-semibold text-white tabular-nums">
                {settings.academicYear}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">NPSN Resmi</span>
              <span className="font-mono font-semibold text-white tabular-nums">
                {settings.npsn}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Firebase Cloud Firestore</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-100">
                {isOffline ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                    Cache Offline Aktif
                  </>
                ) : syncStatus === 'syncing' || syncBusy ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                    Menyinkronkan Akun...
                  </>
                ) : syncStatus === 'error' ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-rose-400" />
                    Gangguan Sinkron
                  </>
                ) : cloudConnected || syncStatus === 'synced' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Tersinkron Realtime
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                    Terhubung ke Firebase
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right Authentication Form Column */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
          {/* Segmented Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('quick');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                mode === 'quick'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pilih Akun Petugas
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('form');
                setSelectedProfile(null);
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                mode === 'form'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Formulir Username / Email
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2.5"
            >
              <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* MODE 1: QUICK PROFILE PICKER WITH MANDATORY PIN VERIFICATION */}
          {mode === 'quick' && !selectedProfile && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Pilih Akun Petugas / Admin</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Klik profil Anda lalu masukkan Kata Sandi / PIN untuk verifikasi keamanan.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[290px] overflow-y-auto pr-1">
                {activeStaffList.map((adm) => {
                  const meta = ROLE_META[adm.role];
                  return (
                    <button
                      key={adm.id}
                      type="button"
                      onClick={() => {
                        setSelectedProfile(adm);
                        setProfilePin('');
                        setShowProfilePin(false);
                        setErrorMsg(null);
                      }}
                      className="text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50/40 transition-colors flex flex-col justify-between gap-2 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-800">
                            {adm.nama}
                          </p>
                          <p className="text-xs font-mono text-slate-500 truncate">
                            @{adm.username}
                          </p>
                        </div>
                        <UserCheck className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0 mt-0.5" />
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded-md border font-semibold ${meta.badgeClass}`}
                        >
                          {meta.shortLabel}
                        </span>
                        <span className="text-slate-400 group-hover:text-blue-600 font-medium">
                          Verifikasi →
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* SELECTED PROFILE VERIFICATION CARD */}
          {mode === 'quick' && selectedProfile && (
            <form onSubmit={handleProfileVerify} className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setSelectedProfile(null);
                  setProfilePin('');
                  setErrorMsg(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Kembali ke Daftar Petugas
              </button>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">Verifikasi Sesi Akun</p>
                  <h4 className="font-bold text-base text-slate-900 truncate">
                    {selectedProfile.nama}
                  </h4>
                  <p className="text-xs font-mono text-slate-500">@{selectedProfile.username}</p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg border text-xs font-semibold shrink-0 ${
                    ROLE_META[selectedProfile.role].badgeClass
                  }`}
                >
                  {ROLE_META[selectedProfile.role].label}
                </span>
              </div>

              <div>
                <label
                  htmlFor="profile-pin-input"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Masukkan Kata Sandi / PIN Akun
                </label>
                <div className="relative">
                  <input
                    ref={pinInputRef}
                    id="profile-pin-input"
                    type={showProfilePin ? 'text' : 'password'}
                    value={profilePin}
                    onChange={(e) => setProfilePin(e.target.value)}
                    placeholder="Ketik kata sandi atau PIN..."
                    autoComplete="current-password"
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowProfilePin((v) => !v)}
                    aria-label={showProfilePin ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showProfilePin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  PIN bawaan akun awal: <span className="font-mono font-semibold text-slate-600">109109</span>
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                Verifikasi & Masuk ke Sistem
              </button>
            </form>
          )}

          {/* MODE 2: USERNAME / EMAIL & PASSWORD FORM */}
          {mode === 'form' && (
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-identifier"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Username atau Email Terdaftar
                </label>
                <input
                  id="login-identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="mis. sudiyantoro atau presensi109"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Kata Sandi / PIN
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi atau PIN..."
                    className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                Masuk dengan Akun Petugas
              </button>
            </form>
          )}

          {/* FIREBASE STAFF SYNC STATUS BAR */}
          <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Daftar akun petugas ({activeStaffList.length} aktif) tersinkron otomatis dengan
              Firebase.
            </span>
            <button
              type="button"
              disabled={syncBusy || isOffline}
              onClick={() => void handleSyncStaffAccounts()}
              className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncBusy ? 'animate-spin' : ''}`} />
              {syncBusy ? 'Menyinkronkan...' : 'Sinkronkan Akun'}
            </button>
          </div>
        </div>
      </div>

      {/* Quiet Footer */}
      <footer className="max-w-5xl w-full mx-auto pt-4 text-center text-xs text-slate-400">
        {settings.schoolName} · {settings.address}
      </footer>
    </div>
  );
};
