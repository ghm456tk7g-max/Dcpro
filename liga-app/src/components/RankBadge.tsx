import { useId } from 'react';
import { RankDef } from '../lib/ranks';

/** Ein Dart, senkrecht mit der Spitze nach unten, Mittelpunkt bei (0,0) */
function Dart({ x, y, rot, s = 1 }: { x: number; y: number; rot: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M0 30 L-1 20 L1 20 Z" fill="#e5e7eb" />
      <rect x="-2.6" y="6" width="5.2" height="14" rx="1.6" fill="#f3f4f6" />
      <rect x="-2.6" y="9" width="5.2" height="1.4" fill="#6b7280" />
      <rect x="-2.6" y="12.5" width="5.2" height="1.4" fill="#6b7280" />
      <rect x="-2.6" y="16" width="5.2" height="1.4" fill="#6b7280" />
      <rect x="-1" y="-8" width="2" height="14" fill="#d1d5db" />
      <path d="M0 -8 L-8 -24 L-1.5 -20 L0 -28 L1.5 -20 L8 -24 Z" fill="currentColor" stroke="#111" strokeWidth="0.6" />
    </g>
  );
}

function Emblem({ index }: { index: number }) {
  switch (index) {
    case 0:
      return <Dart x={50} y={52} rot={35} />;
    case 1:
      return (
        <>
          <circle cx="50" cy="54" r="20" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="3" />
          <Dart x={50} y={52} rot={35} />
        </>
      );
    case 2:
      return (
        <>
          <Dart x={42} y={54} rot={-28} />
          <Dart x={58} y={54} rot={28} />
        </>
      );
    case 3:
      return (
        <>
          <Dart x={38} y={56} rot={-30} s={0.9} />
          <Dart x={50} y={52} rot={0} s={0.9} />
          <Dart x={62} y={56} rot={30} s={0.9} />
        </>
      );
    case 4:
      return (
        <>
          <circle cx="50" cy="56" r="21" fill="rgba(0,0,0,.35)" stroke="rgba(255,255,255,.8)" strokeWidth="2" />
          <circle cx="50" cy="56" r="13" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2" />
          <circle cx="50" cy="56" r="4.5" fill="#ef4444" />
          <Dart x={58} y={44} rot={32} s={0.85} />
        </>
      );
    default:
      return (
        <>
          <path d="M33 30 L38 18 L44 27 L50 14 L56 27 L62 18 L67 30 Z" fill="#fff7d6" stroke="#7c4a03" strokeWidth="1.2" />
          <Dart x={40} y={60} rot={-26} s={0.85} />
          <Dart x={50} y={58} rot={0} s={0.85} />
          <Dart x={60} y={60} rot={26} s={0.85} />
        </>
      );
  }
}

export default function RankBadge({
  rank,
  size = 64,
  locked = false,
  className = '',
}: {
  rank: RankDef;
  size?: number;
  locked?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const shield = 'M50 3 L92 17 V52 C92 79 72 96 50 105 C28 96 8 79 8 52 V17 Z';
  return (
    <svg
      viewBox="0 0 100 108"
      width={size}
      height={size * 1.08}
      className={className}
      style={{ color: rank.rim, filter: locked ? 'grayscale(1) brightness(.55)' : undefined }}
      aria-label={rank.name}
      role="img"
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={rank.from} />
          <stop offset="1" stopColor={rank.to} />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={shield} fill="#0b0d10" transform="translate(0 2)" opacity=".6" />
      <path d={shield} fill={`url(#g${id})`} stroke={rank.rim} strokeWidth="3" />
      <path d="M50 12 L83 23 V52 C83 73 67 87 50 95 C33 87 17 73 17 52 V23 Z" fill="rgba(0,0,0,.28)" />
      <path d={shield} fill={`url(#s${id})`} />
      <Emblem index={rank.index} />
    </svg>
  );
}
