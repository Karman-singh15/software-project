import { DAY, HOUR, clamp, round } from '@/lib/util';
import { speciesById } from './species';
import type { Alert, Plant, Range, Reading } from './types';

export const OFFLINE_MS = 15_000;
/** Upper temperature limit for every plant, °C; the lower limit stays per species. */
export const TEMP_MAX_C = 29;

/**
 * Light range for every plant, lux, set from this BH1750 on site: an ordinary room reads ~70 lux and a phone
 * flashlight held on it ~12k. (The species catalogue's daylight figures, up to 60k, never happen indoors.)
 */
export const LUX_RANGE: Range = { min: 50, max: 5000 };

export function tempRange(speciesId: string): Range {
  return { min: speciesById(speciesId).temp.min, max: TEMP_MAX_C };
}
const TANK_WARN = 18;

export function latest(p: Plant): Reading | undefined {
  return p.history[p.history.length - 1];
}

/* ------------------------------------------------------------------ *
 * Health scoring
 * ------------------------------------------------------------------ */

/** 1 inside the ideal band, decaying to 0 as the value drifts a full band-width away. */
export function bandScore(value: number, band: Range): number {
  const width = Math.max(band.max - band.min, 1);
  if (value >= band.min && value <= band.max) return 1;
  const dist = value < band.min ? band.min - value : value - band.max;
  return clamp(1 - dist / width, 0, 1);
}

export type HealthBreakdown = {
  score: number;
  soil: number;
  temp: number;
  /** null when the node has no working light sensor */
  lux: number | null;
  stability: number;
  care: number;
  grade: string;
  headline: string;
};

export function healthScore(plant: Plant, now: number): HealthBreakdown {
  const species = speciesById(plant.speciesId);
  const last = latest(plant);
  if (!last) {
    return { score: 0, soil: 0, temp: 0, lux: null, stability: 0, care: 1, grade: '–', headline: 'Waiting for the first reading from the ESP32' };
  }
  const recent = plant.history.filter((r) => r.t > now - 3 * DAY);

  const soil = bandScore(last.soil, plant.soilTarget);
  const tr = tempRange(plant.speciesId);
  const temp = bandScore(last.temp, tr);
  // Night readings would drag light to zero, so only score readings taken in daylight.
  const lit = recent.filter((r) => r.lux != null && r.lux > 50).map((r) => r.lux as number);
  const dayLux = lit.length ? avg(lit) : null;
  const lux = dayLux == null ? null : bandScore(dayLux, LUX_RANGE);

  const inBand = recent.filter((r) => r.soil >= plant.soilTarget.min && r.soil <= plant.soilTarget.max).length;
  const stability = recent.length ? inBand / recent.length : 1;

  const daysSinceFeed = (now - plant.lastFertilizedAt) / DAY;
  const care = clamp(1 - Math.max(0, daysSinceFeed - species.fertilizeEveryDays) / 45, 0.35, 1);

  const parts = [
    { v: soil, w: 0.34, msg: last.soil < plant.soilTarget.min ? 'Soil is drier than ideal' : 'Soil is wetter than ideal' },
    { v: stability, w: 0.2, msg: 'Moisture keeps leaving the target band' },
    { v: temp, w: 0.2, msg: last.temp < tr.min ? 'Running cold' : 'Running hot' },
    ...(lux == null ? [] : [{ v: lux, w: 0.16, msg: dayLux! < LUX_RANGE.min ? 'Not enough light' : 'Getting more light than it likes' }]),
    { v: care, w: 0.1, msg: 'Overdue for fertiliser' },
  ];
  const score = clamp(parts.reduce((a, p) => a + p.v * p.w, 0) / parts.reduce((a, p) => a + p.w, 0), 0, 1);
  const worst = [...parts].sort((a, b) => a.v - b.v)[0];

  return {
    score,
    soil,
    temp,
    lux,
    stability,
    care,
    grade: score >= 0.85 ? 'A' : score >= 0.72 ? 'B' : score >= 0.55 ? 'C' : score >= 0.4 ? 'D' : 'F',
    headline: worst.v > 0.9 ? 'Thriving — everything in range' : worst.msg,
  };
}

