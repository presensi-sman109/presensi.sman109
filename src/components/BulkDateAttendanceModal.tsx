import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCheck, X } from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { formatIndonesianDate, getTimeWib } from '../lib/utils';
import type { AttendanceRecord, AttendanceStatus } from '../types';

interface BulkDateAttendanceModalProps {
  open: boolean;
  onClose: () => void;
}

export const BulkDateAttendanceModal: React.FC<BulkDateAttendanceModalProps> = ({
  open,
  onClose,
}) => {
  const {
    students,
    attendances,
    activeDate,
    activeAdmin,
    bulkRecordAttendance,
    addAdminLog,
  } = useAppData();

  const classes = useMemo(
    () => Array.from(new Set(students.map((s) => s.kelas))).sort(),
    [students]
  );

  const [selectedClass, setSelectedClass] = useState<string>(classes[0] || '');
  const [draftStatuses, setDraftStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && !selectedClass && classes.length > 0) {
      setSelectedClass(classes[0]);
    }
  }, [open, selectedClass, classes]);

  const classStudents = useMemo(
    () =>
      students
        .filter((s) => !selectedClass || s.kelas === selectedClass)
        .sort((a, b) => a.nama.localeCompare(b.nama)),
    [students, selectedClass]
  );

  useEffect(() => {
    if (!open) return;
    const map: Record<string, AttendanceStatus> = {};
    classStudents.forEach((st) => {
      const existing = attendances.find((a) => a.nis === st.nis && a.date === activeDate);
      map[st.nis] = existing ? existing.status : 'Hadir';
    });
    setDraftStatuses(map);
  }, [open, selectedClass, activeDate, classStudents, attendances]);

  if (!open) return null;

  const setAllStatus = (status: AttendanceStatus) => {
    const next: Record<string, AttendanceStatus> = {};
    classStudents.forEach((st) => {
      next[st.nis] = status;
    });
    setDraftStatuses(next);
  };

  const handleSave = async () => {
    setSaving(true);
    const nowTime = getTimeWib();
    const nowIso = new Date().toISOString();
    const records: AttendanceRecord[] = classStudents.map((st) => ({
      id: `${st.nis}_${activeDate}`,
      nis: st.nis,
      nama: st.nama,
      kelas: st.kelas,
      date: activeDate,
      time: nowTime,
      status: draftStatuses[st.nis] || 'Hadir',
      notes: 'Input massal tanggal khusus (Super Admin)',
      recordedBy: activeAdmin?.nama || 'Super Admin',
      updatedAt: nowIso,
    }));

    await bulkRecordAttendance(records);
    await addAdminLog(
      'PRESENSI_TANGGAL_KHUSUS',
      `Input massal ${records.length} siswa kelas ${selectedClass || 'Semua'} untuk tanggal ${activeDate}`
    );
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-700" />
              Input Presensi Massal Tanggal Khusus
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tanggal aktif: <strong className="text-slate-800">{formatIndonesianDate(activeDate)}</strong> ({activeDate})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-700">Kelas:</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 mr-1">Set Semua:</span>
            {(['Hadir', 'Sakit', 'Ijin', 'Alpa'] as AttendanceStatus[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setAllStatus(st)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 px-6">
          {classStudents.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              Tidak ada siswa pada kelas yang dipilih.
            </div>
          ) : (
            classStudents.map((st, idx) => {
              const current = draftStatuses[st.nis] || 'Hadir';
              return (
                <div
                  key={st.nis}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-slate-400 mr-2 tabular-nums">
                      {idx + 1}.
                    </span>
                    <span className="font-semibold text-slate-900">{st.nama}</span>
                    <span className="ml-2 font-mono text-xs text-slate-500">{st.nis}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(['Hadir', 'Sakit', 'Ijin', 'Alpa'] as AttendanceStatus[]).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() =>
                          setDraftStatuses((prev) => ({ ...prev, [st.nis]: opt }))
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                          current === opt
                            ? opt === 'Hadir'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : opt === 'Sakit'
                              ? 'bg-sky-600 text-white border-sky-600'
                              : opt === 'Ijin'
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={saving || classStudents.length === 0}
            onClick={handleSave}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <CheckCheck className="w-4 h-4" />
            {saving ? 'Menyimpan...' : `Simpan ${classStudents.length} Siswa`}
          </button>
        </div>
      </div>
    </div>
  );
};
