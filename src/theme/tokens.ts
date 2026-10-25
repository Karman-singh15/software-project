/**
 * Design tokens for the PlantNet app.
 * Single dark botanical theme — tuned for glanceable sensor dashboards.
 */

export const C = {
  bg: '#080F0D',
  bgElevated: '#0E1714',
  surface: '#121C18',
  surfaceAlt: '#18241F',
  surfaceHi: '#1F2E28',
  border: '#22322C',
  borderHi: '#31463D',

  text: '#E9F2ED',
  textMuted: '#93A89D',
  textDim: '#61776C',

  leaf: '#3DDC84',
  leafDim: '#1F7A4A',
  water: '#4CC2FF',
  waterDim: '#1A5C80',
  sun: '#FFC24B',
  sunDim: '#7A5A18',
  soil: '#C08457',
  danger: '#FF6B6B',
  dangerDim: '#6E2626',
  warn: '#FFA53B',
  violet: '#A78BFA',
  pink: '#F472B6',
} as const;

export const S = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const R = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const F = {
  h1: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.6 },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  h3: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  small: { fontSize: 12, fontWeight: '500' as const },
  tiny: { fontSize: 10.5, fontWeight: '700' as const, letterSpacing: 0.7 },
  metric: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.8 },
};

/** Maps a 0..1 score to a health colour ramp. */
export function scoreColor(score: number): string {
  if (score >= 0.82) return C.leaf;
  if (score >= 0.62) return '#A3E635';
  if (score >= 0.42) return C.sun;
  if (score >= 0.25) return C.warn;
  return C.danger;
}

export function metricColor(kind: 'soil' | 'temp' | 'lux' | 'tank'): string {
  switch (kind) {
    case 'soil':
      return C.water;
    case 'temp':
      return C.warn;
    case 'tank':
      return C.violet;
    case 'lux':
      return C.sun;
  }
}
