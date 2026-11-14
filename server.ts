import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const VALID_VOICES = ['Kore', 'Puck', 'Zephyr', 'Fenrir', 'Charon'] as const;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      hasGeminiKey: Boolean(getGeminiClient()),
      port: PORT,
    });
  });

  // Gemini TTS endpoint (gemini-3.8-flash-lite-tts)
  app.post('/api/ai/tts', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({ error: 'GEMINI_API_KEY belum dikonfigurasi pada server.' });
        return;
      }

      const body = req.body as {
        text?: string;
        voiceName?: string;
        style?: string;
      };

      const text = (body.text || '').trim();
      if (!text) {
        res.status(400).json({ error: 'Teks pengumuman tidak boleh kosong.' });
        return;
      }

      const voiceName = VALID_VOICES.includes(body.voiceName as (typeof VALID_VOICES)[number])
        ? body.voiceName
        : 'Kore';

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text,
                speechMetadata: {
                  style: body.style || 'Ramah, jelas, artikulasi Bahasa Indonesia yang baik untuk pengumuman presensi sekolah.',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'Model TTS tidak mengembalikan data audio.' });
        return;
      }

      res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menghasilkan audio TTS.';
      console.error('TTS Error:', message);
      res.status(500).json({ error: message });
    }
  });

  // Gemini Attendance Analysis endpoint (gemini-4-hydrogen)
  app.post('/api/ai/analyze', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({ error: 'GEMINI_API_KEY belum dikonfigurasi pada server.' });
        return;
      }

      const { periodLabel, summaryStats, classBreakdown, attentionStudents } = req.body as {
        periodLabel?: string;
        summaryStats?: Record<string, unknown>;
        classBreakdown?: unknown[];
        attentionStudents?: unknown[];
      };

      const prompt = `Analisis data presensi SMA Negeri 109 Jakarta untuk periode: ${periodLabel || 'Terkini'}.

Ringkasan Statistik:
${JSON.stringify(summaryStats || {}, null, 2)}

Rekap Per Kelas:
${JSON.stringify(classBreakdown || [], null, 2)}

Siswa Dengan Catatan Ketidakhadiran (Sakit/Ijin/Alpa/Belum Absen):
${JSON.stringify(attentionStudents || [], null, 2)}

Buatlah Ringkasan Eksekutif dalam Bahasa Indonesia yang terstruktur dengan jelas:
1. Ringkasan Eksekutif & Tren Kehadiran
2. Sorotan Per Kelas (kelas dengan tingkat kehadiran tertinggi & kelas yang perlu perhatian)
3. Rekomendasi Tindak Lanjut Konkret untuk Wali Kelas & Guru BK
4. Langkah Pencegahan & Apresiasi Kedisiplinan

Gunakan bahasa profesional, objektif, dan ringkas berbasis angka aktual yang diberikan.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'Anda adalah Analis Kedisiplinan & Konseling Akademik untuk SMA Negeri 109 Jakarta. Jawab selalu dalam Bahasa Indonesia yang rapi, akurat sesuai data yang diberikan, dan tidak mengarang angka.',
        },
      });

      res.json({ analysis: response.text || 'Tidak ada hasil analisis.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menjalankan analisis AI.';
      console.error('AI Analyze Error:', message);
      res.status(500).json({ error: message });
    }
  });

  // Gemini AI Attendance Chatbot Assistant endpoint
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({ error: 'GEMINI_API_KEY belum dikonfigurasi pada server.' });
        return;
      }

      const { message, history, attendanceContext } = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'model'; text: string }>;
        attendanceContext?: unknown;
      };

      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
        return;
      }

      const systemInstruction = `Anda adalah Asisten AI Presensi SMA Negeri 109 Jakarta yang membantu Guru BK, Wali Kelas, dan Operator Piket.
Gunakan data presensi aktual berikut untuk menjawab pertanyaan pengguna secara akurat dalam Bahasa Indonesia:
${JSON.stringify(attendanceContext || {}, null, 2)}

Jika ditanya tentang siswa tertentu, kelas tertentu, atau rekomendasi pembinaan, rujuk langsung pada data di atas. Jika data tidak tersedia dalam konteks, sampaikan secara jujur.`;

      const chat = ai.chats.create({
        model: 'gemini-4-hydrogen',
        config: { systemInstruction },
        history: (history || []).map((item) => ({
          role: item.role,
          parts: [{ text: item.text }],
        })),
      });

      const response = await chat.sendMessage({ message });
      res.json({ reply: response.text || 'Maaf, tidak ada respons dari asisten.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menghubungi Asisten AI.';
      console.error('AI Chat Error:', message);
      res.status(500).json({ error: message });
    }
  });

  // Vite middleware in dev / static files in production (Cloud Run / Published App)
  const distDir = path.resolve(__dirname, 'dist');
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(
      express.static(distDir, {
        maxAge: '1d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    app.get('*', (_req, res) => {
      res.status(503).send('Build folder dist/ tidak ditemukan. Jalankan npm run build terlebih dahulu.');
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server SMA Negeri 109 Jakarta running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
