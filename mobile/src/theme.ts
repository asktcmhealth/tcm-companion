// "Herbal apothecary" look: parchment paper, deep herb green, brass accents,
// a serif for headings. The same tokens are mirrored in the desktop app
// (app/src/styles.css) so the two read as one product.
//
// Fonts are the phone's own serif (Georgia on iOS, Noto Serif on Android), so
// the look costs no download and no extra dependency.

import { Platform, useColorScheme, type ViewStyle } from 'react-native';

export const lightTheme = {
  bg: '#f3ebd9',
  card: '#fffaf0',
  cardSunken: '#f0e6cf',
  ink: '#2a2418',
  inkMuted: '#6b6250',
  inkFaint: '#9c927b',
  border: '#e4d7b8',
  borderStrong: '#d0bf94',
  accent: '#2c5a46',
  accentStrong: '#1d4333',
  accentSoft: '#e1ebdf',
  onAccent: '#ffffff',
  // brass: the decorative accent (rules, numerals, ornaments). Never carries
  // meaning on its own; warnings keep their own amber/red/blue.
  brass: '#a8843f',
  brassSoft: '#efe3c3',
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
  disabled: '#d0bf94',
  shadow: '#5a4a22',
};

export type Theme = typeof lightTheme;

export const darkTheme: Theme = {
  bg: '#1b1912',
  card: '#26231a',
  cardSunken: '#1a1810',
  ink: '#efe7d3',
  inkMuted: '#ada38b',
  inkFaint: '#7c745f',
  border: '#37321f',
  borderStrong: '#4a432b',
  accent: '#79bea3',
  accentStrong: '#97d2ba',
  accentSoft: '#243a30',
  onAccent: '#0f211a',
  brass: '#d3b06a',
  brassSoft: '#3a3118',
  warnBg: '#3a2f12',
  warnInk: '#e0b95c',
  warnBorder: '#5c4a1e',
  danger: '#e2857a',
  dangerBg: '#3a2320',
  verifyBg: '#1f2b40',
  verifyInk: '#9db9ea',
  verifyBorder: '#35496d',
  disabled: '#4a432b',
  shadow: '#000000',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}

/** Headings: the device's own serif. Body text stays in the default sans for readability. */
export const serifFont: string = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

/** A soft paper-card lift; flat in dark mode where shadows do not read. */
export function cardShadow(theme: Theme): ViewStyle {
  return {
    shadowColor: theme.shadow,
    shadowOpacity: theme === darkTheme ? 0 : 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: theme === darkTheme ? 0 : 2,
  };
}
