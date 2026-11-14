import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Camera,
  CloudCheck,
  Download,
  FileSpreadsheet,
  Images,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { compressImageToPassport } from '../lib/utils';
import type { Student } from '../types';
import { StudentAvatar } from './SchoolLogo';

export const StudentsTab: React.FC = () => {
  const {
    students,
    activeAdmin,
    saveStudent,
    bulkSaveStudents,
    deleteStudent,
    addAdminLog,
  } = useAppData();

  const canModify = activeAdmin?.role === 'super_admin' || activeAdmin?.role === 'admin';

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');

  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingNis, setEditingNis] = useState<string | null>(null);
  const [formNis, setFormNis] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formKelas, setFormKelas] = useState('');
  const [formTahun, setFormTahun] = useState('2025/2026');
  const [formGender, setFormGender] = useState<'L' | 'P'>('L');
  const [formTelepon, setFormTelepon] = useState('');
  const [formFoto, setFormFoto] = useState<string | null>(null);
  const [photoCompressing, setPhotoCompressing] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const bulkPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const rowPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const rowPhotoTargetNisRef = useRef<string | null>(null);

  const classes = useMemo(
    () => Array.from(new Set(students.map((s) => s.kelas))).sort(),
    [students]
  );
  const years = useMemo(
    () => Array.from(new Set(students.map((s) => s.tahun))).sort(),
    [students]
  );

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => {
        const matchQ =
          !q || s.nama.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q);
        const matchClass = classFilter === 'ALL' || s.kelas === classFilter;
        const matchYear = yearFilter === 'ALL' || s.tahun === yearFilter;
        return matchQ && matchClass && matchYear;
      })
      .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));
  }, [students, search, classFilter, yearFilter]);

  const photoSavedCount = useMemo(
    () => students.filter((s) => Boolean(s.foto)).length,
    [students]
  );

  const openAddModal = () => {
    setEditingNis(null);
    setFormNis('');
    setFormNama('');
    setFormKelas('X-A');
    setFormTahun('2025/2026');
    setFormGender('L');
    setFormTelepon('');
    setFormFoto(null);
    setStudentModalOpen(true);
  };

  const openEditModal = (st: Student) => {
    setEditingNis(st.nis);
    setFormNis(st.nis);
    setFormNama(st.nama);
    setFormKelas(st.kelas);
    setFormTahun(st.tahun);
    setFormGender(st.jenisKelamin || 'L');
    setFormTelepon(st.telepon || '');
    setFormFoto(st.foto || null);
    setStudentModalOpen(true);
  };

  const handleModalPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoCompressing(true);
    try {
      const compressed = await compressImageToPassport(file);
      setFormFoto(compressed);
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal memproses foto.',
      });
    } finally {
      setPhotoCompressing(false);
    }
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const nis = formNis.trim();
    const nama = formNama.trim();
    const kelas = formKelas.trim().toUpperCase();
    const tahun = formTahun.trim();
    if (!nis || !nama || !kelas) return;

    const student: Student = {
      id: nis,
      nis,
      nama,
      kelas,
      tahun: tahun || '2025/2026',
      jenisKelamin: formGender,
      telepon: formTelepon.trim(),
      foto: formFoto,
      updatedAt: new Date().toISOString(),
    };

    await saveStudent(student);
    await addAdminLog(
      editingNis ? 'EDIT_MURID' : 'TAMBAH_MURID',
      `${editingNis ? 'Memperbarui' : 'Menambahkan'} murid ${nama} (${nis} · ${kelas})`
    );
    setStudentModalOpen(false);
    setNotice({ type: 'ok', text: `Data murid ${nama} berhasil disimpan.` });
  };

  const handleDeleteStudent = async (st: Student) => {
    await deleteStudent(st.nis);
    await addAdminLog('HAPUS_MURID', `Menghapus murid ${st.nama} (${st.nis})`);
    setNotice({ type: 'ok', text: `Data murid ${st.nama} dihapus.` });
  };

  const handleRowQuickPhotoClick = (nis: string) => {
    rowPhotoTargetNisRef.current = nis;
    rowPhotoInputRef.current?.click();
  };

  const handleRowQuickPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetNis = rowPhotoTargetNisRef.current;
    e.target.value = '';
    if (!file || !targetNis) return;

    const student = students.find((s) => s.nis === targetNis);
    if (!student) return;

    try {
      const compressed = await compressImageToPassport(file);
      await saveStudent({ ...student, foto: compressed });
      await addAdminLog(
        'UNGGAH_FOTO',
        `Unggah pas foto 2:3 untuk ${student.nama} (${student.nis})`
      );
      setNotice({
        type: 'ok',
        text: `Pas foto ${student.nama} dikompresi & disimpan permanen ke Firestore.`,
      });
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal unggah foto.',
      });
    }
  };

  const handleBulkPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    let matched = 0;
    let unmatched = 0;
    const updatedList: Student[] = [];

    for (const file of files) {
      const stem = file.name.replace(/\.[^/.]+$/, '').trim();
      const target = students.find((s) => s.nis.toLowerCase() === stem.toLowerCase());
      if (!target) {
        unmatched++;
        continue;
      }
      try {
        const compressed = await compressImageToPassport(file);
        updatedList.push({ ...target, foto: compressed });
        matched++;
      } catch {
        unmatched++;
      }
    }

    if (updatedList.length > 0) {
      await bulkSaveStudents(updatedList);
      await addAdminLog(
        'UNGGAH_MASSAL_FOTO',
        `Unggah massal pas foto berdasarkan NIS: ${matched} berhasil, ${unmatched} tidak cocok.`
      );
    }

    setNotice({
      type: matched > 0 ? 'ok' : 'err',
      text: `Unggah massal selesai: ${matched} foto tersimpan ke Firestore${
        unmatched > 0 ? `, ${unmatched} file tidak cocok dengan NIS murid` : ''
      }.`,
    });
  };

  const downloadOfficialTemplate = () => {
    const rows = [
      {
        nis: '1092501001',
        nama: 'Aditya Pratama Wijaya',
        kelas: 'X-A',
        tahun: '2025/2026',
        'jenis kelamin': 'L',
        telepon: '081211002201',
      },
      {
        nis: '1092501002',
        nama: 'Aisyah Putri Ramadhani',
        kelas: 'X-A',
        tahun: '2025/2026',
        'jenis kelamin': 'P',
        telepon: '081211002202',
      },
      {
        nis: '1092501003',
        nama: 'Bagas Maulana Saputra',
        kelas: 'XI-B',
        tahun: '2025/2026',
        'jenis kelamin': 'L',
        telepon: '081211002203',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 16 },
      { wch: 28 },
      { wch: 10 },
      { wch: 14 },
      { wch: 15 },
      { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Murid');
    XLSX.writeFile(wb, 'Template_Data_Murid_SMAN109_Jakarta.xlsx');
  };

  const processExcelFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      const imported: Student[] = [];
      const nowIso = new Date().toISOString();

      rows.forEach((row) => {
        const nis = String(row.nis ?? row.NIS ?? row.nisn ?? row.NISN ?? '').trim();
        const nama = String(row.nama ?? row.NAMA ?? row['nama lengkap'] ?? '').trim();
        const kelas = String(row.kelas ?? row.KELAS ?? '').trim().toUpperCase();
        const tahun = String(
          row.tahun ?? row.TAHUN ?? row.tahun_ajaran ?? row['tahun ajaran'] ?? '2025/2026'
        ).trim();
        const rawGender = String(
          row['jenis kelamin'] ?? row.jenisKelamin ?? row.jk ?? row.JK ?? 'L'
        )
          .trim()
          .toUpperCase();
        const jenisKelamin: 'L' | 'P' = rawGender.startsWith('P') ? 'P' : 'L';
        const telepon = String(row.telepon ?? row.TELEPON ?? row.hp ?? '').trim();

        if (nis && nama && kelas) {
          const existing = students.find((s) => s.nis === nis);
          imported.push({
            id: nis,
            nis,
            nama,
            kelas,
            tahun,
            jenisKelamin,
            telepon,
            foto: existing?.foto ?? null,
            updatedAt: nowIso,
          });
        }
      });

      if (imported.length > 0) {
        await bulkSaveStudents(imported);
        await addAdminLog('IMPOR_EXCEL', `Impor massal ${imported.length} murid dari ${file.name}`);
        setNotice({
          type: 'ok',
          text: `Berhasil mengimpor ${imported.length} data murid ke database.`,
        });
      } else {
        setNotice({
          type: 'err',
          text: 'Tidak ada baris valid yang terbaca. Pastikan kolom nis, nama, kelas terisi.',
        });
      }
      setImportModalOpen(false);
    } catch {
      setNotice({
        type: 'err',
        text: 'Gagal membaca file Excel/CSV. Pastikan format file valid.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        {/* Header & Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Manajemen Data Murid SMA Negeri 109 Jakarta
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                <CloudCheck className="w-4 h-4" />
                Awan Abadi Firestore: {photoSavedCount} / {students.length} Murid Berfoto (Rasio 2:3)
              </span>
              <span aria-hidden="true">·</span>
              <span>Total {students.length} siswa terdaftar</span>
            </div>
          </div>

          {canModify && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openAddModal}
                className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Tambah Murid
              </button>
              <button
                type="button"
                onClick={() => bulkPhotoInputRef.current?.click()}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Images className="w-4 h-4" />
                Unggah Massal Foto (NIS)
              </button>
              <button
                type="button"
                onClick={downloadOfficialTemplate}
                className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                Unduh Template Excel
              </button>
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Impor Excel / CSV
              </button>
            </div>
          )}
        </div>

        {/* Hidden file inputs */}
        <input
          ref={bulkPhotoInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void handleBulkPhotoUpload(e)}
        />
        <input
          ref={rowPhotoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void handleRowQuickPhotoFile(e)}
        />

        {notice && (
          <div
            className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
              notice.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-slate-500 hover:text-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Filter Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari berdasarkan NIS atau Nama Murid..."
              className="w-full pl-9 pr-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="md:col-span-3">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">Semua Kelas</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  Kelas {c}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">Semua Tahun Ajaran</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Students Data Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 font-semibold">Pas Foto</th>
                <th className="py-3 px-4 font-semibold">NIS</th>
                <th className="py-3 px-4 font-semibold">Nama Lengkap</th>
                <th className="py-3 px-4 font-semibold">L/P</th>
                <th className="py-3 px-4 font-semibold">Kelas</th>
                <th className="py-3 px-4 font-semibold">Tahun</th>
                <th className="py-3 px-4 font-semibold">Telepon</th>
                {canModify && <th className="py-3 px-4 font-semibold text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td
                    colSpan={canModify ? 8 : 7}
                    className="py-10 text-center text-sm text-slate-400"
                  >
                    Tidak ada data murid yang cocok dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st) => (
                  <tr key={st.nis} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="relative inline-flex items-center gap-2">
                        <StudentAvatar foto={st.foto} nama={st.nama} className="w-8 h-12" />
                        {canModify && (
                          <button
                            type="button"
                            onClick={() => handleRowQuickPhotoClick(st.nis)}
                            title="Unggah / Ganti Pas Foto 1-Klik"
                            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 transition-colors"
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-700 tabular-nums">
                      {st.nis}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">{st.nama}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{st.jenisKelamin}</td>
                    <td className="py-2.5 px-4 font-semibold text-blue-800">{st.kelas}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600">
                      {st.tahun}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">
                      {st.telepon || '-'}
                    </td>
                    {canModify && (
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(st)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
                            title="Edit Murid"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteStudent(st)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600"
                            title="Hapus Murid"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Student Modal */}
      {studentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">
                {editingNis ? 'Edit Data Murid' : 'Tambah Murid Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setStudentModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveStudent(e)} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">NIS *</label>
                  <input
                    type="text"
                    required
                    readOnly={Boolean(editingNis)}
                    value={formNis}
                    onChange={(e) => setFormNis(e.target.value)}
                    placeholder="mis. 1092501009"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono read-only:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Jenis Kelamin *
                  </label>
                  <select
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value as 'L' | 'P')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  placeholder="Nama lengkap sesuai rapor"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kelas *</label>
                  <input
                    type="text"
                    required
                    value={formKelas}
                    onChange={(e) => setFormKelas(e.target.value)}
                    placeholder="mis. X-A"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tahun Ajaran *</label>
                  <input
                    type="text"
                    required
                    value={formTahun}
                    onChange={(e) => setFormTahun(e.target.value)}
                    placeholder="2025/2026"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">No. Telepon</label>
                  <input
                    type="text"
                    value={formTelepon}
                    onChange={(e) => setFormTelepon(e.target.value)}
                    placeholder="0812..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-4">
                <StudentAvatar foto={formFoto} nama={formNama || 'Siswa'} className="w-14 h-20" />
                <div className="flex-1 space-y-1.5">
                  <label className="block font-semibold text-slate-700">
                    Pas Foto Rasio 2:3 (Otomatis Kompres ~30 KB)
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => void handleModalPhotoChange(e)}
                    className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {photoCompressing && (
                    <p className="text-blue-700 font-medium">Mengompresi gambar ke rasio 2:3...</p>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStudentModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold"
                >
                  Simpan Data Murid
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drag & Drop Excel Import Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">
                Impor Data Murid (Excel / CSV)
              </h3>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-3">
              <p>
                Kolom resmi yang didukung:{' '}
                <span className="font-mono font-semibold text-slate-900">
                  nis, nama, kelas, tahun, jenis kelamin, telepon
                </span>
              </p>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">Unduh Template Excel Resmi</p>
                  <p className="text-slate-500 mt-0.5">
                    Format kolom siap pakai untuk SMA Negeri 109 Jakarta.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadOfficialTemplate}
                  className="px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold inline-flex items-center gap-1.5 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Template
                </button>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void processExcelFile(file);
                }}
                className={`p-8 border-2 border-dashed rounded-xl text-center transition-colors ${
                  dragActive
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-slate-300 bg-slate-50 hover:bg-slate-100/70'
                }`}
              >
                <input
                  id="excel-import-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void processExcelFile(file);
                  }}
                />
                <label
                  htmlFor="excel-import-input"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="w-8 h-8 text-emerald-700" />
                  <span className="font-bold text-sm text-slate-800">
                    Tarik & Lepas File di Sini atau Klik untuk Memilih
                  </span>
                  <span className="text-slate-500">Mendukung format .xlsx, .xls, dan .csv</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
