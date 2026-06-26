import { useState } from 'react';

// Holagundi Consulting Wurkz wordmark — used as the fallback watermark until the
// real HCW emblem file is added (see WatermarkArt below).
export function HolagundiWordmark({ title }: { title?: string }) {
  return (
    <svg
      viewBox="0 0 480 120"
      role="img"
      aria-label={title ?? 'Holagundi Consulting Wurkz'}
      fill="currentColor"
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      <text
        x="0"
        y="70"
        textLength="480"
        lengthAdjust="spacing"
        fontFamily="'Helvetica Neue', Arial, sans-serif"
        fontWeight={800}
        fontSize={82}
      >
        HOLAGUNDI
      </text>
      <text
        x="0"
        y="112"
        textLength="480"
        lengthAdjust="spacing"
        fontFamily="'Helvetica Neue', Arial, sans-serif"
        fontWeight={400}
        fontSize={50}
      >
        CONSULTING WURKZ
      </text>
    </svg>
  );
}

// Prefer the real HCW emblem. Drop the artwork into `frontend/public/` as
// `hcw-logo.svg` (best) or `hcw-logo.png`; it's picked up automatically.
// Until then this falls back to the Holagundi wordmark — no build break.
function WatermarkArt() {
  const [stage, setStage] = useState<'svg' | 'png' | 'fallback'>('svg');
  if (stage === 'fallback') return <HolagundiWordmark />;
  return (
    <img
      src={stage === 'svg' ? '/hcw-logo.svg' : '/hcw-logo.png'}
      alt=""
      style={{ display: 'block', width: '100%', height: 'auto' }}
      onError={() => setStage((s) => (s === 'svg' ? 'png' : 'fallback'))}
    />
  );
}

interface BrandWatermarkProps {
  /** Distance from the bottom edge (px). Clears the 64px cockpit footer in-app. */
  bottom?: number;
  /** Mark width (px) — sized for the roughly-square HCW emblem. */
  width?: number;
  /** Opacity of the faint mark. */
  opacity?: number;
}

export function BrandWatermark({ bottom = 80, width = 104, opacity = 0.18 }: BrandWatermarkProps) {
  return (
    <div
      aria-hidden
      title="HCW School Management System"
      style={{
        position: 'fixed',
        right: 16,
        bottom,
        width,
        opacity,
        color: 'var(--mantine-color-gray-9)',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 50,
      }}
    >
      <WatermarkArt />
    </div>
  );
}
