// Same design tokens as the desktop app (app/src/styles.css), including the
// dark palette, so the two apps read as one product.

import { useColorScheme } from 'react-native';

export const lightTheme = {
  bg: '#ede8db',
  card: '#fffefb',
  cardSunken: '#f1ede2',
  ink: '#17190f',
  inkMuted: '#66675c',
  inkFaint: '#9a9a8c',
  border: '#e3ddcc',
  borderStrong: '#cfc7ac',
  accent: '#2f5d50',
  accentStrong: '#1e4438',
  accentSoft: '#e4ede9',
  onAccent: '#ffffff',
  warnBg: '#fbf1d9',
  warnInk: '#8a5a00',
  warnBorder: '#e9cd8b',
  danger: '#a3352a',
  dangerBg: '#f9e8e5',
  // "Verify" = the transcript is ambiguous between two real herbs/points. A
  // third semantic color so it never reads as the amber high-risk or red
  // out-of-range signals beside it.
  verifyBg: '#e6edf8',
  verifyInk: '#2a4a7f',
  verifyBorder: '#aebfdc',
  disabled: '#cfc7ac',
};

export type Theme = typeof lightTheme;

export const darkTheme: Theme = {
  bg: '#1c1e1a',
  card: '#24261f',
  cardSunken: '#1a1c17',
  ink: '#ece8dc',
  inkMuted: '#a3a396',
  inkFaint: '#767468',
  border: '#34362c',
  borderStrong: '#45473a',
  accent: '#6fb39d',
  accentStrong: '#8bc9b5',
  accentSoft: '#253b34',
  onAccent: '#10201a',
  warnBg: '#3a2f12',
  warnInk: '#e0b95c',
  warnBorder: '#5c4a1e',
  danger: '#e2857a',
  dangerBg: '#3a2320',
  verifyBg: '#1f2b40',
  verifyInk: '#9db9ea',
  verifyBorder: '#35496d',
  disabled: '#45473a',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