/** Environment-only health averaged across a time window, for week-over-week comparisons. */
export function windowHealth(plant: Plant, from: number, to: number): number {
  const rows = plant.history.filter((r) => r.t >= from && r.t <= to);
  if (!rows.length) return 0;
  const soil = avg(rows.map((r) => bandScore(r.soil, plant.soilTarget)));
  const temp = avg(rows.map((r) => bandScore(r.temp, tempRange(plant.speciesId))));
  const inBand = rows.filter((r) => r.soil >= plant.soilTarget.min && r.soil <= plant.soilTarget.max).length / rows.length;
  return clamp(soil * 0.45 + inBand * 0.3 + temp * 0.25, 0, 1);
}

/* ------------------------------------------------------------------ *
 * Next-watering prediction
 * ------------------------------------------------------------------ */

export type Prediction = {
  /** hours until soil reaches the lower bound; null = not enough drying data yet */
  hours: number | null;
  at: number | null;
  confidence: number;
  ratePerDay: number;
  note: string;
};

/** Least-squares fit over the current drying leg (since the last watering, at most 24 h). */
export function predictNextWatering(plant: Plant, now: number): Prediction {
  const hist = plant.history;
  const last = hist[hist.length - 1];
  const lastWaterIdx = findLastIndex(hist, (r) => !!r.watered);
  const leg = hist.slice(lastWaterIdx + 1).filter((r) => r.t > now - DAY);

  if (!last) return { hours: null, at: null, confidence: 0, ratePerDay: 0, note: 'No readings yet' };
  if (last.soil <= plant.soilTarget.min) return { hours: 0, at: now, confidence: 1, ratePerDay: 0, note: 'Soil is already at or below the target band' };

  const spanH = leg.length ? (leg[leg.length - 1].t - leg[0].t) / HOUR : 0;
  if (leg.length < 6 || spanH < 1) {
    return { hours: null, at: null, confidence: 0, ratePerDay: 0, note: 'Learning the drying rate — needs about an hour of readings' };
  }
  const { slope, r2 } = linreg(
    leg.map((r) => (r.t - leg[0].t) / HOUR),
    leg.map((r) => r.soil),
  );
  if (slope > -0.02) {
    return { hours: null, at: null, confidence: r2, ratePerDay: 0, note: 'Soil isn’t drying measurably right now' };
  }
  const ratePerDay = -slope * 24;
  const hours = ((last.soil - plant.soilTarget.min) / ratePerDay) * 24;
  return {
    hours,
    at: now + hours * HOUR,
    confidence: clamp(r2, 0, 1),
    ratePerDay: round(ratePerDay, 2),
    note: `Fitted from the last ${round(spanH, 1)} h of readings`,
  };
}

