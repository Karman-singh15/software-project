// Self-check for the alert + prediction logic. Run: npx tsx src/domain/insights.check.ts
import assert from 'node:assert/strict';

import { HOUR } from '@/lib/util';
import { buildAlerts, predictNextWatering } from './insights';
import type { Plant, Reading } from './types';

const now = Date.now();
const plant = (history: Reading[], extra: Partial<Plant> = {}): Plant => ({
  id: 'p1', name: 'Monty', speciesId: 'monstera', zone: 'Living Room', gx: 0, gy: 0, potLitres: 6,
  addedAt: now - 3 * HOUR, address: '172.20.10.2', online: true, lastSeen: now,
  soilTarget: { min: 40, max: 70 }, lastWateredAt: 0, lastFertilizedAt: now, history, events: [], photos: [],
  ...extra,
});
const r = (hAgo: number, soil: number, o: Partial<Reading> = {}): Reading => ({ t: now - hAgo * HOUR, soil, temp: 22, lux: 800, tank: 80, ...o });

// Soil falling 1%/h, now at 57% → hits 40% in ~17 h.
const drying = plant([3, 2.5, 2, 1.5, 1, 0.5, 0].map((h) => r(h, 60 - (3 - h))));
const pred = predictNextWatering(drying, now);
assert.ok(pred.hours != null && Math.abs(pred.hours - 17) < 0.5, `expected ~17 h, got ${pred.hours}`);

// Too little data → no guess.
assert.equal(predictNextWatering(plant([r(0.1, 60), r(0, 60)]), now).hours, null);

// Healthy plant → no alerts.
assert.deepEqual(buildAlerts([drying], now), []);

// Dry, cold, no light sensor, low tank.
const bad = plant([r(0, 25, { temp: 9, lux: null, tank: 5 })]);
const ids = buildAlerts([bad], now).map((a) => a.id).sort();
assert.deepEqual(ids, ['dry_p1', 'lux_p1', 'tank_172.20.10.2', 'temp_p1']);
assert.equal(buildAlerts([bad], now)[0].level, 'critical');

// Offline node is flagged; two plants on one ESP32 share a single tank alert.
const off = plant([r(1, 50, { tank: 5 })], { online: false, lastSeen: now - HOUR });
const two = buildAlerts([off, { ...off, id: 'p2' }], now);
assert.ok(two.some((a) => a.id === 'offline_p1'));
assert.equal(two.filter((a) => a.id.startsWith('tank_')).length, 1);

// Light outside 50–12k lux is flagged both ways; inside it isn't.
const lightIds = (lux: number) => buildAlerts([plant([r(0, 50, { lux })])], now).map((a) => a.id);
assert.deepEqual(lightIds(20), ['light_p1']);
assert.deepEqual(lightIds(15000), ['light_p1']);
assert.deepEqual(lightIds(71), []);

console.log('insights ok');
