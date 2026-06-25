import {
  Badge,
  Button,
  Card,
  createTheme,
  Paper,
  type MantineColorsTuple,
} from '@mantine/core';

// ---------------------------------------------------------------------------
// HCW-SMS "Modern School OS" design system
// Feel: Google Classroom + Notion + modern edtech. Light theme.
// Each ramp puts the soft PASTEL accent at the light end (shade ~1) and the
// matching ACTION color mid-ramp (shade 5), so `variant="light"` reads pastel
// and filled/`c=` reads as the strong action color.
// ---------------------------------------------------------------------------

// Blue — primary. accent Sky #BEE3F8 (1) -> Info #3B82F6 (5)
const brand: MantineColorsTuple = [
  '#eff6ff', '#BEE3F8', '#93cdf5', '#66b2f0', '#4098ea',
  '#3b82f6', '#2f6fe0', '#2563c4', '#1f54a6', '#1a4488',
];
// Sky — lighter blue (accent at shade 2)
const sky: MantineColorsTuple = [
  '#eef9ff', '#d6eefc', '#BEE3F8', '#93cdf5', '#66b2f0',
  '#4098ea', '#3b82f6', '#2f6fe0', '#2563c4', '#1f54a6',
];
// Green — accent Mint #C6F6D5 (1) -> Success #22C55E (5)
const mint: MantineColorsTuple = [
  '#ecfdf3', '#C6F6D5', '#9be8b4', '#6ed993', '#45cd76',
  '#22C55E', '#1ba84e', '#158540', '#116a34', '#0d5429',
];
// Warm — accent Peach #FED7CC (1) -> Danger #EF4444 (5)
const peach: MantineColorsTuple = [
  '#fff2ee', '#FED7CC', '#fbb39f', '#f98e72', '#f56a4d',
  '#EF4444', '#dc3535', '#c02a2a', '#9f2121', '#7f1a1a',
];
// Pink/red — used for destructive accents (e.g. sign out)
const rose: MantineColorsTuple = [
  '#fff1f4', '#ffd6df', '#fbabbd', '#f67f9a', '#ef5a7c',
  '#e23e64', '#d12d54', '#b02246', '#8f1b39', '#6f142c',
];
// Violet — accent Lavender #E9D8FD (1)
const lavender: MantineColorsTuple = [
  '#f6f0fe', '#E9D8FD', '#d3b4fb', '#bd8ff6', '#a76ef0',
  '#9354e6', '#8b41dd', '#7530c4', '#5f27a0', '#4b2080',
];
// Amber — accent Soft Yellow #FEF3C7 (1) -> Warning #F59E0B (5)
const yellow: MantineColorsTuple = [
  '#fffbeb', '#FEF3C7', '#fde58a', '#fcd34d', '#f9bd24',
  '#F59E0B', '#d9870a', '#b66f06', '#925905', '#784a08',
];
// Neutrals — bg #FAFBFC, border #E5E7EB, secondary #6B7280, primary #1F2937
const gray: MantineColorsTuple = [
  '#FAFBFC', '#F3F4F6', '#E5E7EB', '#D1D5DB', '#9CA3AF',
  '#6B7280', '#4B5563', '#374151', '#1F2937', '#111827',
];

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 5, dark: 7 },
  white: '#FFFFFF',
  black: '#1F2937',
  defaultRadius: 'lg',
  colors: { brand, sky, mint, peach, rose, lavender, yellow, gray },
  fontFamily:
    'Inter, "Segoe UI", Roboto, system-ui, -apple-system, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily:
      'Inter, "Segoe UI", Roboto, system-ui, -apple-system, Helvetica, Arial, sans-serif',
    fontWeight: '650',
  },
  defaultGradient: { from: 'brand', to: 'lavender', deg: 135 },
  components: {
    Card: Card.extend({
      defaultProps: { radius: 'lg', withBorder: true, shadow: 'xs', padding: 'lg' },
    }),
    Paper: Paper.extend({ defaultProps: { radius: 'lg' } }),
    Button: Button.extend({ defaultProps: { radius: 'md' } }),
    Badge: Badge.extend({ defaultProps: { radius: 'sm', variant: 'light' } }),
  },
});

// Pastel accents available for category / subject coloring.
export const accentColors = ['brand', 'sky', 'mint', 'peach', 'lavender', 'yellow', 'rose'] as const;
export type AccentColor = (typeof accentColors)[number];

// Semantic action color -> ramp name (each ramp's shade 5 is the action color).
export const semantic = {
  success: 'mint',
  warning: 'yellow',
  danger: 'peach',
  info: 'brand',
} as const;