function linreg(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = avg(xs);
  const my = avg(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (ys[i] - (slope * xs[i] + intercept)) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  return { slope, r2: ssTot === 0 ? 0 : clamp(1 - ssRes / ssTot, 0, 1) };
}

/* ------------------------------------------------------------------ *
 * Alerts — every one is derived from a live reading or a logged event
 * ------------------------------------------------------------------ */

export function buildAlerts(plants: Plant[], now: number): Alert[] {
  const alerts: Alert[] = [];
  const tankSeen = new Set<string>();

  for (const p of plants) {
    const species = speciesById(p.speciesId);
    const last = latest(p);

    if (!p.online) {
      alerts.push({
        id: `offline_${p.id}`,
        level: 'critical',
        title: `${p.name}: ESP32 not responding`,
        detail: p.lastSeen
          ? `No reading from ${p.address} since ${relTime(p.lastSeen, now)}. Check its power, and that the phone is on the same Wi-Fi.`
          : `Can't reach ${p.address}. Check the address on the serial monitor, and that the phone is on the same Wi-Fi.`,
        plantId: p.id,
        icon: '📡',
        t: now,
      });
    }
    if (!last) continue;
    const stale = !p.online ? ` (last known, ${relTime(last.t, now)})` : '';

    if (last.soil < p.soilTarget.min) {
      alerts.push({
        id: `dry_${p.id}`,
        level: last.soil < p.soilTarget.min - 10 ? 'critical' : 'warning',
        title: `${p.name} is dry (${Math.round(last.soil)}%)`,
        detail: `Target is ${p.soilTarget.min}–${p.soilTarget.max}%. Water about ${Math.round(species.waterMlPerL * p.potLitres)} ml${stale}.`,
        plantId: p.id,
        icon: '💧',
        t: last.t,
      });
    } else if (last.soil > p.soilTarget.max + 10) {
      alerts.push({
        id: `wet_${p.id}`,
        level: 'warning',
        title: `${p.name} is waterlogged (${Math.round(last.soil)}%)`,
        detail: `Well above the ${p.soilTarget.max}% ceiling. Hold off watering and check drainage${stale}.`,
        plantId: p.id,
        icon: '🌊',
        t: last.t,
      });
    }

    const tr = tempRange(p.speciesId);
    if (last.temp < tr.min || last.temp > tr.max) {
      const cold = last.temp < tr.min;
      const off = cold ? tr.min - last.temp : last.temp - tr.max;
      alerts.push({
        id: `temp_${p.id}`,
        level: off > 5 ? 'critical' : 'warning',
        title: `${p.name} is too ${cold ? 'cold' : 'hot'} (${last.temp.toFixed(1)} °C)`,
        detail: `${species.name} limit is ${tr.min}–${tr.max} °C. ${cold ? 'Move it somewhere warmer' : 'Move it out of direct heat'}${stale}.`,
        plantId: p.id,
        icon: '🌡️',
        t: last.t,
      });
    }

    if (p.online && last.lux == null) {
      alerts.push({
        id: `lux_${p.id}`,
        level: 'info',
        title: `${p.name}: light sensor not answering`,
        detail: 'The BH1750 on this ESP32 returns nothing. Check its SDA/SCL wiring and that its header is soldered.',
        plantId: p.id,
        icon: '☀️',
        t: last.t,
      });
    } else if (last.lux != null && (last.lux < LUX_RANGE.min || last.lux > LUX_RANGE.max)) {
      const dark = last.lux < LUX_RANGE.min;
      alerts.push({
        id: `light_${p.id}`,
        level: 'warning',
        title: `${p.name}: ${dark ? 'too dark' : 'too bright'} (${fmtLux(last.lux)} lux)`,
        detail: `Light range is ${fmtLux(LUX_RANGE.min)}–${fmtLux(LUX_RANGE.max)} lux. ${dark ? 'Move it somewhere brighter' : 'Move it out of direct light'}${stale}.`,
        plantId: p.id,
        icon: dark ? '🌑' : '☀️',
        t: last.t,
      });
    }

    // One tank per ESP32, however many plants share it.
    if (last.tank < TANK_WARN && !tankSeen.has(p.address)) {
      tankSeen.add(p.address);
      alerts.push({
        id: `tank_${p.address}`,
        level: last.tank < 8 ? 'critical' : 'warning',
        title: `Reservoir at ${Math.round(last.tank)}%`,
        detail: `Water level sensor on ${p.address}. Refill the tank${stale}.`,
        plantId: p.id,
        icon: '🪣',
        t: last.t,
      });
    }

    const feedDue = (now - p.lastFertilizedAt) / DAY - species.fertilizeEveryDays;
    if (feedDue > 0) {
      alerts.push({
        id: `feed_${p.id}`,
        level: feedDue > 14 ? 'warning' : 'info',
        title: `${p.name} needs feeding`,
        detail: `${Math.round(feedDue)} days past the ${species.fertilizeEveryDays}-day fertiliser interval.`,
        plantId: p.id,
        icon: '🧪',
        t: now,
      });
    }
  }

  const rank = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.level] - rank[b.level]);
}

/* ------------------------------------------------------------------ *
 * Weekly report
 * ------------------------------------------------------------------ */

