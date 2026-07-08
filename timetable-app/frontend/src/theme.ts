import {
  Badge,
  Button,
  Card,
  createTheme,
  Paper,
  type MantineColorsTuple,
} from '@mantine/core';

const brand: MantineColorsTuple = [
  '#e8f4f4', '#c4e3e3', '#9dd0d0', '#74bcbc', '#52a9a9',
  '#3E7B7B', '#336666', '#295252', '#1e3d3d', '#122929',
];
const mint: MantineColorsTuple = [
  '#eef5ef', '#cde3cf', '#a9d0ac', '#84bc89', '#6da671',
  '#5C8A62', '#4d7452', '#3d5d41', '#2c4530', '#1c2d1f',
];
const yellow: MantineColorsTuple = [
  '#fdf5e8', '#f8e4b9', '#f3d08a', '#ecba5c', '#e3ab4b',
  '#D9A441', '#b88836', '#906c2b', '#6d5120', '#4a3615',
];
const sky: MantineColorsTuple = [
  '#f0f6ff', '#dceeff', '#bad9ff', '#91beff', '#6da3ff',
  '#4d8cf5', '#3871d8', '#2658b3', '#18418c', '#0e2d66',
];
const lavender: MantineColorsTuple = [
  '#f4f1ff', '#e5deff', '#cbbaff', '#ad93ff', '#9070f7',
  '#7550e8', '#5f3cc8', '#4a2ca6', '#35207e', '#211554',
];
const peach: MantineColorsTuple = [
  '#fff2f1', '#ffdbd9', '#ffbab7', '#ff9290', '#f97070',
  '#e85555', '#c83838', '#a02626', '#7a1818', '#550d0d',
];
const gray: MantineColorsTuple = [
  '#F5F7FA', '#EDF0F5', '#DDE3EC', '#C8D0DC', '#9BAABB',
  '#6B7A91', '#4E5D72', '#364357', '#252F3F', '#1E2329',
];

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 5, dark: 4 },
  white: '#FFFFFF',
  black: '#1E2329',
  defaultRadius: 'md',
  colors: { brand, sky, mint, peach, lavender, yellow, gray },
  fontFamily: 'Inter, system-ui, sans-serif',
  headings: { fontFamily: 'Inter, system-ui, sans-serif', fontWeight: '600' },
  components: {
    Card: Card.extend({ defaultProps: { radius: 'md', withBorder: true, shadow: 'none', padding: 'md' } }),
    Paper: Paper.extend({ defaultProps: { radius: 'md' } }),
    Button: Button.extend({ defaultProps: { radius: 'md' } }),
    Badge: Badge.extend({ defaultProps: { radius: 'sm', variant: 'light' } }),
  },
});
