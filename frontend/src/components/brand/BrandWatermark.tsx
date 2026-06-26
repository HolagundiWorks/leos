// "Developed by" brand watermark — the Holagundi Consulting Wurkz wordmark,
// recreated as an SVG so it stays crisp at any size and follows currentColor.
// Rendered faint, bottom-right, click-through.

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
        fontWeight={500}
        fontSize={52}
      >
        CONSULTING WURKZ
      </text>
    </svg>
  );
}

interface BrandWatermarkProps {
  /** Distance from the bottom edge (px). Clears the 64px cockpit footer in-app. */
  bottom?: number;
  /** Mark width (px). */
  width?: number;
  /** Opacity of the faint mark. */
  opacity?: number;
}

export function BrandWatermark({ bottom = 76, width = 150, opacity = 0.16 }: BrandWatermarkProps) {
  return (
    <div
      aria-hidden
      title="Developed by Holagundi Consulting Wurkz"
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
      <HolagundiWordmark />
    </div>
  );
}
