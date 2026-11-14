import React, { useMemo, useState } from 'react';
import { CalendarDays, Check, Copy, UserX, Users } from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { formatIndonesianDate, getTimeWib, getTodayWib } from '../lib/utils';
import type { AttendanceStatus, Student } from '../types';
import { BulkDateAttendanceModal } from './BulkDateAttendanceModal';
import { StudentAvatar } from './SchoolLogo';

export const AbsentTab: React.FC = () => {
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

  const [classFilter, setClassFilter] = useState('ALL');
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const isSuperAdmin = activeAdmin?.role === 'super_admin';
  const todayWib = getTodayWib();

  const classes = useMemo(
    () => Array.from(new Set(students.map((s) => s.kelas))).sort(),
    [students]
  );

  const dateAttendances = useMemo(
    () => attendances.filter((a) => a.date === activeDate),
    [attendances, activeDate]
  );

  const recordedSet = useMemo(
    () => new Set(dateAttendances.map((a) => a.nis)),
    [dateAttendances]
  );

  const absentStudents = useMemo(
    () =>
      students
        .filter((s) => !recordedSet.has(s.nis))
        .filter((s) => classFilter === 'ALL' || s.kelas === classFilter)
        .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama)),
    [students, recordedSet, classFilter]
  );

  const classStats = useMemo(() => {
    return classes.map((kelas) => {
      const total = students.filter((s) => s.kelas === kelas).length;
      const recs = dateAttendances.filter((a) => a.kelas === kelas);
      const hadir = recs.filter((a) => a.status === 'Hadir').length;
      const pct = total > 0 ? Math.round((hadir / total) * 100) : 0;
      const belum = total - recs.length;
      return { kelas, total, hadir, belum, pct };
    });
  }, [classes, students, dateAttendances]);

  const handleQuickStatus = async (student: Student, status: AttendanceStatus) => {
    const timeNow = getTimeWib();
    await recordAttendance({
      id: `${student.nis}_${activeDate}`,
      nis: student.nis,
      nama: student.nama,
      kelas: student.kelas,
      date: activeDate,
      time: timeNow,
      status,
      notes: 'Dicatat dari menu Belum Absen',
      recordedBy: activeAdmin?.nama || 'Petugas Piket',
      updatedAt: new Date().toISOString(),
    });
    await addAdminLog(
      'UBAH_STATUS',
      `Set cepat ${status}: ${student.nama} (${student.kelas}) tanggal ${activeDate}`
    );
  };

  const handleCopyWhatsApp = async () => {
    const grouped = new Map<string, Student[]>();
    absentStudents.forEach((s) => {
      const arr = grouped.get(s.kelas) || [];
      arr.push(s);
      grouped.set(s.kelas, arr);
    });

    const lines: string[] = [
      `*REKAP MURID BELUM PRESENSI*`,
      `*${settings.schoolName}*`,
      `Tanggal: ${formatIndonesianDate(activeDate)}`,
      `Total Belum Tercatat: ${absentStudents.length} murid`,
      `--------------------------------`,
    ];

    if (absentStudents.length === 0) {
      lines.push('Seluruh murid telah tercatat kehadirannya hari ini.');
    } else {
      Array.from(grouped.entries()).forEach(([kelas, list]) => {
        lines.push(`\n*Kelas ${kelas}* (${list.length} murid):`);
        list.forEach((s, idx) => {
          lines.push(`${idx + 1}. ${s.nama} (NIS: ${s.nis})`);
        });
      });
    }

    lines.push(`\n_Dikirim oleh: ${activeAdmin?.nama || 'Petugas Piket'}_`);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = lines.join('\n');
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2500);
    }
  };

  return (
    <div className="space-y-6">
      {/* Super Admin Custom Date Controls */}
      {isSuperAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-800">
            <CalendarDays className="w-4 h-4 text-blue-700" />
            <span>Tanggal Pantauan: {formatIndonesianDate(activeDate)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={activeDate}
              onChange={(e) => setActiveDate(e.target.value || todayWib)}
              className="px-3 py-1.5 text-xs font-mono font-semibold border border-slate-300 rounded-lg bg-white"
            />
            {activeDate !== todayWib && (
              <button
                type="button"
                onClick={() => setActiveDate(todayWib)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100"
              >
                Hari Ini
              </button>
            )}
            <button
              type="button"
              onClick={() => setBulkModalOpen(true)}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white inline-flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              Input Presensi Massal
            </button>
          </div>
        </div>
      )}

      {/* Class Attendance Percentage Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UserX className="w-5 h-5 text-rose-600" />
              Daftar Murid Belum Presensi
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tanggal {formatIndonesianDate(activeDate)} · Tersisa{' '}
              <strong className="text-slate-900 font-mono tabular-nums">
                {absentStudents.length}
              </strong>{' '}
              murid belum tercatat.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">Semua Kelas</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  Kelas {c}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void handleCopyWhatsApp()}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {copiedNotice ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Tersalin ke Clipboard
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Salin Format WA
                </>
              )}
            </button>
          </div>
        </div>

        {/* Per-class Percentage Table */}
        {classStats.length > 0 && (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Kelas</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Total Siswa</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Hadir</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Belum Absen</th>
                  <th className="py-2.5 px-3 font-semibold text-right">% Kehadiran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classStats.map((row) => (
                  <tr key={row.kelas} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-slate-900">{row.kelas}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{row.total}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                      {row.hadir}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-rose-700 font-semibold">
                      {row.belum}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                      {row.pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Absent Students List */}
        {absentStudents.length === 0 ? (
          <div className="py-12 text-center border border-slate-200 rounded-xl bg-slate-50 text-sm font-medium text-emerald-700">
            Seluruh murid pada filter ini sudah memiliki catatan presensi.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {absentStudents.map((st) => (
              <div
                key={st.nis}
                className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <StudentAvatar foto={st.foto} nama={st.nama} className="w-10 h-14 shrink-0" />
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-slate-900 truncate">{st.nama}</h4>
                    <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                      {st.kelas} · NIS {st.nis}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleQuickStatus(st, 'Hadir')}
                    className="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                  >
                    Hadir
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleQuickStatus(st, 'Sakit')}
                    className="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors"
                  >
                    Sakit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleQuickStatus(st, 'Ijin')}
                    className="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                  >
                    Ijin
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleQuickStatus(st, 'Alpa')}
                    className="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors"
                  >
                    Alpa
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BulkDateAttendanceModal open={bulkModalOpen} onClose={() => setBulkModalOpen(false)} />
    </div>
  );
};
