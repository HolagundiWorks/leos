interface BrandMarkProps {
  size?: number;
}

/** Canonical LEOS mark. The SVG master is shared with desktop packaging. */
export function BrandMark({ size = 52 }: BrandMarkProps) {
  return (
    <img
      src="/leos-logo.svg"
      width={size}
      height={size}
      alt="LEOS"
      style={{ display: 'block' }}
    />
  );
}
