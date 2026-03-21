import { useId } from 'react';

/**
 * Simple crystal-ball-on-stand mark for Archive / nav accents (not the Lucide Eye).
 */
export function CrystalBallIcon({
  className = '',
  variant = 'default',
}: {
  className?: string;
  variant?: 'default' | 'globe' | 'crystal';
}) {
  const uid = useId().replace(/:/g, '');
  const gradId = `cb-grad-${variant}-${uid}`;
  const stroke =
    variant === 'globe'
      ? 'rgba(34,211,238,0.85)'
      : variant === 'crystal'
        ? 'rgba(167,139,250,0.9)'
        : 'rgba(160,196,240,0.9)';
  const fillOrb =
    variant === 'globe'
      ? { c1: '#22d3ee', c2: '#0e7490' }
      : variant === 'crystal'
        ? { c1: '#c4b5fd', c2: '#6d28d9' }
        : { c1: '#a5b4fc', c2: '#4338ca' };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="12" y1="3" x2="12" y2="17" gradientUnits="userSpaceOnUse">
          <stop stopColor={fillOrb.c1} stopOpacity="0.95" />
          <stop offset="1" stopColor={fillOrb.c2} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {/* Stand */}
      <path
        d="M8 20.5h8c.8 0 1.4-.65 1.3-1.45l-.35-2.1c-.15-.9-.95-1.55-1.85-1.55h-5.2c-.9 0-1.7.65-1.85 1.55l-.35 2.1c-.1.8.5 1.45 1.3 1.45Z"
        fill="rgba(120,90,50,0.45)"
        stroke="rgba(180,140,80,0.35)"
        strokeWidth="0.5"
      />
      <ellipse cx="12" cy="19.5" rx="4" ry="1.2" fill="rgba(0,0,0,0.35)" />
      {/* Sphere */}
      <circle cx="12" cy="10" r="7.25" fill={`url(#${gradId})`} stroke={stroke} strokeWidth="1.1" opacity="0.95" />
      {/* Inner highlight */}
      <ellipse cx="9.5" cy="7.5" rx="2.2" ry="1.4" fill="white" fillOpacity="0.22" transform="rotate(-25 9.5 7.5)" />
      <circle cx="14" cy="12" r="1.1" fill="white" fillOpacity="0.12" />
    </svg>
  );
}
