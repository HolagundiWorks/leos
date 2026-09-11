import {
  Badge,
  Button,
  Card,
  createTheme,
  Paper,
  type MantineColorsTuple,
} from '@mantine/core';

// ---------------------------------------------------------------------------
// LEOS Carbon-based semantic palette. Source of truth: docs/BRAND.md.
// UI interaction uses Blue 60; the identity mark uses Purple 60 with Blue 60
// and Cyan 50. Surfaces use Carbon White/G10/G90/G100 themes.
// ---------------------------------------------------------------------------

// Purple — LEOS identity, with Purple 60 at shade 5
const brand: MantineColorsTuple = [
  '#f6f2ff', '#e8daff', '#d4bbff', '#be95ff', '#a56eff',
  '#8a3ffc', '#6929c4', '#491d8b', '#31135e', '#1c0f30',
];
// Carbon Green — success
const mint: MantineColorsTuple = [
  '#defbe6', '#a7f0ba', '#6fdc8c', '#42be65', '#24a148',
  '#198038', '#0e6027', '#044317', '#022d0d', '#071908',
];
// Carbon Yellow/Orange — warnings and due dates
const yellow: MantineColorsTuple = [
  '#fcf4d6', '#fddc69', '#f1c21b', '#d2a106', '#b28600',
  '#8e6a00', '#684e00', '#483700', '#302400', '#1c1500',
];
// Soft Blue — informational, secondary accent
const sky: MantineColorsTuple = [
  '#edf5ff', '#d0e2ff', '#a6c8ff', '#78a9ff', '#4589ff',
  '#0f62fe', '#0043ce', '#002d9c', '#001d6c', '#001141',
];
// Violet — categorical accent (lavender-ish)
const lavender: MantineColorsTuple = [
  '#f4f1ff', '#e5deff', '#cbbaff', '#ad93ff', '#9070f7',
  '#7550e8', '#5f3cc8', '#4a2ca6', '#35207e', '#211554',
];
// Muted Red — danger/critical (kept restrained per brand guide)
const peach: MantineColorsTuple = [
  '#fff2f1', '#ffdbd9', '#ffbab7', '#ff9290', '#f97070',
  '#e85555', '#c83838', '#a02626', '#7a1818', '#550d0d',
];
// Warm Rose — categorical accent
const rose: MantineColorsTuple = [
  '#fff0f5', '#ffd6e6', '#ffaed0', '#ff84b8', '#f2609f',
  '#db4080', '#b82e65', '#91204c', '#6c1336', '#470822',
];
// Sand — warm neutral accent
const sand: MantineColorsTuple = [
  '#faf6f0', '#f0e6d6', '#e0ccb0', '#cdb28a', '#bb9a6a',
  '#a8834e', '#8c6b3e', '#6f5430', '#533e23', '#382a17',
];
// Carbon Gray — White/G10 through G100
const gray: MantineColorsTuple = [
  '#ffffff', '#f4f4f4', '#e0e0e0', '#c6c6c6', '#a8a8a8',
  '#8d8d8d', '#6f6f6f', '#525252', '#393939', '#161616',
];

export const theme = createTheme({
  primaryColor: 'sky',
  primaryShade: { light: 5, dark: 4 },
  white: '#FFFFFF',
  black: '#161616',
  defaultRadius: 'md',
  colors: { brand, sky, mint, peach, rose, lavender, yellow, sand, gray },
  fontFamily:
    'Inter, "IBM Plex Sans", Manrope, "Segoe UI", system-ui, -apple-system, sans-serif',
  headings: {
    fontFamily:
      'Inter, "IBM Plex Sans", Manrope, "Segoe UI", system-ui, -apple-system, sans-serif',
    fontWeight: '600',
  },
  components: {
    Card: Card.extend({
      defaultProps: { radius: 'md', withBorder: true, shadow: 'none', padding: 'md' },
    }),
    Paper: Paper.extend({ defaultProps: { radius: 'md' } }),
    Button: Button.extend({ defaultProps: { radius: 'md' } }),
    Badge: Badge.extend({ defaultProps: { radius: 'sm', variant: 'light' } }),
  },
});

export type AccentColor =
  | 'brand'
  | 'sky'
  | 'mint'
  | 'peach'
  | 'rose'
  | 'lavender'
  | 'yellow'
  | 'sand';
// Categorical rotation for data elements: teal, blue, green, amber, rose, violet
export const accentColors: AccentColor[] = ['brand', 'sky', 'mint', 'yellow', 'rose', 'lavender'];
