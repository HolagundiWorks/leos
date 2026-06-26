// "Developed by" credit — faint, click-through, bottom-right.
interface BrandWatermarkProps {
  /** Distance from the bottom edge (px). */
  bottom?: number;
}

export function BrandWatermark({ bottom = 14 }: BrandWatermarkProps) {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        right: 16,
        bottom,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.06em',
        color: 'var(--mantine-color-gray-6)',
        opacity: 0.7,
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 50,
      }}
    >
      Developed by HOLAGUNDI CONSULTING WORKS
    </div>
  );
}
