import React, { useMemo, useState } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { formatIndonesianDate, getTodayWib } from '../lib/utils';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export const AiAnalysisTab: React.FC = () => {
  const { students, attendances, activeDate } = useAppData();

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'Halo! Saya Asisten AI Presensi SMA Negeri 109 Jakarta. Silakan tanyakan tren kehadiran, daftar murid yang perlu perhatian Guru BK, atau ringkasan kelas hari ini.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const todayWib = getTodayWib();
  const targetDate = activeDate || todayWib;

  const attendanceSnapshot = useMemo(() => {
    const dateLogs = attendances.filter((a) => a.date === targetDate);
    const recordedSet = new Set(dateLogs.map((a) => a.nis));
    const classes = Array.from(new Set(students.map((s) => s.kelas))).sort();

    const classBreakdown = classes.map((kelas) => {
      const total = students.filter((s) => s.kelas === kelas).length;
      const logs = dateLogs.filter((a) => a.kelas === kelas);
      const hadir = logs.filter((a) => a.status === 'Hadir').length;
      const sakit = logs.filter((a) => a.status === 'Sakit').length;
      const ijin = logs.filter((a) => a.status === 'Ijin').length;
      const alpa = logs.filter((a) => a.status === 'Alpa').length;
      const belum = total - logs.length;
      return {
        kelas,
        totalSiswa: total,
        hadir,
        sakit,
        ijin,
        alpa,
        belumAbsen: belum,
        persenHadir: total > 0 ? Math.round((hadir / total) * 100) : 0,
      };
    });

    const attentionStudents = [
      ...dateLogs
        .filter((a) => a.status !== 'Hadir')
        .map((a) => ({ nis: a.nis, nama: a.nama, kelas: a.kelas, status: a.status })),
      ...students
        .filter((s) => !recordedSet.has(s.nis))
        .slice(0, 20)
        .map((s) => ({ nis: s.nis, nama: s.nama, kelas: s.kelas, status: 'Belum Absen' })),
    ];

    const totalHadir = dateLogs.filter((a) => a.status === 'Hadir').length;
    const summaryStats = {
      tanggal: targetDate,
      totalMurid: students.length,
      totalHadir,
      totalSakit: dateLogs.filter((a) => a.status === 'Sakit').length,
      totalIjin: dateLogs.filter((a) => a.status === 'Ijin').length,
      totalAlpa: dateLogs.filter((a) => a.status === 'Alpa').length,
      belumAbsen: Math.max(0, students.length - dateLogs.length),
      persenHadir: students.length > 0 ? Math.round((totalHadir / students.length) * 100) : 0,
      totalRiwayatDatabase: attendances.length,
    };

    return { summaryStats, classBreakdown, attentionStudents };
  }, [students, attendances, targetDate]);

  const runExecutiveAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodLabel: formatIndonesianDate(targetDate),
          ...attendanceSnapshot,
        }),
      });
      const data = (await res.json()) as { analysis?: string; error?: string };
      if (!res.ok) {
        setAnalysisError(data.error || 'Gagal menjalankan analisis AI.');
      } else {
        setAnalysisText(data.analysis || '');
      }
    } catch {
      setAnalysisError('Tidak dapat terhubung ke server AI.');
    } finally {
      setAnalyzing(false);
    }
  };

  const sendChatMessage = async (textOverride?: string) => {
    const text = (textOverride ?? chatInput).trim();
    if (!text || chatLoading) return;

    const userMsg: ChatMessage = { role: 'user', text };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!textOverride) setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-8),
          attendanceContext: attendanceSnapshot,
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: res.ok
            ? data.reply || 'Tidak ada respons.'
            : data.error || 'Layanan AI sedang tidak tersedia.',
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: 'Gagal terhubung ke server asisten AI.' },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const quickPrompts = [
    'Kelas mana yang tingkat kehadirannya paling rendah hari ini?',
    'Siapa saja siswa yang belum hadir dan perlu ditindaklanjuti Wali Kelas?',
    'Buat draf pesan imbauan ramah untuk grup orang tua tentang kedisiplinan masuk pagi.',
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Left Column: Executive AI Summary */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-700" />
              Ringkasan Eksekutif Analisis Presensi
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Evaluasi tren kehadiran, sorotan kelas, dan rekomendasi tindak lanjut Guru BK & Wali
              Kelas ({formatIndonesianDate(targetDate)}).
            </p>
          </div>
          <button
            type="button"
            disabled={analyzing}
            onClick={() => void runExecutiveAnalysis()}
            className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4" />
            {analyzing ? 'Menganalisis Data...' : 'Buat Analisis AI'}
          </button>
        </div>

        {/* Snapshot KPIs */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-slate-500">Hadir Tercatat</div>
            <div className="text-lg font-bold font-mono tabular-nums text-emerald-700">
              {attendanceSnapshot.summaryStats.totalHadir} /{' '}
              {attendanceSnapshot.summaryStats.totalMurid}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-slate-500">Sakit / Ijin / Alpa</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
              {attendanceSnapshot.summaryStats.totalSakit} /{' '}
              {attendanceSnapshot.summaryStats.totalIjin} /{' '}
              {attendanceSnapshot.summaryStats.totalAlpa}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-slate-500">Belum Presensi</div>
            <div className="text-lg font-bold font-mono tabular-nums text-rose-700">
              {attendanceSnapshot.summaryStats.belumAbsen} Siswa
            </div>
          </div>
        </div>

        {analysisError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {analysisError}
          </div>
        )}

        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-y-auto max-h-[420px]">
          {analysisText ? (
            <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
              {analysisText}
            </div>
          ) : (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center text-slate-400 text-xs gap-2">
              <Sparkles className="w-8 h-8 text-slate-300" />
              <p className="max-w-sm">
                Klik tombol <strong>Buat Analisis AI</strong> untuk menghasilkan ringkasan
                eksekutif kehadiran dan rekomendasi pembinaan siswa.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: AI Chatbot Assistant */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col">
        <div className="pb-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-700" />
            Asisten Konsultasi Presensi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tanya jawab interaktif berbasis data kehadiran SMA Negeri 109 Jakarta.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[340px] py-4 space-y-3 pr-1">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-blue-700 text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 border border-slate-200 rounded-bl-sm'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="px-3.5 py-2 rounded-2xl bg-slate-100 border border-slate-200 text-xs text-slate-500">
                Sedang menyusun jawaban...
              </div>
            </div>
          )}
        </div>

        {/* Suggested Prompts */}
        <div className="pt-2 pb-3 flex flex-wrap gap-1.5">
          {quickPrompts.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void sendChatMessage(q)}
              className="text-left text-[11px] px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendChatMessage();
          }}
          className="pt-3 border-t border-slate-200 flex gap-2"
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Tulis pertanyaan tentang absensi siswa..."
            className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={chatLoading || !chatInput.trim()}
            className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            Kirim
          </button>
        </form>
      </div>
    </div>
  );
};
