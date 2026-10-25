import React, { useMemo, useState } from 'react';
import { Text, View, useWindowDimensions, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

import { C, F, S, metricColor, scoreColor } from '@/theme/tokens';
import { useGarden } from '@/store/garden';
import { speciesById } from '@/domain/species';
import type { MetricKind, Plant } from '@/domain/types';
import { LUX_RANGE, avg, fmtLux, healthScore, latest, tempRange } from '@/domain/insights';
import { DAY, HOUR } from '@/lib/util';
import {
  BarChart,
  HeatMap,
  Legend,
  LineChart,
  PatternGrid,
  type HeatCell,
  type Point,
} from '@/components/charts';
import {
  Card,
  Chip,
  Muted,
  Overline,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Spacer,
  StatTile,
  Txt,
} from '@/components/ui';

type RangeKey = '24h' | '7d' | '14d';
type HeatMode = 'moisture' | 'health' | 'light' | 'temp';

const METRICS: { key: MetricKind; label: string; unit: string; icon: string }[] = [
  { key: 'soil', label: 'Soil moisture', unit: '%', icon: '💧' },
  { key: 'temp', label: 'Temperature', unit: '°C', icon: '🌡️' },
  { key: 'lux', label: 'Light', unit: 'lux', icon: '☀️' },
  { key: 'tank', label: 'Reservoir', unit: '%', icon: '🪣' },
];

export default function AnalyticsScreen() {
  const g = useGarden();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const chartW = width - S.lg * 2 - S.lg * 2;

  const [range, setRange] = useState<RangeKey>('7d');
  const [metric, setMetric] = useState<MetricKind>('soil');
  const [plantId, setPlantId] = useState<string>('all');
  const [heatMode, setHeatMode] = useState<HeatMode>('moisture');

  const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 14;
  const from = g.now - hours * HOUR;
  const meta = METRICS.find((m) => m.key === metric)!;
  const selected = g.plants.filter((p) => plantId === 'all' || p.id === plantId);

  const series: Point[] = useMemo(() => {
    if (!selected.length) return [];
    const step = hours <= 24 ? 1 : hours <= 168 ? 3 : 6;
    const buckets = new Map<number, number[]>();
    for (const p of selected) {
      for (const r of p.history) {
        const v = r[metric];
        if (r.t < from || v == null) continue;
        const k = Math.round(r.t / (step * HOUR)) * step * HOUR;
        const arr = buckets.get(k) ?? [];
        arr.push(v);
        buckets.set(k, arr);
      }
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, vals]) => ({ x: t, y: Math.round(avg(vals) * 10) / 10 }));
  }, [selected, from, metric, hours]);

  const band = useMemo(() => {
    if (plantId === 'all' || !selected[0]) return undefined;
    const sp = speciesById(selected[0].speciesId);
    return metric === 'soil'
      ? selected[0].soilTarget
      : metric === 'temp'
        ? tempRange(sp.id)
        : metric === 'lux'
          ? LUX_RANGE
          : undefined;
  }, [plantId, selected, metric]);

  const stats = useMemo(() => {
    const vals = series.map((p) => p.y);
    if (!vals.length) return { min: 0, max: 0, mean: 0, delta: 0 };
    const mean = avg(vals);
    const first = avg(vals.slice(0, Math.max(1, Math.floor(vals.length / 4))));
    const lastQ = avg(vals.slice(-Math.max(1, Math.floor(vals.length / 4))));
    return { min: Math.min(...vals), max: Math.max(...vals), mean, delta: lastQ - first };
  }, [series]);

  /* -------- heat map -------- */
  const heatCells: HeatCell[] = useMemo(
    () =>
      g.plants.map((p) => {
        const sp = speciesById(p.speciesId);
        const last = latest(p);
        const h = healthScore(p, g.now);
        if (heatMode === 'health') {
          return cell(p, sp.emoji, h.score, `${Math.round(h.score * 100)}`, scoreColor(h.score));
        }
        if (heatMode === 'light') {
          const dayLux = avg(p.history.slice(-24).flatMap((r) => (r.lux == null ? [] : [r.lux])));
          const norm = Math.min(dayLux / LUX_RANGE.max, 1.4);
          return cell(p, sp.emoji, norm, fmtLux(dayLux), ramp(norm, C.sun));
        }
        if (heatMode === 'temp') {
          const t = last?.temp ?? 20;
          const norm = (t - 10) / 25;
          return cell(p, sp.emoji, norm, `${Math.round(t)}°`, ramp(norm, C.warn));
        }
        const soil = last?.soil ?? 0;
        const rel = (soil - p.soilTarget.min) / Math.max(p.soilTarget.max - p.soilTarget.min, 1);
        const col = rel < 0 ? C.warn : rel > 1.35 ? C.violet : C.water;
        return cell(p, sp.emoji, soil / 100, `${Math.round(soil)}%`, col);
      }),
    [g.plants, g.now, heatMode],
  );

  /* -------- water usage -------- */
  const usage = useMemo(() => {
    const days: { t: number; ml: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(g.now - i * DAY);
      d.setHours(0, 0, 0, 0);
      days.push({ t: d.getTime(), ml: 0 });
    }
    for (const p of g.plants) {
      for (const e of p.events) {
        if (e.type !== 'watered' || !e.ml) continue;
        const d = new Date(e.t);
        d.setHours(0, 0, 0, 0);
        const hit = days.find((x) => x.t === d.getTime());
        if (hit) hit.ml += e.ml;
      }
    }
    return days;
  }, [g.plants, g.now]);

  /* -------- watering pattern (day x 4-hour block) -------- */
  const pattern = useMemo(() => {
    const m = Array.from({ length: 7 }, () => Array(6).fill(0) as number[]);
    for (const p of selected) {
      for (const r of p.history) {
        if (!r.watered || r.t < g.now - 7 * DAY) continue;
        const d = new Date(r.t);
        const dayIdx = (d.getDay() + 6) % 7;
        m[dayIdx][Math.floor(d.getHours() / 4)] += 1;
      }
    }
    return m;
  }, [selected, g.now]);

  /* -------- consumption leaderboard -------- */
  const leaderboard = useMemo(() => {
    return g.plants
      .map((p) => {
        const ml = p.events
          .filter((e) => e.type === 'watered' && e.t > g.now - 7 * DAY)
          .reduce((a, e) => a + (e.ml ?? 0), 0);
        return { p, ml };
      })
      .sort((a, b) => b.ml - a.ml);
  }, [g.plants, g.now]);
  const maxMl = Math.max(1, ...leaderboard.map((x) => x.ml));

  const xLabels = useMemo(() => {
    if (!series.length) return [];
    const fmt = (t: number) =>
      hours <= 24
        ? new Date(t).toLocaleTimeString(undefined, { hour: '2-digit' })
        : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return [fmt(series[0].x), fmt(series[Math.floor(series.length / 2)].x), fmt(series[series.length - 1].x)];
  }, [series, hours]);

  return (
    <Screen>
      <Overline>Insights</Overline>
      <Txt variant="h1" style={{ marginTop: 2 }}>
        Analytics
      </Txt>
      <Muted variant="small" style={{ marginTop: 4 }}>
        {g.plants.length} nodes · {g.plants.reduce((a, p) => a + p.history.length, 0).toLocaleString()} readings buffered
      </Muted>

      {!g.plants.length ? (
        <Card style={{ marginTop: S.lg }}>
          <Muted variant="small" align="center">
            Add a plant to start collecting readings.
          </Muted>
        </Card>
      ) : null}

      <View style={{ marginTop: S.lg }}>
        <Segmented
          options={[
            { key: '24h', label: '24 hours' },
            { key: '7d', label: '7 days' },
            { key: '14d', label: '14 days' },
          ]}
          value={range}
          onChange={setRange}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.md }}>
        <Row gap={S.sm}>
          <Chip label="All plants" active={plantId === 'all'} onPress={() => setPlantId('all')} />
          {g.plants.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              icon={speciesById(p.speciesId).emoji}
              active={plantId === p.id}
              onPress={() => setPlantId(p.id)}
            />
          ))}
        </Row>
      </ScrollView>

      <Card style={{ marginTop: S.md }}>
        <Row between center>
          <View>
            <Overline>{meta.icon} {meta.label}</Overline>
            <Row center gap={5} style={{ marginTop: 4 }}>
              <Text style={[F.metric, { color: metricColor(metric) }]}>
                {metric === 'lux' ? fmtLux(stats.mean) : stats.mean.toFixed(1)}
              </Text>
              <Text style={[F.small, { color: C.textDim, marginBottom: 4 }]}>avg {meta.unit}</Text>
            </Row>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt
              variant="label"
              color={stats.delta >= 0 ? C.leaf : C.warn}>
              {stats.delta >= 0 ? '▲' : '▼'} {Math.abs(stats.delta).toFixed(1)}
            </Txt>
            <Muted variant="small">vs start of range</Muted>
          </View>
        </Row>

        <View style={{ marginTop: S.md }}>
          <LineChart
            data={series}
            width={chartW}
            height={180}
            color={metricColor(metric)}
            band={band}
            xLabels={xLabels}
          />
        </View>

        <Row gap={S.sm} style={{ marginTop: S.md }}>
          <StatTile label="Min" value={metric === 'lux' ? fmtLux(stats.min) : stats.min.toFixed(1)} unit={meta.unit} />
          <StatTile label="Max" value={metric === 'lux' ? fmtLux(stats.max) : stats.max.toFixed(1)} unit={meta.unit} />
          <StatTile
            label="Points"
            value={series.length}
            sub={hours <= 24 ? 'hourly' : hours <= 168 ? '3-hourly' : '6-hourly'}
          />
        </Row>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.md }}>
          <Row gap={S.sm}>
            {METRICS.map((m) => (
              <Chip
                key={m.key}
                label={m.label}
                icon={m.icon}
                color={metricColor(m.key)}
                active={metric === m.key}
                onPress={() => setMetric(m.key)}
              />
            ))}
          </Row>
        </ScrollView>
      </Card>

      <SectionHeader title="Garden heat map" subtitle="One tile per plant, latest reading" />
      <Card>
        <Segmented
          options={[
            { key: 'moisture', label: 'Moisture' },
            { key: 'health', label: 'Health' },
            { key: 'light', label: 'Light' },
            { key: 'temp', label: 'Temp' },
          ]}
          value={heatMode}
          onChange={setHeatMode}
        />
        <View style={{ marginTop: S.md }}>
          <HeatMap cells={heatCells} onPress={(id) => router.push(`/plant/${id}`)} />
        </View>
        <Legend
          items={
            heatMode === 'moisture'
              ? [
                  { color: C.warn, label: 'Below target' },
                  { color: C.water, label: 'In band' },
                  { color: C.violet, label: 'Saturated' },
                ]
              : heatMode === 'health'
                ? [
                    { color: C.leaf, label: 'Thriving' },
                    { color: C.sun, label: 'Watch' },
                    { color: C.danger, label: 'Struggling' },
                  ]
                : [
                    { color: C.textDim, label: 'Low' },
                    { color: heatMode === 'light' ? C.sun : C.warn, label: 'High' },
                  ]
          }
        />
      </Card>

      <SectionHeader title="Water usage" subtitle="Logged waterings, last 7 days" />
      <Card>
        <BarChart
          data={usage.map((u) => u.ml)}
          width={chartW}
          height={140}
          color={C.water}
          labels={usage.map((u) => new Date(u.t).toLocaleDateString(undefined, { weekday: 'narrow' }))}
        />
        <Row gap={S.sm} style={{ marginTop: S.md }}>
          <StatTile
            label="Week total"
            value={(usage.reduce((a, u) => a + u.ml, 0) / 1000).toFixed(1)}
            unit="L"
            color={C.water}
          />
          <StatTile
            label="Daily avg"
            value={Math.round(avg(usage.map((u) => u.ml)))}
            unit="ml"
          />
          <StatTile
            label="Waterings"
            value={g.plants.reduce(
              (a, p) => a + p.events.filter((e) => e.type === 'watered' && e.t > g.now - 7 * DAY).length,
              0,
            )}
          />
        </Row>
      </Card>

      <SectionHeader title="Watering rhythm" subtitle="When you water, by day and 4-hour block" />
      <Card>
        <PatternGrid
          matrix={pattern}
          rowLabels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
          colLabels={['00', '04', '08', '12', '16', '20']}
          color={C.water}
        />
      </Card>

      <SectionHeader title="Thirstiest plants" subtitle="Consumption over the last 7 days" />
      <Card>
        {leaderboard.map(({ p, ml }, i) => (
          <View key={p.id} style={{ marginBottom: i === leaderboard.length - 1 ? 0 : S.md }}>
            <Row between center style={{ marginBottom: 5 }}>
              <Row center gap={6}>
                <Text style={{ fontSize: 13 }}>{speciesById(p.speciesId).emoji}</Text>
                <Txt variant="small">{p.name}</Txt>
              </Row>
              <Muted variant="small">{ml >= 1000 ? `${(ml / 1000).toFixed(1)} L` : `${ml} ml`}</Muted>
            </Row>
            <ProgressBar value={(ml / maxMl) * 100} color={C.water} height={6} />
          </View>
        ))}
      </Card>

      <Spacer h={S.lg} />
    </Screen>
  );
}

function cell(p: Plant, emoji: string, value: number, display: string, color: string): HeatCell {
  return { id: p.id, gx: p.gx, gy: p.gy, label: p.name, emoji, value, display, color };
}

function ramp(norm: number, hot: string): string {
  if (norm < 0.25) return C.textDim;
  if (norm < 0.55) return C.leafDim;
  if (norm < 0.85) return hot;
  return C.danger;
}

