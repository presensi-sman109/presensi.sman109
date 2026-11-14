import React, { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  FileDown,
  FlipHorizontal,
  Printer,
  Scissors,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { compressLogoImage } from '../lib/utils';
import type { Student } from '../types';
import { CardBackFace, CardFrontFace, type CodeMode } from './StudentCardFace';

type SheetSide = 'front' | 'back' | 'both';
type GridLayout = '9' | '6' | '8' | '10';

const LAYOUT_CONFIG: Record<
  GridLayout,
  {
    label: string;
    cardsPerSheet: number;
    cols: number;
    rows: number;
    orientation: 'portrait' | 'landscape';
    pageW: number;
    pageH: number;
    colGap: number;
    rowGap: number;
    gridColsClass: string;
  }
> = {
  '9': {
    label: '9 Kartu / A4 Portrait (3×3)',
    cardsPerSheet: 9,
    cols: 3,
    rows: 3,
    orientation: 'portrait',
    pageW: 210,
    pageH: 297,
    colGap: 8,
    rowGap: 6,
    gridColsClass: 'grid-cols-3',
  },
  '6': {
    label: '6 Kartu / A4 Portrait (2×3)',
    cardsPerSheet: 6,
    cols: 2,
    rows: 3,
    orientation: 'portrait',
    pageW: 210,
    pageH: 297,
    colGap: 14,
    rowGap: 6,
    gridColsClass: 'grid-cols-2',
  },
  '8': {
    label: '8 Kartu / A4 Landscape (4×2)',
    cardsPerSheet: 8,
    cols: 4,
    rows: 2,
    orientation: 'landscape',
    pageW: 297,
    pageH: 210,
    colGap: 10,
    rowGap: 10,
    gridColsClass: 'grid-cols-4',
  },
  '10': {
    label: '10 Kartu / A4 Landscape (5×2)',
    cardsPerSheet: 10,
    cols: 5,
    rows: 2,
    orientation: 'landscape',
    pageW: 297,
    pageH: 210,
    colGap: 3.5,
    rowGap: 10,
    gridColsClass: 'grid-cols-5',
  },
};

async function normalizeImageForPdf(
  dataUrl: string,
  format: 'PNG' | 'JPEG',
  targetAspect?: number
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(null);
          return;
        }
        let sx = 0;
        let sy = 0;
        let sw = w;
        let sh = h;

        if (targetAspect) {
          const srcAspect = w / h;
          if (srcAspect > targetAspect) {
            sw = h * targetAspect;
            sx = (w - sw) / 2;
          } else {
            sh = w / targetAspect;
            sy = (h - sh) / 2;
          }
        }

        const outW = targetAspect ? 240 : Math.min(256, sw);
        const outH = targetAspect ? Math.round(outW / targetAspect) : Math.max(1, Math.round((outW * sh) / sw));
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        if (format === 'JPEG') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, outW, outH);
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
        resolve(
          format === 'PNG'
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', 0.85)
        );
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export const CardTab: React.FC = () => {
  const { students, settings, saveSettings, addAdminLog } = useAppData();

  const [classFilter, setClassFilter] = useState('ALL');
  const [codeMode, setCodeMode] = useState<CodeMode>('BOTH');
  const [autoCrop, setAutoCrop] = useState(true);
  const [selectedNisSet, setSelectedNisSet] = useState<Set<string>>(() => {
    return new Set(students.map((s) => s.nis));
  });

  // Single Card Zoom Modal
  const [zoomStudent, setZoomStudent] = useState<Student | null>(null);
  const [zoomFlipped, setZoomFlipped] = useState(false);

  // Back Card Editor Modal
  const [backEditorOpen, setBackEditorOpen] = useState(false);
  const [draftBackTitle, setDraftBackTitle] = useState(settings.cardBackTitle);
  const [draftBackRulesText, setDraftBackRulesText] = useState(
    settings.cardBackRules.join('\n')
  );
  const [draftBackFooter, setDraftBackFooter] = useState(settings.cardBackFooter);

  // A4 Full Preview Modal & Sheet Settings
  const [a4ModalOpen, setA4ModalOpen] = useState(false);
  const [sheetSide, setSheetSide] = useState<SheetSide>('front');
  const [gridLayout, setGridLayout] = useState<GridLayout>('9');
  const [zoomPct, setZoomPct] = useState(90);
  const [showCutLines, setShowCutLines] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const classes = useMemo(
    () => Array.from(new Set(students.map((s) => s.kelas))).sort(),
    [students]
  );

  const visibleStudents = useMemo(
    () =>
      students
        .filter((s) => classFilter === 'ALL' || s.kelas === classFilter)
        .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama)),
    [students, classFilter]
  );

  const selectedStudents = useMemo(
    () => visibleStudents.filter((s) => selectedNisSet.has(s.nis)),
    [visibleStudents, selectedNisSet]
  );

  const toggleSelectAll = (checked: boolean) => {
    const next = new Set(selectedNisSet);
    visibleStudents.forEach((s) => {
      if (checked) next.add(s.nis);
      else next.delete(s.nis);
    });
    setSelectedNisSet(next);
  };

  const toggleOne = (nis: string) => {
    const next = new Set(selectedNisSet);
    if (next.has(nis)) next.delete(nis);
    else next.add(nis);
    setSelectedNisSet(next);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressLogoImage(file);
      await saveSettings({ ...settings, customLogo: dataUrl });
      await addAdminLog('UBAH_LOGO', 'Mengunggah logo sekolah kustom untuk kop & kartu pelajar');
    } catch {
      // Ignore invalid logo
    }
  };

  const openBackEditor = () => {
    setDraftBackTitle(settings.cardBackTitle);
    setDraftBackRulesText(settings.cardBackRules.join('\n'));
    setDraftBackFooter(settings.cardBackFooter);
    setBackEditorOpen(true);
  };

  const saveBackEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    const rules = draftBackRulesText
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean)
      .slice(0, 10);
    await saveSettings({
      ...settings,
      cardBackTitle: draftBackTitle.trim() || 'TATA TERTIB KARTU PELAJAR',
      cardBackRules: rules,
      cardBackFooter: draftBackFooter.trim(),
    });
    await addAdminLog('EDIT_BELAKANG_KARTU', 'Memperbarui tata tertib & teks belakang kartu pelajar');
    setBackEditorOpen(false);
  };

  const layoutCfg = LAYOUT_CONFIG[gridLayout];

  // Pagination for A4 Preview, PDF & Print
  const pages = useMemo(() => {
    const list: Array<{ type: 'front' | 'back'; items: Student[] }> = [];
    if (selectedStudents.length === 0) return list;

    for (let i = 0; i < selectedStudents.length; i += layoutCfg.cardsPerSheet) {
      const chunk = selectedStudents.slice(i, i + layoutCfg.cardsPerSheet);
      if (sheetSide === 'front' || sheetSide === 'both') {
        list.push({ type: 'front', items: chunk });
      }
      if (sheetSide === 'back' || sheetSide === 'both') {
        list.push({ type: 'back', items: chunk });
      }
    }
    return list;
  }, [selectedStudents, layoutCfg.cardsPerSheet, sheetSide]);

  const safePageIndex = Math.min(currentPage, Math.max(0, pages.length - 1));

  // Universal Cross-Browser Print
  const handleBrowserPrint = () => {
    void addAdminLog(
      'CETAK_KARTU',
      `Mencetak ${selectedStudents.length} kartu pelajar (${layoutCfg.label}, sisi: ${sheetSide})`
    );
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Direct PDF Generation with jsPDF (Exact CR80 54mm x 85.6mm on A4 — strictly inside page bounds)
  const handleDownloadPdf = async () => {
    if (selectedStudents.length === 0 || pages.length === 0) return;
    setPdfGenerating(true);

    try {
      const { orientation, pageW, pageH, cols, rows, colGap, rowGap } = layoutCfg;
      const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

      const cardW = 54;
      const cardH = 85.6;
      const totalGridW = cols * cardW + (cols - 1) * colGap;
      const totalGridH = rows * cardH + (rows - 1) * rowGap;
      const startX = (pageW - totalGridW) / 2;
      const startY = (pageH - totalGridH) / 2;

      // Pre-normalize school logo once
      const normalizedLogo = settings.customLogo
        ? await normalizeImageForPdf(settings.customLogo, 'PNG')
        : null;

      const drawCardFrontPdf = async (st: Student, x: number, y: number) => {
        // Card border & background
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(30, 58, 138);
        doc.setLineWidth(0.4);
        doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD');

        // Header Navy Band
        doc.setFillColor(30, 58, 138);
        doc.rect(x, y, cardW, 11.5, 'F');

        if (normalizedLogo) {
          try {
            doc.addImage(normalizedLogo, 'PNG', x + 2.2, y + 1.8, 7.5, 7.5);
          } catch {
            doc.setFillColor(255, 255, 255);
            doc.circle(x + 5.8, y + 5.8, 3.4, 'F');
          }
        } else {
          doc.setFillColor(255, 255, 255);
          doc.circle(x + 5.8, y + 5.8, 3.4, 'F');
          doc.setTextColor(30, 58, 138);
          doc.setFontSize(5.5);
          doc.setFont('helvetica', 'bold');
          doc.text('109', x + 5.8, y + 6.5, { align: 'center' });
        }

        doc.setTextColor(253, 224, 71);
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'bold');
        doc.text('KARTU PELAJAR', x + 11.5, y + 4.8);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6.5);
        doc.text(settings.schoolName, x + 11.5, y + 8.6, { maxWidth: 40 });

        // Photo 2x3 cm (20mm x 30mm)
        const photoX = x + 2.5;
        const photoY = y + 14.5;
        doc.setDrawColor(203, 213, 225);
        doc.setFillColor(241, 245, 249);
        doc.rect(photoX, photoY, 20, 30, 'FD');
        if (st.foto) {
          const normalizedPhoto = await normalizeImageForPdf(
            st.foto,
            'JPEG',
            autoCrop ? 2 / 3 : undefined
          );
          if (normalizedPhoto) {
            try {
              doc.addImage(normalizedPhoto, 'JPEG', photoX, photoY, 20, 30);
            } catch {
              // Ignore malformed photo
            }
          }
        }

        // Student Info
        const infoX = x + 24.5;
        const infoMaxW = 27.5;
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(5);
        doc.setFont('helvetica', 'normal');
        doc.text('NAMA LENGKAP', infoX, y + 17);

        doc.setTextColor(15, 23, 42);
        doc.setFontSize(7.1);
        doc.setFont('helvetica', 'bold');
        const nameLines = doc.splitTextToSize(st.nama, infoMaxW) as string[];
        doc.text(nameLines.slice(0, 3), infoX, y + 20.5);

        const afterNameY = y + 20.5 + Math.min(nameLines.length, 3) * 3.1 + 2;
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(5);
        doc.setFont('helvetica', 'normal');
        doc.text('NIS', infoX, afterNameY);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(7.1);
        doc.setFont('helvetica', 'bold');
        doc.text(st.nis, infoX, afterNameY + 3.2);

        doc.setTextColor(100, 116, 139);
        doc.setFontSize(5);
        doc.setFont('helvetica', 'normal');
        doc.text('KELAS / JK', infoX, afterNameY + 7.5);
        doc.setTextColor(30, 64, 175);
        doc.setFontSize(6.8);
        doc.setFont('helvetica', 'bold');
        doc.text(`${st.kelas} (${st.jenisKelamin})`, infoX, afterNameY + 10.7);

        doc.setTextColor(100, 116, 139);
        doc.setFontSize(5);
        doc.setFont('helvetica', 'normal');
        doc.text('TAHUN AJARAN', infoX, afterNameY + 15);
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(6.5);
        doc.text(st.tahun, infoX, afterNameY + 18);

        // QR Code & CODE128 Barcode at Bottom
        doc.setDrawColor(226, 232, 240);
        doc.line(x + 2, y + 63.5, x + cardW - 2, y + 63.5);

        if (codeMode === 'QR' || codeMode === 'BOTH') {
          const qrDataUrl = await QRCode.toDataURL(st.nis, { width: 120, margin: 0 });
          const qrSize = 16;
          const qrX = codeMode === 'BOTH' ? x + 3 : x + (cardW - qrSize) / 2;
          doc.addImage(qrDataUrl, 'PNG', qrX, y + 65.5, qrSize, qrSize);
        }

        if (codeMode === 'BARCODE' || codeMode === 'BOTH') {
          const canvas = document.createElement('canvas');
          JsBarcode(canvas, st.nis, {
            format: 'CODE128',
            width: 2,
            height: 40,
            displayValue: true,
            fontSize: 14,
            margin: 2,
          });
          const bcDataUrl = canvas.toDataURL('image/png');
          const bcW = codeMode === 'BOTH' ? 30 : 44;
          const bcX = codeMode === 'BOTH' ? x + 21 : x + (cardW - bcW) / 2;
          doc.addImage(bcDataUrl, 'PNG', bcX, y + 67, bcW, 13);
        }
      };

      const drawCardBackPdf = (x: number, y: number) => {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(30, 58, 138);
        doc.setLineWidth(0.4);
        doc.roundedRect(x, y, cardW, cardH, 2, 2, 'FD');

        doc.setFillColor(23, 37, 84);
        doc.rect(x, y, cardW, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(5.8);
        doc.setFont('helvetica', 'bold');
        doc.text(settings.cardBackTitle, x + cardW / 2, y + 4.3, {
          align: 'center',
          maxWidth: cardW - 4,
        });
        doc.setTextColor(186, 230, 253);
        doc.setFontSize(5.3);
        doc.text(settings.schoolName, x + cardW / 2, y + 7.9, { align: 'center' });

        doc.setTextColor(51, 65, 85);
        doc.setFontSize(5.6);
        doc.setFont('helvetica', 'normal');
        let ruleY = y + 13.8;
        for (let i = 0; i < Math.min(settings.cardBackRules.length, 6); i++) {
          const rule = settings.cardBackRules[i];
          const lines = doc.splitTextToSize(`${i + 1}. ${rule}`, cardW - 6) as string[];
          if (ruleY + lines.length * 2.6 > y + 58.5) break;
          doc.text(lines, x + 3, ruleY);
          ruleY += lines.length * 2.6 + 1.3;
        }

        // Principal Signature
        doc.setDrawColor(226, 232, 240);
        doc.line(x + 3, y + 60.5, x + cardW - 3, y + 60.5);
        doc.setFontSize(4.9);
        doc.setTextColor(100, 116, 139);
        const footLines = doc.splitTextToSize(settings.cardBackFooter, 22) as string[];
        doc.text(footLines.slice(0, 4), x + 3, y + 64);

        doc.text('Kepala Sekolah,', x + cardW - 3, y + 64, { align: 'right' });
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.3);
        doc.text(settings.principalName, x + cardW - 3, y + 74, {
          align: 'right',
          maxWidth: 26,
        });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(4.7);
        doc.text(`NIP. ${settings.principalNip}`, x + cardW - 3, y + 77.5, { align: 'right' });

        // Bottom Address strip
        doc.setFillColor(241, 245, 249);
        doc.rect(x + 0.3, y + 80.3, cardW - 0.6, 5, 'F');
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(4.5);
        doc.text(settings.address || '', x + cardW / 2, y + 83.4, {
          align: 'center',
          maxWidth: cardW - 4,
        });
      };

      const drawCutLines = (x: number, y: number) => {
        if (!showCutLines) return;
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.2);
        doc.setLineDashPattern([1.5, 1.5], 0);
        doc.rect(x - 1.5, y - 1.5, cardW + 3, cardH + 3);
        doc.setLineDashPattern([], 0);
      };

      for (let pIdx = 0; pIdx < pages.length; pIdx++) {
        if (pIdx > 0) {
          doc.addPage('a4', orientation);
        }
        const page = pages[pIdx];

        // Subtle sheet header safely inside top margin (y = 7mm, above startY >= 14mm)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `${settings.schoolName} · ${layoutCfg.label} · Sisi ${
            page.type === 'front' ? 'Depan' : 'Belakang'
          }`,
          startX,
          7.5
        );
        doc.text(`Halaman ${pIdx + 1} / ${pages.length}`, pageW - startX, 7.5, {
          align: 'right',
        });

        for (let idx = 0; idx < page.items.length; idx++) {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const x = startX + col * (cardW + colGap);
          const y = startY + row * (cardH + rowGap);
          drawCutLines(x, y);
          if (page.type === 'front') {
            await drawCardFrontPdf(page.items[idx], x, y);
          } else {
            drawCardBackPdf(x, y);
          }
        }
      }

      doc.save(`Kartu_Pelajar_SMAN109_${classFilter}.pdf`);
      await addAdminLog(
        'UNDUH_PDF_KARTU',
        `Mengunduh PDF Kartu Pelajar (${selectedStudents.length} murid, ${pages.length} halaman A4 ${orientation})`
      );
    } finally {
      setPdfGenerating(false);
    }
  };

  const allVisibleSelected =
    visibleStudents.length > 0 && visibleStudents.every((s) => selectedNisSet.has(s.nis));

  return (
    <div className="space-y-6">
      {/* Main Studio Panel (hidden when printing A4) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 no-print">
        {/* Top Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Studio Cetak Kartu Pelajar Standar CR80 (5,4 cm × 8,56 cm)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pas foto 2×3 cm otomatis, QR Code & Barcode CODE128, edit belakang kartu, pratinjau
              lembar A4, serta ekspor PDF instan tanpa terpotong.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openBackEditor}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Belakang Kartu
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentPage(0);
                setA4ModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Eye className="w-4 h-4" />
              Pratinjau Lembar A4 (Pratinjau)
            </button>
            <button
              type="button"
              disabled={pdfGenerating || selectedStudents.length === 0}
              onClick={() => void handleDownloadPdf()}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <FileDown className="w-4 h-4" />
              {pdfGenerating ? 'Membuat PDF...' : 'Simpan File PDF'}
            </button>
          </div>
        </div>

        {/* Studio Controls Row */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Logo Sekolah (Permanen)
            </label>
            <label className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-xl cursor-pointer hover:bg-slate-100 font-semibold text-slate-700">
              <Upload className="w-3.5 h-3.5 text-blue-700" />
              <span>Unggah Logo</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void handleLogoUpload(e)}
              />
            </label>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Filter Kelas</label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
            >
              <option value="ALL">Semua Kelas ({students.length})</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  Kelas {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Format Kode Kartu</label>
            <select
              value={codeMode}
              onChange={(e) => setCodeMode(e.target.value as CodeMode)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
            >
              <option value="BOTH">QR Code + Barcode</option>
              <option value="QR">QR Code Saja</option>
              <option value="BARCODE">Barcode CODE128 Saja</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tata Letak Lembar A4</label>
            <select
              value={gridLayout}
              onChange={(e) => {
                setGridLayout(e.target.value as GridLayout);
                setCurrentPage(0);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
            >
              <option value="9">9 Kartu / A4 Portrait (3×3)</option>
              <option value="6">6 Kartu / A4 Portrait (2×3)</option>
              <option value="8">8 Kartu / A4 Landscape (4×2)</option>
              <option value="10">10 Kartu / A4 Landscape (5×2)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Sisi Kartu (PDF/Cetak)</label>
            <select
              value={sheetSide}
              onChange={(e) => {
                setSheetSide(e.target.value as SheetSide);
                setCurrentPage(0);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
            >
              <option value="front">Depan Saja</option>
              <option value="back">Belakang Saja</option>
              <option value="both">Depan & Belakang</option>
            </select>
          </div>

          <div className="flex items-center justify-between bg-white border border-slate-300 rounded-xl px-3 py-2">
            <span className="font-semibold text-slate-700">Auto-Crop 2:3</span>
            <button
              type="button"
              onClick={() => setAutoCrop((v) => !v)}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                autoCrop ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {autoCrop ? 'Aktif' : 'Utuh'}
            </button>
          </div>
        </div>

        {/* Selection Bar */}
        <div className="flex items-center justify-between text-xs border-b border-slate-200 pb-3">
          <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(e) => toggleSelectAll(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-700"
            />
            Pilih Semua Kartu pada Filter Ini ({selectedStudents.length} terpilih)
          </label>

          <button
            type="button"
            onClick={handleBrowserPrint}
            disabled={selectedStudents.length === 0}
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-800 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Cetak Cepat ({selectedStudents.length})
          </button>
        </div>

        {/* Preview Grid */}
        {visibleStudents.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            Tidak ada data murid pada kelas ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 justify-items-center bg-slate-100/70 p-6 rounded-xl border border-slate-200">
            {visibleStudents.map((st) => {
              const checked = selectedNisSet.has(st.nis);
              return (
                <div key={st.nis} className="flex flex-col items-center gap-2.5">
                  <div className="w-full flex items-center justify-between text-xs px-1">
                    <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(st.nis)}
                        className="w-3.5 h-3.5 accent-blue-700"
                      />
                      Pilih
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setZoomStudent(st);
                        setZoomFlipped(false);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold"
                    >
                      <ZoomIn className="w-3 h-3 text-blue-700" />
                      Zoom
                    </button>
                  </div>

                  <CardFrontFace
                    student={st}
                    settings={settings}
                    codeMode={codeMode}
                    autoCrop={autoCrop}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SINGLE CARD ZOOM MODAL (FRONT & BACK FLIP) */}
      {zoomStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">{zoomStudent.nama}</h3>
                <p className="text-xs text-slate-500 font-mono">
                  NIS {zoomStudent.nis} · {zoomStudent.kelas}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setZoomStudent(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-center py-4 bg-slate-100 rounded-xl border border-slate-200">
              <div className="transform scale-125 origin-center my-6">
                {!zoomFlipped ? (
                  <CardFrontFace
                    student={zoomStudent}
                    settings={settings}
                    codeMode={codeMode}
                    autoCrop={autoCrop}
                  />
                ) : (
                  <CardBackFace settings={settings} />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setZoomFlipped((v) => !v)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2"
              >
                <FlipHorizontal className="w-4 h-4" />
                {zoomFlipped ? 'Lihat Sisi Depan' : 'Putar ke Sisi Belakang'}
              </button>
              <button
                type="button"
                onClick={() => setZoomStudent(null)}
                className="py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BACK CARD EDITOR MODAL */}
      {backEditorOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">
                Edit Bagian Belakang Kartu Pelajar
              </h3>
              <button
                type="button"
                onClick={() => setBackEditorOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void saveBackEditor(e)} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Judul Bagian Belakang
                </label>
                <input
                  type="text"
                  required
                  value={draftBackTitle}
                  onChange={(e) => setDraftBackTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Daftar Tata Tertib (1 baris per poin, maks. 6 poin tampil di kartu)
                </label>
                <textarea
                  rows={6}
                  value={draftBackRulesText}
                  onChange={(e) => setDraftBackRulesText(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl leading-relaxed"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Catatan Bawah / Pengembalian Kartu
                </label>
                <input
                  type="text"
                  value={draftBackFooter}
                  onChange={(e) => setDraftBackFooter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBackEditorOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold"
                >
                  Simpan Perubahan Belakang Kartu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL A4 SHEET PREVIEW MODAL */}
      {a4ModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 flex flex-col p-3 sm:p-6 no-print">
          <div className="bg-white border border-slate-200 rounded-2xl flex-1 flex flex-col overflow-hidden shadow-2xl max-w-6xl w-full mx-auto">
            {/* Modal Toolbar */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
              <div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900">
                  Pratinjau Lembar Cetak A4 (Standar CR80 5,4 × 8,56 cm)
                </h3>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {selectedStudents.length} kartu terpilih · {pages.length} halaman A4
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={sheetSide}
                  onChange={(e) => {
                    setSheetSide(e.target.value as SheetSide);
                    setCurrentPage(0);
                  }}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-semibold"
                >
                  <option value="front">Depan Saja</option>
                  <option value="back">Belakang Saja (Tata Tertib & TTD)</option>
                  <option value="both">Depan & Belakang</option>
                </select>

                <select
                  value={gridLayout}
                  onChange={(e) => {
                    setGridLayout(e.target.value as GridLayout);
                    setCurrentPage(0);
                  }}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-semibold"
                >
                  <option value="9">9 Kartu / A4 Portrait (3×3)</option>
                  <option value="6">6 Kartu / A4 Portrait (2×3)</option>
                  <option value="8">8 Kartu / A4 Landscape (4×2)</option>
                  <option value="10">10 Kartu / A4 Landscape (5×2)</option>
                </select>

                <button
                  type="button"
                  onClick={() => setShowCutLines((v) => !v)}
                  className={`px-2.5 py-1.5 border rounded-lg font-semibold inline-flex items-center gap-1 ${
                    showCutLines
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  <Scissors className="w-3.5 h-3.5" />
                  Garis Potong
                </button>

                <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1">
                  <span className="text-slate-500">Zoom:</span>
                  <input
                    type="range"
                    min={50}
                    max={140}
                    step={5}
                    value={zoomPct}
                    onChange={(e) => setZoomPct(Number(e.target.value))}
                    className="w-20 accent-blue-700"
                  />
                  <span className="font-mono font-semibold tabular-nums w-9 text-right">
                    {zoomPct}%
                  </span>
                </div>

                <button
                  type="button"
                  disabled={pdfGenerating || pages.length === 0}
                  onClick={() => void handleDownloadPdf()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold inline-flex items-center gap-1.5"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  {pdfGenerating ? 'Membuat PDF...' : 'Simpan PDF'}
                </button>

                <button
                  type="button"
                  disabled={pages.length === 0}
                  onClick={handleBrowserPrint}
                  className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Cetak Dokumen Ini
                </button>

                <button
                  type="button"
                  onClick={() => setA4ModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Simulated A4 Canvas */}
            <div className="flex-1 overflow-auto bg-slate-200 p-6 flex justify-center items-start">
              {pages.length === 0 ? (
                <div className="bg-white rounded-xl p-10 text-center text-sm text-slate-500 my-auto">
                  Belum ada kartu yang dipilih untuk dipratinjau.
                </div>
              ) : (
                <div
                  style={{
                    transform: `scale(${zoomPct / 100})`,
                    transformOrigin: 'top center',
                  }}
                  className={`bg-white shadow-xl border border-slate-300 flex flex-col items-center justify-start ${
                    layoutCfg.orientation === 'landscape'
                      ? 'w-[297mm] min-h-[210mm] px-[6mm] py-[8mm]'
                      : 'w-[210mm] min-h-[297mm] px-[10mm] py-[10mm]'
                  }`}
                >
                  <div className="w-full text-[10px] text-slate-400 font-mono flex justify-between pb-1.5 mb-2.5 border-b border-slate-200">
                    <span>
                      {settings.schoolName} — {layoutCfg.label}
                    </span>
                    <span>
                      Halaman {safePageIndex + 1} / {pages.length} · Sisi{' '}
                      {pages[safePageIndex].type === 'front' ? 'Depan' : 'Belakang'}
                    </span>
                  </div>

                  <div
                    className={`grid ${layoutCfg.gridColsClass} ${
                      gridLayout === '10'
                        ? 'gap-x-1 gap-y-3'
                        : gridLayout === '8'
                        ? 'gap-x-6 gap-y-4'
                        : 'gap-x-5 gap-y-3'
                    }`}
                  >
                    {pages[safePageIndex].items.map((st) => (
                      <div
                        key={`${pages[safePageIndex].type}-${st.nis}`}
                        className={
                          showCutLines
                            ? 'p-1 border border-dashed border-slate-400'
                            : 'p-1 border border-transparent'
                        }
                      >
                        {pages[safePageIndex].type === 'front' ? (
                          <CardFrontFace
                            student={st}
                            settings={settings}
                            codeMode={codeMode}
                            autoCrop={autoCrop}
                          />
                        ) : (
                          <CardBackFace settings={settings} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Pagination Footer */}
            {pages.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs">
                <button
                  type="button"
                  disabled={safePageIndex === 0}
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Sebelumnya
                </button>
                <span className="font-mono font-semibold text-slate-700 tabular-nums">
                  Halaman {safePageIndex + 1} dari {pages.length} (
                  {pages[safePageIndex].type === 'front' ? 'Sisi Depan' : 'Sisi Belakang'})
                </span>
                <button
                  type="button"
                  disabled={safePageIndex >= pages.length - 1}
                  onClick={() => setCurrentPage((p) => Math.min(pages.length - 1, p + 1))}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold inline-flex items-center gap-1 disabled:opacity-40"
                >
                  Berikutnya
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HIDDEN UNIVERSAL CROSS-BROWSER PRINT AREA (A4 SHEET) */}
      <div className="hidden print-only">
        <style media="print">{`@page { size: A4 ${layoutCfg.orientation}; margin: 0; }`}</style>
        {pages.map((page, pIdx) => (
          <div
            key={`print-page-${pIdx}`}
            className={`mx-auto flex flex-col items-center justify-center overflow-hidden ${
              layoutCfg.orientation === 'landscape'
                ? 'w-[296mm] h-[209mm] px-[5mm] py-[6mm]'
                : 'w-[209mm] h-[296mm] px-[8mm] py-[8mm]'
            } ${pIdx < pages.length - 1 ? 'print-page-break' : ''}`}
          >
            <div
              className={`grid ${layoutCfg.gridColsClass} ${
                gridLayout === '10'
                  ? 'gap-x-1 gap-y-3'
                  : gridLayout === '8'
                  ? 'gap-x-6 gap-y-4'
                  : 'gap-x-5 gap-y-3'
              }`}
            >
              {page.items.map((st) => (
                <div
                  key={`print-${page.type}-${st.nis}`}
                  className={
                    showCutLines
                      ? 'p-1 border border-dashed border-slate-400 print-avoid-break'
                      : 'p-1 print-avoid-break'
                  }
                >
                  {page.type === 'front' ? (
                    <CardFrontFace
                      student={st}
                      settings={settings}
                      codeMode={codeMode}
                      autoCrop={autoCrop}
                    />
                  ) : (
                    <CardBackFace settings={settings} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
