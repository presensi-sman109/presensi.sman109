import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Printer,
  Search,
  User,
  Users,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import {
  formatIndonesianDate,
  getDaysInMonth,
  getDisciplinePredicate,
  getEffectiveDaysInMonth,
  getHomeroomForClass,
  getTodayWib,
  isWeekendDay,
  MONTH_NAMES_ID,
  statusCodeShort,
} from '../lib/utils';
import type { AttendanceRecord, AttendanceStatus, Student } from '../types';
import { SchoolLogo, SchoolStampSvg } from './SchoolLogo';

type ReportSubMode = 'range' | 'monthly_matrix' | 'monthly_summary' | 'individual';

export const ReportTab: React.FC = () => {
  const {
    students,
    attendances,
    settings,
    activeAdmin,
    recordAttendance,
    addAdminLog,
  } = useAppData();

  const todayStr = getTodayWib();
  const [nowYear, nowMonth] = todayStr.split('-').map(Number);

  const [subMode, setSubMode] = useState<ReportSubMode>('range');

  // Range mode filters
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [classFilter, setClassFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Monthly & Individual mode filters
  const [selectedMonth, setSelectedMonth] = useState<number>(nowMonth - 1); // 0-11
  const [selectedYear, setSelectedYear] = useState<number>(nowYear);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedIndividualNis, setSelectedIndividualNis] = useState<string>(
    students[0]?.nis || ''
  );
  const [printAllClassIndividual, setPrintAllClassIndividual] = useState(false);

  const classes = useMemo(
    () => Array.from(new Set(students.map((s) => s.kelas))).sort(),
    [students]
  );

  // --- RANGE MODE COMPUTATION ---
  const filteredRange = useMemo(() => {
    return attendances
      .filter((a) => {
        const matchDate = (!startDate || a.date >= startDate) && (!endDate || a.date <= endDate);
        const matchClass = classFilter === 'ALL' || a.kelas === classFilter;
        const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
        return matchDate && matchClass && matchStatus;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  }, [attendances, startDate, endDate, classFilter, statusFilter]);

  const rangeKpi = useMemo(() => {
    const total = filteredRange.length;
    const hadir = filteredRange.filter((a) => a.status === 'Hadir').length;
    const sakit = filteredRange.filter((a) => a.status === 'Sakit').length;
    const ijin = filteredRange.filter((a) => a.status === 'Ijin').length;
    const alpa = filteredRange.filter((a) => a.status === 'Alpa').length;
    const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : '0.0');
    return {
      total,
      hadir,
      sakit,
      ijin,
      alpa,
      pctHadir: pct(hadir),
      pctSakit: pct(sakit),
      pctIjin: pct(ijin),
      pctAlpa: pct(alpa),
    };
  }, [filteredRange]);

  const handleRangeStatusUpdate = async (rec: AttendanceRecord, status: AttendanceStatus) => {
    await recordAttendance({
      ...rec,
      status,
      recordedBy: activeAdmin?.nama || rec.recordedBy,
      updatedAt: new Date().toISOString(),
    });
    await addAdminLog(
      'UBAH_STATUS',
      `Mengubah status laporan ${rec.nama} (${rec.date}) menjadi ${status}`
    );
  };

  const exportRangeExcel = () => {
    const rows = filteredRange.map((a, idx) => ({
      No: idx + 1,
      Tanggal: a.date,
      'Waktu (WIB)': `${a.time} WIB`,
      NIS: a.nis,
      'Nama Lengkap': a.nama,
      Kelas: a.kelas,
      Status: a.status,
      Catatan: a.notes || '-',
      Petugas: a.recordedBy,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 },
      { wch: 13 },
      { wch: 14 },
      { wch: 15 },
      { wch: 28 },
      { wch: 10 },
      { wch: 12 },
      { wch: 24 },
      { wch: 22 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Presensi');
    XLSX.writeFile(wb, `Rekap_Presensi_SMAN109_${startDate}_sd_${endDate}.xlsx`);
  };

  // --- MONTHLY & INDIVIDUAL COMPUTATION ---
  const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const effectiveDays = getEffectiveDaysInMonth(selectedYear, selectedMonth);

  const monthStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students
      .filter((s) => classFilter === 'ALL' || s.kelas === classFilter)
      .filter(
        (s) => !q || s.nama.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q)
      )
      .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));
  }, [students, classFilter, studentSearch]);

  const monthRecordsByKey = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    attendances
      .filter((a) => a.date.startsWith(monthPrefix))
      .forEach((a) => {
        map.set(`${a.nis}_${a.date}`, a);
      });
    return map;
  }, [attendances, monthPrefix]);

  const computeStudentMonthStats = (st: Student) => {
    let hadir = 0;
    let sakit = 0;
    let ijin = 0;
    let alpa = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const rec = monthRecordsByKey.get(`${st.nis}_${dateStr}`);
      if (rec) {
        if (rec.status === 'Hadir') hadir++;
        else if (rec.status === 'Sakit') sakit++;
        else if (rec.status === 'Ijin') ijin++;
        else if (rec.status === 'Alpa') alpa++;
      }
    }
    const pct = effectiveDays > 0 ? Math.round((hadir / effectiveDays) * 1000) / 10 : 0;
    return { hadir, sakit, ijin, alpa, pct };
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(selectedYear, selectedMonth + delta, 1);
    setSelectedYear(d.getFullYear());
    setSelectedMonth(d.getMonth());
  };

  const jumpToCurrentMonth = () => {
    setSelectedYear(nowYear);
    setSelectedMonth(nowMonth - 1);
  };

  const exportMonthlyExcel = () => {
    const rows = monthStudents.map((st, idx) => {
      const stats = computeStudentMonthStats(st);
      const base: Record<string, string | number> = {
        No: idx + 1,
        NIS: st.nis,
        'Nama Lengkap': st.nama,
        Kelas: st.kelas,
      };
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
        const rec = monthRecordsByKey.get(`${st.nis}_${dateStr}`);
        base[`Tgl ${d}`] = rec
          ? statusCodeShort(rec.status)
          : isWeekendDay(selectedYear, selectedMonth, d)
          ? '•'
          : '-';
      }
      base['Hadir (H)'] = stats.hadir;
      base['Sakit (S)'] = stats.sakit;
      base['Ijin (I)'] = stats.ijin;
      base['Alpa (A)'] = stats.alpa;
      base['% Kehadiran'] = `${stats.pct}%`;
      return base;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${MONTH_NAMES_ID[selectedMonth]} ${selectedYear}`);
    XLSX.writeFile(
      wb,
      `Rekap_Bulanan_SMAN109_${MONTH_NAMES_ID[selectedMonth]}_${selectedYear}_${classFilter}.xlsx`
    );
  };

  const activeIndividualStudent =
    monthStudents.find((s) => s.nis === selectedIndividualNis) ||
    students.find((s) => s.nis === selectedIndividualNis) ||
    monthStudents[0] ||
    null;

  const exportIndividualExcel = (st: Student) => {
    const rows = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const weekend = isWeekendDay(selectedYear, selectedMonth, d);
      const rec = monthRecordsByKey.get(`${st.nis}_${dateStr}`);
      rows.push({
        Tanggal: dateStr,
        Hari: new Date(selectedYear, selectedMonth, d).toLocaleDateString('id-ID', {
          weekday: 'long',
        }),
        'Jam Scan (WIB)': rec ? `${rec.time} WIB` : '-',
        Status: rec ? rec.status : weekend ? 'Libur Akhir Pekan' : 'Belum Tercatat',
        Catatan: rec?.notes || '-',
      });
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 13 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, st.nis);
    XLSX.writeFile(
      wb,
      `Rapor_Kehadiran_${st.nama.replace(/\s+/g, '_')}_${MONTH_NAMES_ID[selectedMonth]}_${selectedYear}.xlsx`
    );
  };

  const handlePrintMonthly = (massIndividual = false) => {
    setPrintAllClassIndividual(massIndividual);
    void addAdminLog(
      'CETAK_LAPORAN',
      `Mencetak laporan ${subMode}${massIndividual ? ' (Massal 1 Kelas)' : ''} bulan ${
        MONTH_NAMES_ID[selectedMonth]
      } ${selectedYear}`
    );
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const isLandscapePrint = subMode === 'monthly_matrix';

  // Split summary students into A4 Portrait pages (24 students per page)
  const summaryPages = useMemo(() => {
    const pages: Student[][] = [];
    for (let i = 0; i < monthStudents.length; i += 24) {
      pages.push(monthStudents.slice(i, i + 24));
    }
    return pages.length > 0 ? pages : [[]];
  }, [monthStudents]);

  // Split matrix students into A4 Landscape pages (16 students per page)
  const matrixPages = useMemo(() => {
    const pages: Student[][] = [];
    for (let i = 0; i < monthStudents.length; i += 16) {
      pages.push(monthStudents.slice(i, i + 16));
    }
    return pages.length > 0 ? pages : [[]];
  }, [monthStudents]);

  const individualPrintTargets = useMemo(() => {
    if (printAllClassIndividual) return monthStudents;
    return activeIndividualStudent ? [activeIndividualStudent] : [];
  }, [printAllClassIndividual, monthStudents, activeIndividualStudent]);

  return (
    <div className="space-y-6">
      <style>{`@media print { @page { size: A4 ${
        isLandscapePrint ? 'landscape' : 'portrait'
      }; margin: 10mm; } }`}</style>

      {/* Main Controls & Sub-Mode Selector (No-Print) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Rekapitulasi, Ekspor Excel, & Cetak Laporan Resmi A4
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau persentase kehadiran real-time, cetak matriks bulanan 1–31, dan rapor
              individu murid lengkap dengan tanda tangan resmi.
            </p>
          </div>

          {/* Segmented Mode Switch */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setSubMode('range')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                subMode === 'range'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Riwayat & Ekspor
            </button>
            <button
              type="button"
              onClick={() => setSubMode('monthly_matrix')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                subMode === 'monthly_matrix'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Matriks 1–31 (Lanskap A4)
            </button>
            <button
              type="button"
              onClick={() => setSubMode('monthly_summary')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                subMode === 'monthly_summary'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rekap Ringkas (Potret A4)
            </button>
            <button
              type="button"
              onClick={() => setSubMode('individual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                subMode === 'individual'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rapor Individu (1 Bulan)
            </button>
          </div>
        </div>

        {/* SUB-MODE 1: DATE RANGE HISTORY & EXCEL EXPORT */}
        {subMode === 'range' && (
          <div className="space-y-5">
            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl items-end text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dari Tanggal</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sampai Tanggal</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kelas</label>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
                >
                  <option value="ALL">Semua Kelas</option>
                  {classes.map((c) => (
                    <option key={c} value={c}>
                      Kelas {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="Hadir">Hadir</option>
                  <option value="Sakit">Sakit</option>
                  <option value="Ijin">Ijin</option>
                  <option value="Alpa">Alpa</option>
                </select>
              </div>
              <button
                type="button"
                onClick={exportRangeExcel}
                disabled={filteredRange.length === 0}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Ekspor Excel (.xlsx)
              </button>
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <div className="text-xs font-medium text-slate-500">Total Hadir</div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                    {rangeKpi.hadir}
                  </span>
                  <span className="text-xs font-mono font-semibold text-emerald-700">
                    {rangeKpi.pctHadir}%
                  </span>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <div className="text-xs font-medium text-slate-500">Total Sakit</div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-sky-700">
                    {rangeKpi.sakit}
                  </span>
                  <span className="text-xs font-mono font-semibold text-sky-700">
                    {rangeKpi.pctSakit}%
                  </span>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <div className="text-xs font-medium text-slate-500">Total Ijin</div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-amber-600">
                    {rangeKpi.ijin}
                  </span>
                  <span className="text-xs font-mono font-semibold text-amber-600">
                    {rangeKpi.pctIjin}%
                  </span>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <div className="text-xs font-medium text-slate-500">Total Alpa</div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-rose-700">
                    {rangeKpi.alpa}
                  </span>
                  <span className="text-xs font-mono font-semibold text-rose-700">
                    {rangeKpi.pctAlpa}%
                  </span>
                </div>
              </div>
            </div>

            {/* History Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Tanggal</th>
                    <th className="py-3 px-4 font-semibold">Waktu (WIB)</th>
                    <th className="py-3 px-4 font-semibold">NIS</th>
                    <th className="py-3 px-4 font-semibold">Nama Murid</th>
                    <th className="py-3 px-4 font-semibold">Kelas</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Petugas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRange.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                        Tidak ada riwayat presensi pada rentang tanggal ini.
                      </td>
                    </tr>
                  ) : (
                    filteredRange.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700">
                          {rec.date}
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">
                          {rec.time} WIB
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-slate-700">
                          {rec.nis}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-900">{rec.nama}</td>
                        <td className="py-2.5 px-4 font-semibold text-blue-800">{rec.kelas}</td>
                        <td className="py-2.5 px-4">
                          <select
                            value={rec.status}
                            onChange={(e) =>
                              void handleRangeStatusUpdate(
                                rec,
                                e.target.value as AttendanceStatus
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                              rec.status === 'Hadir'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : rec.status === 'Sakit'
                                ? 'bg-sky-50 text-sky-800 border-sky-200'
                                : rec.status === 'Ijin'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}
                          >
                            <option value="Hadir">Hadir</option>
                            <option value="Sakit">Sakit</option>
                            <option value="Ijin">Ijin</option>
                            <option value="Alpa">Alpa</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-4 text-xs text-slate-500">{rec.recordedBy}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUB-MODES 2, 3, 4: FLEXIBLE MONTH/YEAR SELECTOR TOOLBAR */}
        {subMode !== 'range' && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
                  title="Bulan Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-2 py-1 font-bold text-slate-900 bg-transparent focus:outline-none"
                >
                  {MONTH_NAMES_ID.map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-2 py-1 font-mono font-bold text-slate-900 bg-transparent focus:outline-none"
                >
                  {[nowYear - 2, nowYear - 1, nowYear, nowYear + 1].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
                  title="Bulan Berikutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={jumpToCurrentMonth}
                className="px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5 text-blue-700" />
                Bulan Ini
              </button>

              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
              >
                <option value="ALL">Semua Kelas</option>
                {classes.map((c) => (
                  <option key={c} value={c}>
                    Kelas {c}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Cari nama / NIS..."
                  className="pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-white w-44"
                />
              </div>

              {subMode === 'individual' && (
                <select
                  value={activeIndividualStudent?.nis || ''}
                  onChange={(e) => setSelectedIndividualNis(e.target.value)}
                  className="px-3 py-2 border border-blue-400 rounded-lg bg-white font-bold text-slate-900 max-w-[240px]"
                >
                  {monthStudents.map((s) => (
                    <option key={s.nis} value={s.nis}>
                      {s.nama} ({s.kelas})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {subMode !== 'individual' ? (
                <>
                  <button
                    type="button"
                    onClick={exportMonthlyExcel}
                    className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg inline-flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Ekspor Excel Bulanan
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintMonthly(false)}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    Cetak A4 ({subMode === 'monthly_matrix' ? 'Lanskap' : 'Potret'})
                  </button>
                </>
              ) : (
                <>
                  {activeIndividualStudent && (
                    <button
                      type="button"
                      onClick={() => exportIndividualExcel(activeIndividualStudent)}
                      className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg inline-flex items-center gap-1.5"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Ekspor Excel Murid
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePrintMonthly(false)}
                    disabled={!activeIndividualStudent}
                    className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <User className="w-4 h-4" />
                    Cetak Individu (A4)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintMonthly(true)}
                    disabled={monthStudents.length === 0}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Users className="w-4 h-4" />
                    Cetak Massal 1 Kelas ({monthStudents.length})
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* PREVIEW & PRINTABLE DOCUMENT AREA */}
      {subMode === 'monthly_matrix' && (
        <div className="space-y-6">
          {matrixPages.map((pageStudents, pageIdx) => (
            <div
              key={`matrix-page-${pageIdx}`}
              className={`bg-white border border-slate-300 rounded-xl p-6 overflow-x-auto print:border-none print:rounded-none print:p-0 ${
                pageIdx < matrixPages.length - 1 ? 'print-page-break' : ''
              }`}
            >
              {/* Official School Kop */}
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4 gap-4">
                <div className="flex items-center gap-3">
                  <SchoolLogo customLogo={settings.customLogo} className="w-12 h-12 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Pemerintah Provinsi DKI Jakarta · Dinas Pendidikan
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      {settings.schoolName}
                    </h3>
                    <p className="text-[11px] text-slate-600">
                      {settings.address} · NPSN: {settings.npsn}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-bold text-slate-900 uppercase">
                    Matriks Kehadiran Bulanan (1–{daysInMonth})
                  </div>
                  <div className="font-mono text-slate-700">
                    Periode: {MONTH_NAMES_ID[selectedMonth]} {selectedYear} · Kelas:{' '}
                    {classFilter === 'ALL' ? 'Semua' : classFilter}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Tahun Ajaran {settings.academicYear} · Hari Efektif: {effectiveDays} hari
                  </div>
                </div>
              </div>

              {/* 1-31 Matrix Table */}
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-900">
                    <th className="border border-slate-400 px-1.5 py-1 text-center">No</th>
                    <th className="border border-slate-400 px-1.5 py-1 text-left">NIS</th>
                    <th className="border border-slate-400 px-2 py-1 text-left min-w-[130px]">
                      Nama Murid
                    </th>
                    <th className="border border-slate-400 px-1 py-1 text-center">Kls</th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                      const wk = isWeekendDay(selectedYear, selectedMonth, day);
                      return (
                        <th
                          key={day}
                          className={`border border-slate-400 w-5 py-1 text-center font-mono ${
                            wk ? 'bg-slate-200 text-slate-500' : ''
                          }`}
                        >
                          {day}
                        </th>
                      );
                    })}
                    <th className="border border-slate-400 px-1 py-1 text-center bg-emerald-50">
                      H
                    </th>
                    <th className="border border-slate-400 px-1 py-1 text-center bg-sky-50">S</th>
                    <th className="border border-slate-400 px-1 py-1 text-center bg-amber-50">
                      I
                    </th>
                    <th className="border border-slate-400 px-1 py-1 text-center bg-rose-50">
                      A
                    </th>
                    <th className="border border-slate-400 px-1.5 py-1 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {pageStudents.map((st, idx) => {
                    const stats = computeStudentMonthStats(st);
                    return (
                      <tr key={st.nis}>
                        <td className="border border-slate-300 px-1 py-1 text-center font-mono">
                          {pageIdx * 16 + idx + 1}
                        </td>
                        <td className="border border-slate-300 px-1.5 py-1 font-mono">
                          {st.nis}
                        </td>
                        <td className="border border-slate-300 px-2 py-1 font-semibold text-slate-900">
                          {st.nama}
                        </td>
                        <td className="border border-slate-300 px-1 py-1 text-center font-semibold">
                          {st.kelas}
                        </td>
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                          const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
                          const rec = monthRecordsByKey.get(`${st.nis}_${dateStr}`);
                          const wk = isWeekendDay(selectedYear, selectedMonth, day);
                          const code = rec ? statusCodeShort(rec.status) : wk ? '•' : '';
                          return (
                            <td
                              key={day}
                              className={`border border-slate-300 text-center font-mono font-bold ${
                                wk ? 'bg-slate-100 text-slate-400' : ''
                              } ${
                                code === 'H'
                                  ? 'text-emerald-700'
                                  : code === 'S'
                                  ? 'text-sky-700'
                                  : code === 'I'
                                  ? 'text-amber-700'
                                  : code === 'A'
                                  ? 'text-rose-700'
                                  : ''
                              }`}
                            >
                              {code}
                            </td>
                          );
                        })}
                        <td className="border border-slate-300 px-1 py-1 text-center font-mono font-bold text-emerald-700">
                          {stats.hadir}
                        </td>
                        <td className="border border-slate-300 px-1 py-1 text-center font-mono font-bold text-sky-700">
                          {stats.sakit}
                        </td>
                        <td className="border border-slate-300 px-1 py-1 text-center font-mono font-bold text-amber-700">
                          {stats.ijin}
                        </td>
                        <td className="border border-slate-300 px-1 py-1 text-center font-mono font-bold text-rose-700">
                          {stats.alpa}
                        </td>
                        <td className="border border-slate-300 px-1.5 py-1 text-right font-mono font-bold">
                          {stats.pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-2 text-[10px] text-slate-500 flex justify-between">
                <span>Keterangan Kode: H = Hadir · S = Sakit · I = Ijin · A = Alpa · • = Libur</span>
                <span>
                  Halaman {pageIdx + 1} / {matrixPages.length}
                </span>
              </div>

              {/* Official Signatures */}
              <div className="mt-6 grid grid-cols-2 gap-8 text-xs text-slate-800">
                <div className="relative">
                  <div>Mengetahui,</div>
                  <div className="font-bold">Kepala {settings.schoolName}</div>
                  <SchoolStampSvg className="w-16 h-16 absolute left-20 top-4 opacity-55 pointer-events-none" />
                  <div className="h-14" />
                  <div className="font-bold underline">{settings.principalName}</div>
                  <div className="font-mono text-[11px]">NIP. {settings.principalNip}</div>
                </div>
                <div className="text-right">
                  <div>
                    Jakarta, {daysInMonth} {MONTH_NAMES_ID[selectedMonth]} {selectedYear}
                  </div>
                  <div className="font-bold">Wali Kelas / Koordinator Piket</div>
                  <div className="h-14" />
                  <div className="font-bold underline">
                    {classFilter !== 'ALL'
                      ? getHomeroomForClass(classFilter, settings.homeroomTeachers)
                      : activeAdmin?.nama || 'Koordinator Presensi'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {subMode === 'monthly_summary' && (
        <div className="space-y-6">
          {summaryPages.map((pageStudents, pageIdx) => (
            <div
              key={`summary-page-${pageIdx}`}
              className={`bg-white border border-slate-300 rounded-xl p-8 max-w-[210mm] mx-auto print:border-none print:rounded-none print:p-0 ${
                pageIdx < summaryPages.length - 1 ? 'print-page-break' : ''
              }`}
            >
              {/* Official School Kop */}
              <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-3 mb-5">
                <SchoolLogo customLogo={settings.customLogo} className="w-14 h-14 shrink-0" />
                <div className="flex-1 text-center">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Pemerintah Provinsi DKI Jakarta · Dinas Pendidikan
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900">{settings.schoolName}</h3>
                  <p className="text-xs text-slate-600">
                    {settings.address} · NPSN: {settings.npsn}
                  </p>
                </div>
              </div>

              <div className="text-center mb-4">
                <h4 className="font-bold text-sm uppercase underline text-slate-900">
                  Rekapitulasi Ringkas Kehadiran Siswa
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Bulan {MONTH_NAMES_ID[selectedMonth]} {selectedYear} · Tahun Ajaran{' '}
                  {settings.academicYear} · Hari Efektif: {effectiveDays} Hari
                </p>
              </div>

              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-900">
                    <th className="border border-slate-400 px-2 py-2 text-center">No</th>
                    <th className="border border-slate-400 px-2 py-2 text-left">NIS</th>
                    <th className="border border-slate-400 px-3 py-2 text-left">Nama Lengkap</th>
                    <th className="border border-slate-400 px-2 py-2 text-center">Kelas</th>
                    <th className="border border-slate-400 px-2 py-2 text-center">Hadir</th>
                    <th className="border border-slate-400 px-2 py-2 text-center">Sakit</th>
                    <th className="border border-slate-400 px-2 py-2 text-center">Ijin</th>
                    <th className="border border-slate-400 px-2 py-2 text-center">Alpa</th>
                    <th className="border border-slate-400 px-2 py-2 text-right">% Kehadiran</th>
                  </tr>
                </thead>
                <tbody>
                  {pageStudents.map((st, idx) => {
                    const stats = computeStudentMonthStats(st);
                    return (
                      <tr key={st.nis}>
                        <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                          {pageIdx * 24 + idx + 1}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 font-mono">{st.nis}</td>
                        <td className="border border-slate-300 px-3 py-1.5 font-semibold text-slate-900">
                          {st.nama}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-center font-semibold">
                          {st.kelas}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-bold text-emerald-700">
                          {stats.hadir}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-bold text-sky-700">
                          {stats.sakit}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-bold text-amber-700">
                          {stats.ijin}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-bold text-rose-700">
                          {stats.alpa}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right font-mono font-bold">
                          {stats.pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-8 grid grid-cols-2 gap-8 text-xs text-slate-800">
                <div className="relative">
                  <div>Mengetahui,</div>
                  <div className="font-bold">Kepala Sekolah</div>
                  <SchoolStampSvg className="w-16 h-16 absolute left-16 top-4 opacity-55 pointer-events-none" />
                  <div className="h-14" />
                  <div className="font-bold underline">{settings.principalName}</div>
                  <div className="font-mono text-[11px]">NIP. {settings.principalNip}</div>
                </div>
                <div className="text-right">
                  <div>
                    Jakarta, {daysInMonth} {MONTH_NAMES_ID[selectedMonth]} {selectedYear}
                  </div>
                  <div className="font-bold">Wali Kelas</div>
                  <div className="h-14" />
                  <div className="font-bold underline">
                    {classFilter !== 'ALL'
                      ? getHomeroomForClass(classFilter, settings.homeroomTeachers)
                      : activeAdmin?.nama || 'Wali Kelas'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {subMode === 'individual' && (
        <div className="space-y-8">
          {individualPrintTargets.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">
              Tidak ada data murid yang dipilih.
            </div>
          ) : (
            individualPrintTargets.map((st, idx) => {
              const stats = computeStudentMonthStats(st);
              const predicate = getDisciplinePredicate(stats.pct);
              const homeroomText = getHomeroomForClass(st.kelas, settings.homeroomTeachers);

              return (
                <div
                  key={`ind-${st.nis}`}
                  className={`bg-white border border-slate-300 rounded-xl p-8 max-w-[210mm] mx-auto print:border-none print:rounded-none print:p-0 ${
                    idx < individualPrintTargets.length - 1 ? 'print-page-break' : ''
                  } ${!printAllClassIndividual || idx === 0 ? '' : 'hidden print:block'}`}
                >
                  {/* Official School Kop */}
                  <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-3 mb-4">
                    <SchoolLogo customLogo={settings.customLogo} className="w-14 h-14 shrink-0" />
                    <div className="flex-1 text-center">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        Pemerintah Provinsi Daerah Khusus Jakarta · Dinas Pendidikan
                      </div>
                      <h3 className="text-lg font-extrabold text-slate-900">
                        {settings.schoolName}
                      </h3>
                      <p className="text-[11px] text-slate-600">
                        {settings.address} · NPSN: {settings.npsn}
                      </p>
                    </div>
                  </div>

                  <div className="text-center mb-4">
                    <h4 className="font-bold text-sm uppercase underline text-slate-900">
                      Rapor Kehadiran Bulanan Siswa
                    </h4>
                    <p className="text-xs text-slate-600">
                      Periode: {MONTH_NAMES_ID[selectedMonth]} {selectedYear} · Tahun Ajaran{' '}
                      {settings.academicYear}
                    </p>
                  </div>

                  {/* Student Biodata */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs border border-slate-300 rounded-lg p-3 mb-4 bg-slate-50/50">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nama Lengkap:</span>
                      <span className="font-bold text-slate-900">{st.nama}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">NIS:</span>
                      <span className="font-mono font-bold text-slate-900">{st.nis}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Kelas:</span>
                      <span className="font-bold text-slate-900">{st.kelas}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Jenis Kelamin:</span>
                      <span className="font-semibold text-slate-900">
                        {st.jenisKelamin === 'P' ? 'Perempuan' : 'Laki-laki'}
                      </span>
                    </div>
                  </div>

                  {/* Real-time KPI Strip */}
                  <div className="grid grid-cols-7 gap-2 mb-4 text-center text-xs">
                    <div className="border border-slate-300 rounded-lg p-2">
                      <div className="text-[10px] text-slate-500">Hari Efektif</div>
                      <div className="font-mono font-bold text-sm text-slate-900">
                        {effectiveDays}
                      </div>
                    </div>
                    <div className="border border-slate-300 rounded-lg p-2">
                      <div className="text-[10px] text-slate-500">Hadir</div>
                      <div className="font-mono font-bold text-sm text-emerald-700">
                        {stats.hadir}
                      </div>
                    </div>
                    <div className="border border-slate-300 rounded-lg p-2">
                      <div className="text-[10px] text-slate-500">Sakit</div>
                      <div className="font-mono font-bold text-sm text-sky-700">
                        {stats.sakit}
                      </div>
                    </div>
                    <div className="border border-slate-300 rounded-lg p-2">
                      <div className="text-[10px] text-slate-500">Izin</div>
                      <div className="font-mono font-bold text-sm text-amber-700">
                        {stats.ijin}
                      </div>
                    </div>
                    <div className="border border-slate-300 rounded-lg p-2">
                      <div className="text-[10px] text-slate-500">Alpa</div>
                      <div className="font-mono font-bold text-sm text-rose-700">
                        {stats.alpa}
                      </div>
                    </div>
                    <div className="border border-slate-300 rounded-lg p-2">
                      <div className="text-[10px] text-slate-500">Kehadiran</div>
                      <div className="font-mono font-bold text-sm text-blue-800">
                        {stats.pct}%
                      </div>
                    </div>
                    <div className={`border rounded-lg p-2 ${predicate.colorClass}`}>
                      <div className="text-[10px] opacity-80">Predikat</div>
                      <div className="font-bold text-[11px] leading-tight mt-0.5">
                        {predicate.label}
                      </div>
                    </div>
                  </div>

                  {/* Daily Detail Table */}
                  <table className="w-full border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-900">
                        <th className="border border-slate-400 px-2 py-1 text-center w-8">Tgl</th>
                        <th className="border border-slate-400 px-2 py-1 text-left w-24">Hari</th>
                        <th className="border border-slate-400 px-2 py-1 text-center w-24">
                          Waktu Scan (WIB)
                        </th>
                        <th className="border border-slate-400 px-2 py-1 text-center w-28">
                          Status Kehadiran
                        </th>
                        <th className="border border-slate-400 px-2 py-1 text-left">
                          Catatan / Keterangan Petugas
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                        const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
                        const weekend = isWeekendDay(selectedYear, selectedMonth, day);
                        const rec = monthRecordsByKey.get(`${st.nis}_${dateStr}`);
                        const dayName = new Date(selectedYear, selectedMonth, day).toLocaleDateString(
                          'id-ID',
                          { weekday: 'long' }
                        );
                        return (
                          <tr key={day} className={weekend ? 'bg-slate-100/80 text-slate-500' : ''}>
                            <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">
                              {day}
                            </td>
                            <td className="border border-slate-300 px-2 py-0.5">{dayName}</td>
                            <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">
                              {rec ? `${rec.time} WIB` : '-'}
                            </td>
                            <td className="border border-slate-300 px-2 py-0.5 text-center font-bold">
                              {rec
                                ? rec.status
                                : weekend
                                ? 'Libur Akhir Pekan'
                                : 'Belum Tercatat'}
                            </td>
                            <td className="border border-slate-300 px-2 py-0.5">
                              {rec?.notes || (rec ? `Dicatat oleh ${rec.recordedBy}` : '-')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* EXACT 3-COLUMN SIGNATURE POSITIONS AS REQUESTED */}
                  <div className="mt-6 grid grid-cols-3 gap-4 text-[11px] text-slate-900 pt-2">
                    {/* Paling Kiri: Mengetahui, Kepala Sekolah */}
                    <div className="relative text-left">
                      <div>Mengetahui,</div>
                      <div className="font-bold">Kepala Sekolah</div>
                      <SchoolStampSvg className="w-14 h-14 absolute left-14 top-3 opacity-60 pointer-events-none" />
                      <div className="h-12" />
                      <div className="font-bold underline">{settings.principalName}</div>
                      <div className="font-mono text-[10px]">NIP. {settings.principalNip}</div>
                    </div>

                    {/* Di Tengah: Diketahui, Orang Tua / Wali Murid */}
                    <div className="text-center">
                      <div>Diketahui,</div>
                      <div className="font-bold">Orang Tua / Wali Murid</div>
                      <div className="h-12" />
                      <div className="font-bold">(................................................)</div>
                      <div className="text-[10px] text-slate-500">Nama Terang & Tanda Tangan</div>
                    </div>

                    {/* Paling Kanan: Jakarta, [Tanggal], Wali Kelas */}
                    <div className="text-left pl-4">
                      <div>
                        Jakarta, {formatIndonesianDate(todayStr)}
                      </div>
                      <div className="font-bold">Wali Kelas {st.kelas}</div>
                      <div className="h-12" />
                      <div className="font-bold underline">{homeroomText}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
