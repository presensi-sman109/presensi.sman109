import React from 'react';

interface SchoolLogoProps {
  customLogo?: string | null;
  className?: string;
  alt?: string;
}

export const SchoolLogo: React.FC<SchoolLogoProps> = ({
  customLogo,
  className = 'w-10 h-10',
  alt = 'Logo SMA Negeri 109 Jakarta',
}) => {
  const [imgFailed, setImgFailed] = React.useState(false);

  React.useEffect(() => {
    setImgFailed(false);
  }, [customLogo]);

  if (customLogo && !imgFailed) {
    return (
      <img
        src={customLogo}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${className} object-contain`}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={alt}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="sman109ShieldGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>
      <path
        d="M50 5 L88 18 V50 C88 73 70 88 50 95 C30 88 12 73 12 50 V18 Z"
        fill="url(#sman109ShieldGrad)"
        stroke="#f59e0b"
        strokeWidth="3.5"
      />
      <path
        d="M50 13 L80 23 V49 C80 68 65 80 50 86 C35 80 20 68 20 49 V23 Z"
        fill="none"
        stroke="#e0f2fe"
        strokeWidth="1.5"
        strokeOpacity="0.6"
      />
      {/* Open Book */}
      <path
        d="M28 52 C36 48 44 49 50 53 C56 49 64 48 72 52 V67 C64 63 56 64 50 68 C44 64 36 63 28 67 Z"
        fill="#ffffff"
      />
      {/* Flame / Torch */}
      <path
        d="M50 22 C54 29 57 34 53 40 C52 42 50 44 50 44 C50 44 47 41 46 38 C44 33 47 27 50 22 Z"
        fill="#fbbf24"
      />
      <rect x="48" y="42" width="4" height="9" rx="1" fill="#fde68a" />
      <text
        x="50"
        y="80"
        textAnchor="middle"
        fill="#ffffff"
        fontSize="11"
        fontWeight="800"
        fontFamily="Plus Jakarta Sans, sans-serif"
        letterSpacing="0.5"
      >
        109
      </text>
    </svg>
  );
};

interface StudentAvatarProps {
  foto?: string | null;
  nama: string;
  className?: string;
  autoCrop?: boolean;
}

export const StudentAvatar: React.FC<StudentAvatarProps> = ({
  foto,
  nama,
  className = 'w-10 h-14',
  autoCrop = true,
}) => {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [foto]);

  if (foto && !failed) {
    return (
      <img
        src={foto}
        alt={`Pas foto ${nama}`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${className} ${autoCrop ? 'object-cover' : 'object-contain bg-slate-100'} rounded border border-slate-200`}
      />
    );
  }

  return (
    <div
      className={`${className} rounded border border-slate-200 bg-slate-100 flex flex-col items-center justify-center text-slate-400 overflow-hidden shrink-0`}
      title={`Pas foto 2x3 — ${nama}`}
    >
      <svg viewBox="0 0 64 96" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="96" fill="#e2e8f0" />
        <circle cx="32" cy="34" r="13" fill="#94a3b8" />
        <path d="M10 86 C10 64 20 54 32 54 C44 54 54 64 54 86 Z" fill="#94a3b8" />
      </svg>
    </div>
  );
};

export const SchoolStampSvg: React.FC<{ className?: string }> = ({
  className = 'w-16 h-16',
}) => (
  <svg
    viewBox="0 0 120 120"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Stempel Resmi SMA Negeri 109 Jakarta"
  >
    <circle cx="60" cy="60" r="54" fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeOpacity="0.65" />
    <circle cx="60" cy="60" r="48" fill="none" stroke="#1d4ed8" strokeWidth="1" strokeOpacity="0.55" />
    <circle cx="60" cy="60" r="34" fill="none" stroke="#1d4ed8" strokeWidth="1.2" strokeOpacity="0.6" />
    <text
      x="60"
      y="24"
      textAnchor="middle"
      fill="#1d4ed8"
      fillOpacity="0.72"
      fontSize="7.5"
      fontWeight="700"
      letterSpacing="0.8"
    >
      PEMERINTAH PROV. DKI
    </text>
    <text
      x="60"
      y="56"
      textAnchor="middle"
      fill="#1d4ed8"
      fillOpacity="0.78"
      fontSize="9.5"
      fontWeight="800"
    >
      SMAN 109
    </text>
    <text
      x="60"
      y="68"
      textAnchor="middle"
      fill="#1d4ed8"
      fillOpacity="0.72"
      fontSize="7"
      fontWeight="700"
    >
      JAKARTA
    </text>
    <text
      x="60"
      y="102"
      textAnchor="middle"
      fill="#1d4ed8"
      fillOpacity="0.72"
      fontSize="7"
      fontWeight="700"
      letterSpacing="0.6"
    >
      DINAS PENDIDIKAN
    </text>
  </svg>
);
