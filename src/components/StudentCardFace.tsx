import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import type { SchoolSettings, Student } from '../types';
import { SchoolLogo, SchoolStampSvg, StudentAvatar } from './SchoolLogo';

export type CodeMode = 'QR' | 'BARCODE' | 'BOTH';

interface CardFrontProps {
  student: Student;
  settings: SchoolSettings;
  codeMode: CodeMode;
  autoCrop: boolean;
  scale?: number;
}

export const CardFrontFace: React.FC<CardFrontProps> = ({
  student,
  settings,
  codeMode,
  autoCrop,
}) => {
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if ((codeMode === 'QR' || codeMode === 'BOTH') && qrCanvasRef.current) {
      QRCode.toCanvas(
        qrCanvasRef.current,
        student.nis,
        {
          width: codeMode === 'BOTH' ? 42 : 52,
          margin: 0,
          color: { dark: '#0f172a', light: '#ffffff' },
        },
        () => {}
      );
    }

    if ((codeMode === 'BARCODE' || codeMode === 'BOTH') && barcodeSvgRef.current) {
      try {
        JsBarcode(barcodeSvgRef.current, student.nis, {
          format: 'CODE128',
          width: 1.2,
          height: codeMode === 'BOTH' ? 18 : 26,
          displayValue: true,
          fontSize: 8,
          margin: 1,
          background: 'transparent',
          lineColor: '#0f172a',
        });
      } catch {
        // Ignore invalid barcode characters
      }
    }
  }, [student.nis, codeMode]);

  const nameSizeClass =
    student.nama.length > 26
      ? 'text-[7.5px] leading-[1.15]'
      : student.nama.length > 18
      ? 'text-[8.5px] leading-[1.15]'
      : 'text-[9.5px] leading-[1.15]';

  return (
    <div className="cr80-card bg-white border border-blue-800 rounded-md overflow-hidden flex flex-col justify-between relative select-none shadow-sm">
      {/* Header Kop */}
      <div className="bg-gradient-to-r from-blue-950 via-blue-900 to-sky-700 text-white px-2 py-1.5 flex items-center gap-1.5">
        <div className="w-6 h-6 rounded-full bg-white p-0.5 flex items-center justify-center shrink-0">
          <SchoolLogo customLogo={settings.customLogo} className="w-full h-full" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[7px] font-bold tracking-wider text-amber-300 leading-none">
            KARTU PELAJAR
          </div>
          <div className="text-[8px] font-extrabold tracking-tight leading-tight text-white">
            {settings.schoolName}
          </div>
        </div>
      </div>

      {/* Body: Pas Foto 2x3 + Biodata */}
      <div className="px-2 py-1.5 flex items-center gap-2 flex-1 bg-gradient-to-b from-slate-50/70 to-white">
        <div className="shrink-0">
          <StudentAvatar
            foto={student.foto}
            nama={student.nama}
            autoCrop={autoCrop}
            className="photo-2x3-cm border border-slate-300 rounded-sm"
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-slate-900">
          <div>
            <div className="text-[6px] font-semibold uppercase tracking-wide text-slate-400">
              Nama Lengkap
            </div>
            <div className={`${nameSizeClass} font-extrabold text-blue-950 break-words`}>
              {student.nama}
            </div>
          </div>
          <div>
            <div className="text-[6px] font-semibold uppercase tracking-wide text-slate-400">
              NIS
            </div>
            <div className="text-[8.5px] font-mono font-bold text-slate-900 tabular-nums">
              {student.nis}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div>
              <div className="text-[6px] font-semibold uppercase text-slate-400">Kelas</div>
              <div className="text-[8px] font-bold text-blue-800">{student.kelas}</div>
            </div>
            <div>
              <div className="text-[6px] font-semibold uppercase text-slate-400">L/P</div>
              <div className="text-[8px] font-semibold text-slate-800">
                {student.jenisKelamin === 'P' ? 'Perempuan' : 'Laki-laki'}
              </div>
            </div>
          </div>
          <div>
            <div className="text-[6px] font-semibold uppercase text-slate-400">Tahun Ajaran</div>
            <div className="text-[7.5px] font-mono text-slate-700 tabular-nums">
              {student.tahun}
            </div>
          </div>
        </div>
      </div>

      {/* Footer: QR &/or CODE128 Barcode */}
      <div className="px-2 py-1.5 border-t border-slate-200 bg-white flex items-center justify-center gap-2 min-h-[46px]">
        {(codeMode === 'QR' || codeMode === 'BOTH') && (
          <canvas ref={qrCanvasRef} className="shrink-0" />
        )}
        {(codeMode === 'BARCODE' || codeMode === 'BOTH') && (
          <svg ref={barcodeSvgRef} className="max-w-full max-h-[38px]" />
        )}
      </div>
    </div>
  );
};

interface CardBackProps {
  settings: SchoolSettings;
}

export const CardBackFace: React.FC<CardBackProps> = ({ settings }) => {
  return (
    <div className="cr80-card bg-white border border-blue-800 rounded-md overflow-hidden flex flex-col justify-between relative select-none shadow-sm">
      <div className="bg-blue-950 text-white px-2.5 py-1.5 text-center">
        <div className="text-[7.5px] font-extrabold tracking-wide uppercase">
          {settings.cardBackTitle}
        </div>
        <div className="text-[6.5px] text-sky-200">{settings.schoolName}</div>
      </div>

      <div className="px-2.5 py-2 flex-1 flex flex-col justify-between text-[7px] text-slate-700 leading-snug">
        <ol className="list-decimal pl-3 space-y-1">
          {settings.cardBackRules.slice(0, 6).map((rule, idx) => (
            <li key={idx}>{rule}</li>
          ))}
        </ol>

        <div className="mt-1 pt-1.5 border-t border-slate-200 flex items-end justify-between gap-2 relative">
          <div className="text-[6px] text-slate-500 max-w-[92px] leading-tight">
            {settings.cardBackFooter}
          </div>
          <div className="text-right relative pr-1">
            <SchoolStampSvg className="w-9 h-9 opacity-60 absolute -top-3 right-3 pointer-events-none" />
            <div className="text-[6px] text-slate-500">Kepala Sekolah,</div>
            <div className="h-4" />
            <div className="text-[6.5px] font-bold text-slate-900 underline">
              {settings.principalName}
            </div>
            <div className="text-[5.5px] font-mono text-slate-500">
              NIP. {settings.principalNip}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-100 border-t border-slate-200 px-2 py-1 text-center text-[6px] text-slate-500 truncate">
        {settings.address}
      </div>
    </div>
  );
};
