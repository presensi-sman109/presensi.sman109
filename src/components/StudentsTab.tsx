import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
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

type ImportMode = 'replace' | 'append_unique';
type BulkDeleteScope = 'selected' | 'filtered' | 'all';

const NIS_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

export const StudentsTab: React.FC = () => {
  const {
    students,
    activeAdmin,
    saveStudent,
    bulkSaveStudents,
    replaceAllStudents,
    deleteStudent,
    bulkDeleteStudents,
    addAdminLog,
  } = useAppData();

  const canModify = activeAdmin?.role === 'super_admin' || activeAdmin?.role === 'admin';

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');

  // Selection for Bulk Delete
  const [selectedNisSet, setSelectedNisSet] = useState<Set<string>>(() => new Set());

  // Add / Edit Student Modal
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingNis, setEditingNis] = useState<string | null>(null);
  const [formNis, setFormNis] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formKelas, setFormKelas] = useState('');
  const [formTahun, setFormTahun] = useState('2025/2026');
  const [formGender, setFormGender] = useState<'L' | 'P'>('L');
  const [formTelepon, setFormTelepon] = useState('');
  const [formFoto, setFormFoto] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [photoCompressing, setPhotoCompressing] = useState(false);

  // Import Excel Modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('replace');
  const [preservePhotosOnReplace, setPreservePhotosOnReplace] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Bulk Delete Modal
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteScope, setBulkDeleteScope] = useState<BulkDeleteScope>('selected');
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);

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

  const activeSelectedCount = useMemo(() => {
    const validNis = new Set(students.map((s) => s.nis));
    let count = 0;
    selectedNisSet.forEach((nis) => {
      if (validNis.has(nis)) count++;
    });
    return count;
  }, [students, selectedNisSet]);

  const allFilteredSelected =
    filteredStudents.length > 0 && filteredStudents.every((s) => selectedNisSet.has(s.nis));

  const toggleSelectAllFiltered = (checked: boolean) => {
    setSelectedNisSet((prev) => {
      const next = new Set(prev);
      filteredStudents.forEach((s) => {
        if (checked) next.add(s.nis);
        else next.delete(s.nis);
      });
      return next;
    });
  };

  const toggleSelectOne = (nis: string) => {
    setSelectedNisSet((prev) => {
      const next = new Set(prev);
      if (next.has(nis)) next.delete(nis);
      else next.add(nis);
      return next;
    });
  };

  const openAddModal = () => {
    setEditingNis(null);
    setFormNis('');
    setFormNama('');
    setFormKelas('X-A');
    setFormTahun('2025/2026');
    setFormGender('L');
    setFormTelepon('');
    setFormFoto(null);
    setFormError(null);
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
    setFormError(null);
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
      setFormError(err instanceof Error ? err.message : 'Gagal memproses foto.');
    } finally {
      setPhotoCompressing(false);
    }
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const nis = formNis.trim();
    const nama = formNama.trim();
    const kelas = formKelas.trim().toUpperCase();
    const tahun = formTahun.trim();

    if (!nis || !nama || !kelas) {
      setFormError('NIS, Nama Lengkap, dan Kelas wajib diisi.');
      return;
    }

    if (!NIS_REGEX.test(nis)) {
      setFormError(
        'Format NIS tidak valid. Gunakan 3–32 karakter huruf, angka, tanda hubung (-), atau garis bawah (_).'
      );
      return;
    }

    // Strict duplicate NIS prevention on creation
    if (!editingNis) {
      const duplicate = students.find((s) => s.nis.toLowerCase() === nis.toLowerCase());
      if (duplicate) {
        setFormError(
          `NIS "${nis}" sudah terdaftar atas nama ${duplicate.nama} (Kelas ${duplicate.kelas}). NIS tidak boleh ganda!`
        );
        return;
      }
    }

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
    setSelectedNisSet((prev) => {
      if (!prev.has(st.nis)) return prev;
      const next = new Set(prev);
      next.delete(st.nis);
      return next;
    });
    await addAdminLog('HAPUS_MURID', `Menghapus murid ${st.nama} (${st.nis})`);
    setNotice({ type: 'ok', text: `Data murid ${st.nama} dihapus.` });
  };

  const openBulkDeleteModal = (initialScope?: BulkDeleteScope) => {
    const scope =
      initialScope || (activeSelectedCount > 0 ? 'selected' : 'filtered');
    setBulkDeleteScope(scope);
    setDeleteAllConfirmText('');
    setBulkDeleteModalOpen(true);
  };

  const bulkDeleteTargets = useMemo(() => {
    if (bulkDeleteScope === 'selected') {
      return students.filter((s) => selectedNisSet.has(s.nis));
    }
    if (bulkDeleteScope === 'filtered') {
      return filteredStudents;
    }
    return students;
  }, [bulkDeleteScope, students, selectedNisSet, filteredStudents]);

  const executeBulkDelete = async () => {
    if (bulkDeleteTargets.length === 0) return;
    if (bulkDeleteScope === 'all' && deleteAllConfirmText.trim().toUpperCase() !== 'HAPUS') {
      return;
    }

    setBulkDeleteBusy(true);
    try {
      const targetNis = bulkDeleteTargets.map((s) => s.nis);
      await bulkDeleteStudents(targetNis);

      setSelectedNisSet((prev) => {
        const next = new Set(prev);
        targetNis.forEach((n) => next.delete(n));
        return next;
      });

      const scopeDesc =
        bulkDeleteScope === 'selected'
          ? 'murid terpilih'
          : bulkDeleteScope === 'filtered'
            ? `filter aktif (Kelas: ${classFilter}, Tahun: ${yearFilter})`
            : 'seluruh database murid';

      await addAdminLog(
        'HAPUS_MASSAL_MURID',
        `Menghapus massal ${targetNis.length} data murid (${scopeDesc})`
      );
      setBulkDeleteModalOpen(false);
      setNotice({
        type: 'ok',
        text: `${targetNis.length} data murid berhasil dihapus secara massal dan disinkronkan ke Firestore.`,
      });
    } finally {
      setBulkDeleteBusy(false);
    }
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
    setImportError(null);
    setImportBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      const imported: Student[] = [];
      const nowIso = new Date().toISOString();

      const seenNisInFile = new Map<string, number>();
      const duplicateInFileDetails: string[] = [];
      const duplicateInDbDetails: string[] = [];
      const invalidNisRows: string[] = [];

      const existingByNisLower = new Map<string, Student>();
      students.forEach((s) => existingByNisLower.set(s.nis.toLowerCase(), s));

      rows.forEach((row, index) => {
        const excelRowNumber = index + 2; // Row 1 is header
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

        if (!nis && !nama && !kelas) return; // Skip completely blank rows

        if (!nis || !nama || !kelas) {
          invalidNisRows.push(`Baris ${excelRowNumber} (kolom nis/nama/kelas tidak lengkap)`);
          return;
        }

        if (!NIS_REGEX.test(nis)) {
          invalidNisRows.push(`Baris ${excelRowNumber} (NIS "${nis}" harus 3–32 karakter huruf/angka/-/_)`);
          return;
        }

        const nisLower = nis.toLowerCase();
        const firstRow = seenNisInFile.get(nisLower);
        if (firstRow !== undefined) {
          duplicateInFileDetails.push(`NIS ${nis} (baris ${firstRow} & ${excelRowNumber})`);
          return;
        }
        seenNisInFile.set(nisLower, excelRowNumber);

        const existingMatch = existingByNisLower.get(nisLower);
        if (importMode === 'append_unique' && existingMatch) {
          duplicateInDbDetails.push(
            `NIS ${nis} di baris ${excelRowNumber} (sudah terdaftar: ${existingMatch.nama})`
          );
          return;
        }

        imported.push({
          id: nis,
          nis,
          nama,
          kelas,
          tahun: tahun || '2025/2026',
          jenisKelamin,
          telepon,
          foto:
            importMode === 'replace' && preservePhotosOnReplace
              ? existingMatch?.foto ?? null
              : null,
          updatedAt: nowIso,
        });
      });

      if (duplicateInFileDetails.length > 0) {
        const sample = duplicateInFileDetails.slice(0, 5).join(', ');
        const extra =
          duplicateInFileDetails.length > 5
            ? ` (+${duplicateInFileDetails.length - 5} lainnya)`
            : '';
        setImportError(
          `Impor dibatalkan! Ditemukan ${duplicateInFileDetails.length} NIS ganda di dalam file Excel: ${sample}${extra}. Pastikan setiap murid memiliki NIS unik.`
        );
        return;
      }

      if (importMode === 'append_unique' && duplicateInDbDetails.length > 0) {
        const sample = duplicateInDbDetails.slice(0, 4).join(', ');
        const extra =
          duplicateInDbDetails.length > 4
            ? ` (+${duplicateInDbDetails.length - 4} lainnya)`
            : '';
        setImportError(
          `Impor dibatalkan karena NIS tidak boleh ganda dengan data yang sudah ada: ${sample}${extra}. Gunakan mode "Replace Data Lama" jika ingin mengganti data.`
        );
        return;
      }

      if (invalidNisRows.length > 0 && imported.length === 0) {
        setImportError(
          `Tidak ada baris valid. Periksa: ${invalidNisRows.slice(0, 3).join('; ')}.`
        );
        return;
      }

      if (imported.length === 0) {
        setImportError(
          'Tidak ada baris valid yang terbaca. Pastikan kolom nis, nama, dan kelas terisi.'
        );
        return;
      }

      if (importMode === 'replace') {
        const prevCount = students.length;
        await replaceAllStudents(imported);
        setSelectedNisSet(new Set());
        await addAdminLog(
          'IMPOR_REPLACE_MURID',
          `Mengganti ${prevCount} data murid lama dengan ${imported.length} murid baru dari ${file.name}`
        );
        setNotice({
          type: 'ok',
          text: `Berhasil mengganti seluruh data murid lama dengan ${imported.length} data murid baru dari ${file.name}${
            invalidNisRows.length > 0 ? ` (${invalidNisRows.length} baris tidak valid dilewati)` : ''
          }.`,
        });
      } else {
        await bulkSaveStudents(imported);
        await addAdminLog(
          'IMPOR_TAMBAH_MURID',
          `Menambahkan ${imported.length} murid baru unik dari ${file.name}`
        );
        setNotice({
          type: 'ok',
          text: `Berhasil menambahkan ${imported.length} data murid baru (NIS unik) ke database.`,
        });
      }

      setImportModalOpen(false);
    } catch {
      setImportError('Gagal membaca file Excel/CSV. Pastikan format file valid (.xlsx, .xls, .csv).');
    } finally {
      setImportBusy(false);
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
              <span>Total {students.length} siswa terdaftar (NIS unik)</span>
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
                onClick={() => {
                  setImportError(null);
                  setImportMode('replace');
                  setImportModalOpen(true);
                }}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Impor Excel / CSV
              </button>
              <button
                type="button"
                disabled={students.length === 0}
                onClick={() => openBulkDeleteModal()}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
              >
                <Trash2 className="w-4 h-4" />
                Hapus Massal
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

        {/* Bulk Selection Toolbar */}
        {canModify && activeSelectedCount > 0 && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-bold text-rose-900 tabular-nums">
              {activeSelectedCount} murid dipilih untuk aksi massal
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedNisSet(new Set())}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
              >
                Batal Pilih
              </button>
              <button
                type="button"
                onClick={() => openBulkDeleteModal('selected')}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Terpilih ({activeSelectedCount})
              </button>
            </div>
          </div>
        )}

        {/* Students Data Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                {canModify && (
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua murid pada filter ini"
                      checked={allFilteredSelected}
                      onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
                      className="w-4 h-4 rounded accent-blue-700 cursor-pointer"
                    />
                  </th>
                )}
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
                    colSpan={canModify ? 9 : 7}
                    className="py-10 text-center text-sm text-slate-400"
                  >
                    {students.length === 0
                      ? 'Database murid kosong. Tambahkan murid manual atau impor dari file Excel/CSV.'
                      : 'Tidak ada data murid yang cocok dengan filter pencarian.'}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((st) => {
                  const isSelected = selectedNisSet.has(st.nis);
                  return (
                    <tr
                      key={st.nis}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      {canModify && (
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Pilih ${st.nama}`}
                            checked={isSelected}
                            onChange={() => toggleSelectOne(st.nis)}
                            className="w-4 h-4 rounded accent-blue-700 cursor-pointer"
                          />
                        </td>
                      )}
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
                  );
                })
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

            {formError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleSaveStudent(e)} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">NIS (Unik) *</label>
                  <input
                    type="text"
                    required
                    readOnly={Boolean(editingNis)}
                    value={formNis}
                    onChange={(e) => {
                      setFormNis(e.target.value);
                      if (formError) setFormError(null);
                    }}
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
              {/* Mode Selector */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('replace');
                    setImportError(null);
                  }}
                  className={`py-2 px-3 rounded-lg font-semibold transition-colors ${
                    importMode === 'replace'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Replace Data Lama (Ganti Total)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportMode('append_unique');
                    setImportError(null);
                  }}
                  className={`py-2 px-3 rounded-lg font-semibold transition-colors ${
                    importMode === 'append_unique'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tambah Baru (NIS Unik)
                </button>
              </div>

              {importMode === 'replace' ? (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong>Replace Total Aktif:</strong> Seluruh {students.length} data murid lama
                      akan dihapus dan diganti dengan data baru dari file. Impor otomatis ditolak
                      jika ditemukan <strong>NIS ganda</strong> di dalam file.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 font-semibold cursor-pointer pl-6">
                    <input
                      type="checkbox"
                      checked={preservePhotosOnReplace}
                      onChange={(e) => setPreservePhotosOnReplace(e.target.checked)}
                      className="w-3.5 h-3.5 accent-amber-700"
                    />
                    Pertahankan pas foto lama jika NIS sama
                  </label>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900">
                  Menambahkan murid baru tanpa menghapus data lama. Impor ditolak jika terdapat NIS
                  ganda di dalam file atau NIS sudah terdaftar di database.
                </div>
              )}

              {importError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 font-medium flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

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
                  if (file && !importBusy) void processExcelFile(file);
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
                  disabled={importBusy}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void processExcelFile(file);
                  }}
                />
                <label
                  htmlFor="excel-import-input"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="w-8 h-8 text-emerald-700" />
                  <span className="font-bold text-sm text-slate-800">
                    {importBusy
                      ? 'Memvalidasi NIS & Mengimpor Data...'
                      : 'Tarik & Lepas File di Sini atau Klik untuk Memilih'}
                  </span>
                  <span className="text-slate-500">Mendukung format .xlsx, .xls, dan .csv</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Students Modal */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-rose-800 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-600" />
                Hapus Data Murid Massal
              </h3>
              <button
                type="button"
                onClick={() => setBulkDeleteModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <p className="text-slate-600 font-medium">
                Pilih cakupan data murid yang akan dihapus permanen dari aplikasi dan Firebase:
              </p>

              <label
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer ${
                  bulkDeleteScope === 'selected'
                    ? 'border-rose-500 bg-rose-50/70'
                    : 'border-slate-200 hover:bg-slate-50'
                } ${activeSelectedCount === 0 ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="bulkDeleteScope"
                    disabled={activeSelectedCount === 0}
                    checked={bulkDeleteScope === 'selected'}
                    onChange={() => setBulkDeleteScope('selected')}
                    className="accent-rose-600"
                  />
                  <div>
                    <div className="font-bold text-slate-900">Murid Terpilih (Centang Tabel)</div>
                    <div className="text-slate-500">Hanya murid yang dicentang pada tabel</div>
                  </div>
                </div>
                <span className="font-mono font-bold text-rose-700 tabular-nums">
                  {activeSelectedCount} murid
                </span>
              </label>

              <label
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer ${
                  bulkDeleteScope === 'filtered'
                    ? 'border-rose-500 bg-rose-50/70'
                    : 'border-slate-200 hover:bg-slate-50'
                } ${filteredStudents.length === 0 ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="bulkDeleteScope"
                    disabled={filteredStudents.length === 0}
                    checked={bulkDeleteScope === 'filtered'}
                    onChange={() => setBulkDeleteScope('filtered')}
                    className="accent-rose-600"
                  />
                  <div>
                    <div className="font-bold text-slate-900">Semua Murid pada Filter Aktif</div>
                    <div className="text-slate-500">
                      Kelas: {classFilter === 'ALL' ? 'Semua' : classFilter} · Tahun:{' '}
                      {yearFilter === 'ALL' ? 'Semua' : yearFilter}
                    </div>
                  </div>
                </div>
                <span className="font-mono font-bold text-rose-700 tabular-nums">
                  {filteredStudents.length} murid
                </span>
              </label>

              <label
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer ${
                  bulkDeleteScope === 'all'
                    ? 'border-rose-500 bg-rose-50/70'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="bulkDeleteScope"
                    checked={bulkDeleteScope === 'all'}
                    onChange={() => setBulkDeleteScope('all')}
                    className="accent-rose-600"
                  />
                  <div>
                    <div className="font-bold text-slate-900">Seluruh Data Murid di Database</div>
                    <div className="text-slate-500">Mengosongkan seluruh daftar murid sekolah</div>
                  </div>
                </div>
                <span className="font-mono font-bold text-rose-700 tabular-nums">
                  {students.length} murid
                </span>
              </label>
            </div>

            {bulkDeleteScope === 'all' && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                <p className="font-semibold text-rose-900">
                  Ketik <span className="font-mono font-bold">HAPUS</span> untuk mengonfirmasi
                  penghapusan seluruh {students.length} data murid:
                </p>
                <input
                  type="text"
                  value={deleteAllConfirmText}
                  onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                  placeholder="Ketik HAPUS..."
                  className="w-full px-3 py-2 border border-rose-300 rounded-lg bg-white font-mono uppercase"
                />
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={bulkDeleteBusy}
                onClick={() => setBulkDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={
                  bulkDeleteBusy ||
                  bulkDeleteTargets.length === 0 ||
                  (bulkDeleteScope === 'all' && deleteAllConfirmText.trim().toUpperCase() !== 'HAPUS')
                }
                onClick={() => void executeBulkDelete()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
              >
                <Trash2 className="w-4 h-4" />
                {bulkDeleteBusy
                  ? 'Menghapus...'
                  : `Hapus ${bulkDeleteTargets.length} Murid Permanen`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
