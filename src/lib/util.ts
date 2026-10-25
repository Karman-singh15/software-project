export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function round(v: number, dp = 1): number {
  const m = Math.pow(10, dp);
  return Math.round(v * m) / m;
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