export type WeeklyReport = {
  from: number;
  to: number;
  totalMl: number;
  cycles: number;
  avgHealth: number;
  healthDelta: number;
  bestPlant: { name: string; score: number } | null;
  worstPlant: { name: string; score: number } | null;
  perPlant: { id: string; name: string; emoji: string; ml: number; cycles: number; score: number; trend: number }[];
  highlights: string[];
  dailyMl: { t: number; ml: number }[];
};

export function weeklyReport(plants: Plant[], now: number, weeksAgo = 0): WeeklyReport {
  const to = now - weeksAgo * 7 * DAY;
  const from = to - 7 * DAY;
  let totalMl = 0;
  let cycles = 0;
  const dailyMap = new Map<number, number>();
  for (let d = 0; d < 7; d++) dailyMap.set(dayKey(from + d * DAY), 0);

  const perPlant = plants.map((p) => {
    const watered = p.events.filter((e) => e.type === 'watered' && e.t >= from && e.t <= to);
    const ml = watered.reduce((a, e) => a + (e.ml ?? 0), 0);
    totalMl += ml;
    cycles += watered.length;
    for (const e of watered) {
      const k = dayKey(e.t);
      if (dailyMap.has(k)) dailyMap.set(k, (dailyMap.get(k) ?? 0) + (e.ml ?? 0));
    }
    const thisWeek = windowHealth(p, from, to);
    const lastWeek = windowHealth(p, from - 7 * DAY, from);
    return {
      id: p.id,
      name: p.name,
      emoji: speciesById(p.speciesId).emoji,
      ml,
      cycles: watered.length,
      score: thisWeek,
      trend: lastWeek > 0 && thisWeek > 0 ? round(thisWeek - lastWeek, 2) : 0,
    };
  });

  const measured = perPlant.filter((p) => p.score > 0);
  const sorted = [...measured].sort((a, b) => b.score - a.score);
  const avgHealth = measured.length ? avg(measured.map((p) => p.score)) : 0;

  const highlights: string[] = [];
  if (!measured.length) highlights.push('No sensor readings were recorded in this week.');
  if (cycles > 0) highlights.push(`${cycles} waterings logged, ${(totalMl / 1000).toFixed(1)} L in total.`);
  const improving = perPlant.filter((p) => p.trend > 0.05).length;
  if (improving) highlights.push(`${improving} plant${improving > 1 ? 's are' : ' is'} trending healthier than last week.`);
  const declining = sorted[sorted.length - 1];
  if (declining && declining.score < 0.65) highlights.push(`${declining.name} needs attention — health at ${Math.round(declining.score * 100)}%.`);
  if (!highlights.length) highlights.push('A quiet week — every plant stayed inside its target band.');

  return {
    from,
    to,
    totalMl,
    cycles,
    avgHealth,
    healthDelta: round(avg(perPlant.map((p) => p.trend)), 2),
    bestPlant: sorted[0] ? { name: sorted[0].name, score: sorted[0].score } : null,
    worstPlant: sorted.length > 1 ? { name: sorted[sorted.length - 1].name, score: sorted[sorted.length - 1].score } : null,
    perPlant,
    highlights,
    dailyMl: [...dailyMap.entries()].map(([t, ml]) => ({ t, ml })).sort((a, b) => a.t - b.t),
  };
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

export function avg(a: number[]): number {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}

export function findLastIndex<T>(arr: T[], fn: (t: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i])) return i;
  return -1;
}

function dayKey(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function fmtHours(h: number): string {
  if (!isFinite(h)) return '—';
  if (h <= 0.25) return 'now';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

export function relTime(t: number, now: number): string {
  const d = now - t;
  if (d < 0) return `in ${fmtHours(-d / HOUR)}`;
  if (d < 60_000) return 'just now';
  if (d < HOUR) return `${Math.round(d / 60_000)} min ago`;
  if (d < DAY) return `${Math.round(d / HOUR)} h ago`;
  return `${Math.round(d / DAY)} d ago`;
}

export function fmtLux(v: number | null): string {
  if (v == null) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}
