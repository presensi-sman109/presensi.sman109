import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { ROLE_META } from '../lib/utils';
import type { AdminAccount, AdminRole } from '../types';

export const AdminsTab: React.FC = () => {
  const {
    admins,
    adminLogs,
    activeAdmin,
    saveAdmin,
    deleteAdmin,
    addAdminLog,
    loginWithSelectedAdmin,
  } = useAppData();

  const [subView, setSubView] = useState<'accounts' | 'logs'>('accounts');
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Add/Edit Admin Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminAccount | null>(null);
  const [formNama, setFormNama] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formTelepon, setFormTelepon] = useState('');
  const [formRole, setFormRole] = useState<AdminRole>('operator');
  const [formActive, setFormActive] = useState(true);

  // Switch Session Verification Modal (Mandatory PIN check)
  const [switchTarget, setSwitchTarget] = useState<AdminAccount | null>(null);
  const [switchPin, setSwitchPin] = useState('');
  const [showSwitchPin, setShowSwitchPin] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const switchInputRef = useRef<HTMLInputElement | null>(null);

  // Log Filters
  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('ALL');
  const [logDateFilter, setLogDateFilter] = useState('');

  const activeSuperAdminCount = useMemo(
    () => admins.filter((a) => a.role === 'super_admin' && a.active).length,
    [admins]
  );

  const openAddModal = () => {
    setEditingAdmin(null);
    setFormNama('');
    setFormEmail('');
    setFormUsername('');
    setFormPassword('');
    setShowFormPassword(false);
    setFormTelepon('');
    setFormRole('operator');
    setFormActive(true);
    setModalOpen(true);
  };

  const openEditModal = (adm: AdminAccount) => {
    setEditingAdmin(adm);
    setFormNama(adm.nama);
    setFormEmail(adm.email);
    setFormUsername(adm.username);
    setFormPassword(adm.password);
    setShowFormPassword(false);
    setFormTelepon(adm.telepon || '');
    setFormRole(adm.role);
    setFormActive(adm.active);
    setModalOpen(true);
  };

  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = formUsername.trim().toLowerCase();
    const cleanEmail = formEmail.trim().toLowerCase();
    if (!formNama.trim() || !cleanEmail || !cleanUsername || formPassword.trim().length < 4) {
      setNotice({
        type: 'err',
        text: 'Nama, email, username, dan kata sandi (min. 4 karakter) wajib diisi.',
      });
      return;
    }

    const duplicateUsername = admins.find(
      (a) => a.username.toLowerCase() === cleanUsername && a.id !== editingAdmin?.id
    );
    if (duplicateUsername) {
      setNotice({
        type: 'err',
        text: `Username "@${cleanUsername}" sudah digunakan oleh akun lain.`,
      });
      return;
    }

    // Protect last super admin from being deactivated or downgraded
    if (
      editingAdmin &&
      editingAdmin.role === 'super_admin' &&
      editingAdmin.active &&
      (formRole !== 'super_admin' || !formActive) &&
      activeSuperAdminCount <= 1
    ) {
      setNotice({
        type: 'err',
        text: 'Tidak dapat menonaktifkan atau menurunkan peran Super Admin aktif terakhir.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const payload: AdminAccount = {
      id: editingAdmin?.id || `adm_${cleanUsername.replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
      nama: formNama.trim(),
      email: cleanEmail,
      username: cleanUsername,
      password: formPassword.trim(),
      telepon: formTelepon.trim(),
      role: formRole,
      active: formActive,
      createdAt: editingAdmin?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    await saveAdmin(payload);
    await addAdminLog(
      'KELOLA_ADMIN',
      `${editingAdmin ? 'Memperbarui' : 'Menambahkan'} akun admin ${payload.nama} (@${payload.username} · ${ROLE_META[payload.role].shortLabel})`
    );
    setModalOpen(false);
    setNotice({
      type: 'ok',
      text: `Akun administrator ${payload.nama} berhasil disimpan dan disinkronkan.`,
    });
  };

  const handleDeleteAdmin = async (adm: AdminAccount) => {
    if (adm.role === 'super_admin' && adm.active && activeSuperAdminCount <= 1) {
      setNotice({
        type: 'err',
        text: 'Proteksi Keamanan: Super Admin aktif terakhir tidak boleh dihapus.',
      });
      return;
    }
    if (adm.id === activeAdmin?.id) {
      setNotice({
        type: 'err',
        text: 'Anda tidak dapat menghapus akun yang sedang aktif digunakan saat ini.',
      });
      return;
    }

    await deleteAdmin(adm.id);
    await addAdminLog('HAPUS_ADMIN', `Menghapus akun admin ${adm.nama} (@${adm.username})`);
    setNotice({ type: 'ok', text: `Akun ${adm.nama} telah dihapus.` });
  };

  const handleVerifySwitch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!switchTarget) return;
    setSwitchError(null);
    const res = loginWithSelectedAdmin(switchTarget.id, switchPin);
    if (!res.ok) {
      setSwitchError(res.error || 'Kata sandi / PIN tidak valid.');
      return;
    }
    setSwitchTarget(null);
    setSwitchPin('');
  };

  const actionTypes = useMemo(
    () => Array.from(new Set(adminLogs.map((l) => l.action))).sort(),
    [adminLogs]
  );

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return adminLogs.filter((l) => {
      const matchQ =
        !q ||
        l.adminName.toLowerCase().includes(q) ||
        l.detail.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q);
      const matchAct = logActionFilter === 'ALL' || l.action === logActionFilter;
      const matchDate = !logDateFilter || l.timestamp.startsWith(logDateFilter);
      return matchQ && matchAct && matchDate;
    });
  }, [adminLogs, logSearch, logActionFilter, logDateFilter]);

  const exportLogsExcel = () => {
    const rows = filteredLogs.map((l, idx) => ({
      No: idx + 1,
      Waktu: new Date(l.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
      'Nama Petugas': l.adminName,
      Peran: ROLE_META[l.adminRole]?.label || l.adminRole,
      Aktivitas: l.action,
      Rincian: l.detail,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 26 }, { wch: 20 }, { wch: 22 }, { wch: 48 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Aktivitas Admin');
    XLSX.writeFile(wb, `Laporan_Aktivitas_Admin_SMAN109.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        {/* Header & Sub-View Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-700" />
              Manajemen Akun Administrator & Laporan Aktivitas
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola hak akses berbasis peran (Admin Super, Admin TU, Operator Piket) serta audit
              jejak aktivitas petugas secara menyeluruh.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setSubView('accounts')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  subView === 'accounts'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Daftar Akun ({admins.length})
              </button>
              <button
                type="button"
                onClick={() => setSubView('logs')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  subView === 'logs'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Laporan Aktivitas ({adminLogs.length})
              </button>
            </div>

            {subView === 'accounts' && (
              <button
                type="button"
                onClick={openAddModal}
                className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Tambah Akun Admin
              </button>
            )}
          </div>
        </div>

        {notice && (
          <div
            className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
              notice.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* VIEW 1: ADMIN ACCOUNTS TABLE */}
        {subView === 'accounts' && (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-semibold">Nama Lengkap</th>
                  <th className="py-3 px-4 font-semibold">Username & Email</th>
                  <th className="py-3 px-4 font-semibold">WhatsApp / HP</th>
                  <th className="py-3 px-4 font-semibold">Peran Hak Akses</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admins.map((adm) => {
                  const meta = ROLE_META[adm.role];
                  const isCurrent = activeAdmin?.id === adm.id;
                  return (
                    <tr key={adm.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{adm.nama}</div>
                        {isCurrent && (
                          <span className="text-[11px] font-semibold text-blue-700">
                            Sesi Aktif Saat Ini
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono font-semibold text-slate-800">
                          @{adm.username}
                        </div>
                        <div className="text-xs text-slate-500">{adm.email}</div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                        {adm.telepon || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-bold ${
                            adm.active ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {adm.active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {!isCurrent && adm.active && (
                            <button
                              type="button"
                              onClick={() => {
                                setSwitchTarget(adm);
                                setSwitchPin('');
                                setSwitchError(null);
                                setTimeout(() => switchInputRef.current?.focus(), 50);
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1"
                            >
                              <UserCheck className="w-3.5 h-3.5 text-blue-700" />
                              Ganti Sesi
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(adm)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
                            title="Edit Admin"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteAdmin(adm)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600"
                            title="Hapus Admin"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* VIEW 2: COMPREHENSIVE ADMIN ACTIVITY LOGS */}
        {subView === 'logs' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Cari petugas atau rincian..."
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <select
                value={logActionFilter}
                onChange={(e) => setLogActionFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
              >
                <option value="ALL">Semua Jenis Aktivitas</option>
                {actionTypes.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={logDateFilter}
                onChange={(e) => setLogDateFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
              />
              <button
                type="button"
                onClick={exportLogsExcel}
                disabled={filteredLogs.length === 0}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Ekspor Laporan Aktivitas
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[460px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Waktu (WIB)</th>
                    <th className="py-3 px-4 font-semibold">Petugas</th>
                    <th className="py-3 px-4 font-semibold">Peran</th>
                    <th className="py-3 px-4 font-semibold">Aktivitas</th>
                    <th className="py-3 px-4 font-semibold">Rincian Kejadian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-sm text-slate-400">
                        Belum ada aktivitas tercatat yang sesuai filter.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('id-ID', {
                            timeZone: 'Asia/Jakarta',
                          })}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-900">{log.adminName}</td>
                        <td className="py-2.5 px-4 text-slate-600">
                          {ROLE_META[log.adminRole]?.shortLabel || log.adminRole}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-blue-800">
                          {log.action}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">{log.detail}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ADD / EDIT ADMIN MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">
                {editingAdmin ? 'Edit Akun Administrator' : 'Tambah Akun Administrator Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveAdmin(e)} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Username Unik *</label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">WhatsApp / HP</label>
                  <input
                    type="text"
                    value={formTelepon}
                    onChange={(e) => setFormTelepon(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Resmi *</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Kata Sandi / PIN *
                </label>
                <div className="relative">
                  <input
                    type={showFormPassword ? 'text' : 'password'}
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full pl-3 pr-10 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFormPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Peran Hak Akses *
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as AdminRole)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold"
                  >
                    <option value="super_admin">Admin Super (8 Menu)</option>
                    <option value="admin">Admin Presensi & TU (7 Menu)</option>
                    <option value="operator">Operator Piket Harian (4 Menu)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status Akun</label>
                  <select
                    value={formActive ? 'active' : 'inactive'}
                    onChange={(e) => setFormActive(e.target.value === 'active')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-semibold"
                  >
                    <option value="active">Aktif</option>
                    <option value="inactive">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold"
                >
                  Simpan Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANDATORY PIN VERIFICATION MODAL FOR SWITCHING SESSION */}
      {switchTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">Verifikasi Ganti Sesi</h3>
              <button
                type="button"
                onClick={() => setSwitchTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="font-bold text-sm text-slate-900">{switchTarget.nama}</div>
              <div className="font-mono text-slate-500">
                @{switchTarget.username} · {ROLE_META[switchTarget.role].label}
              </div>
            </div>

            {switchError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {switchError}
              </div>
            )}

            <form onSubmit={handleVerifySwitch} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Masukkan Kata Sandi / PIN Akun Tujuan
                </label>
                <div className="relative">
                  <input
                    ref={switchInputRef}
                    type={showSwitchPin ? 'text' : 'password'}
                    value={switchPin}
                    onChange={(e) => setSwitchPin(e.target.value)}
                    placeholder="Ketik sandi / PIN..."
                    className="w-full pl-3 pr-10 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSwitchPin((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showSwitchPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSwitchTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold inline-flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Masuk Sesi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
