import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { C, F, R, S } from '@/theme/tokens';
import { Overline, Row, Txt } from './ui';

export type Point = { x: number; y: number; flag?: boolean };

type Extent = { min: number; max: number };

function extent(vals: number[], pad = 0.12): Extent {
  if (!vals.length) return { min: 0, max: 1 };
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max - min < 1e-6) {
    max += 1;
    min -= 1;
  }
  const p = (max - min) * pad;
  return { min: min - p, max: max + p };
}

function buildPath(
  pts: Point[],
  w: number,
  h: number,
  xE: Extent,
  yE: Extent,
  smooth = true,
): { line: string; area: string; xy: (p: Point) => { x: number; y: number } } {
  const sx = (x: number) => ((x - xE.min) / (xE.max - xE.min)) * w;
  const sy = (y: number) => h - ((y - yE.min) / (yE.max - yE.min)) * h;
  const xy = (p: Point) => ({ x: sx(p.x), y: sy(p.y) });

  if (!pts.length) return { line: '', area: '', xy };
  let d = `M ${sx(pts[0].x).toFixed(2)} ${sy(pts[0].y).toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    if (smooth) {
      const cx = (sx(p0.x) + sx(p1.x)) / 2;
      d += ` C ${cx.toFixed(2)} ${sy(p0.y).toFixed(2)} ${cx.toFixed(2)} ${sy(p1.y).toFixed(2)} ${sx(p1.x).toFixed(2)} ${sy(p1.y).toFixed(2)}`;
    } else {
      d += ` L ${sx(p1.x).toFixed(2)} ${sy(p1.y).toFixed(2)}`;
    }
  }
  const area = `${d} L ${sx(pts[pts.length - 1].x).toFixed(2)} ${h} L ${sx(pts[0].x).toFixed(2)} ${h} Z`;
  return { line: d, area, xy };
}

/* ------------------------------------------------------------------ */

export function LineChart({
  data,
  width,
  height = 160,
  color = C.water,
  band,
  yRange,
  projection,
  markers = true,
  xLabels,
  unit,
  gridLines = 4,
}: {
  data: Point[];
  width: number;
  height?: number;
  color?: string;
  /** shaded ideal range */
  band?: { min: number; max: number };
  yRange?: Extent;
  /** dashed forward projection appended after the live data */
  projection?: Point[];
  markers?: boolean;
  xLabels?: string[];
  unit?: string;
  gridLines?: number;
}) {
  const padL = 30;
  const padB = xLabels?.length ? 16 : 4;
  const w = Math.max(width - padL - 6, 20);
  const h = Math.max(height - padB - 6, 20);

  const all = [...data, ...(projection ?? [])];
  const xE = useMemo(() => ({ min: Math.min(...all.map((p) => p.x)), max: Math.max(...all.map((p) => p.x)) }), [all]);
  const yE = useMemo(() => {
    if (yRange) return yRange;
    const vals = all.map((p) => p.y);
    if (band) vals.push(band.min, band.max);
    return extent(vals, 0.16);
  }, [all, band, yRange]);

  if (data.length < 2) return <View style={{ height }} />;

  const main = buildPath(data, w, h, xE, yE);
  const proj = projection?.length ? buildPath([data[data.length - 1], ...projection], w, h, xE, yE) : null;
  const bandTop = band ? ((yE.max - band.max) / (yE.max - yE.min)) * h : 0;
  const bandH = band ? ((band.max - band.min) / (yE.max - yE.min)) * h : 0;
  const last = main.xy(data[data.length - 1]);
  const gid = `g${color.replace('#', '')}`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.34" />
          <Stop offset="1" stopColor={color} stopOpacity="0.02" />
        </LinearGradient>
      </Defs>
      <G x={padL} y={4}>
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = (i / gridLines) * h;
          const val = yE.max - (i / gridLines) * (yE.max - yE.min);
          return (
            <G key={i}>
              <Line x1={0} y1={y} x2={w} y2={y} stroke={C.border} strokeWidth={1} strokeDasharray="3 5" />
              <SvgText x={-6} y={y + 3.5} fill={C.textDim} fontSize={9} textAnchor="end">
                {formatTick(val)}
              </SvgText>
            </G>
          );
        })}

        {band ? (
          <Rect
            x={0}
            y={Math.max(bandTop, 0)}
            width={w}
            height={Math.max(Math.min(bandH, h - Math.max(bandTop, 0)), 0)}
            fill={C.leaf}
            opacity={0.09}
          />
        ) : null}

        <Path d={main.area} fill={`url(#${gid})`} />
        <Path d={main.line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />

        {proj ? (
          <Path d={proj.line} stroke={color} strokeWidth={1.6} strokeDasharray="4 4" opacity={0.62} fill="none" />
        ) : null}

        {markers
          ? data
              .map((p, i) => ({ p, i }))
              .filter((x) => x.p.flag)
              .map(({ p, i }) => {
                const c = main.xy(p);
                return <Circle key={i} cx={c.x} cy={c.y} r={3} fill={C.water} stroke={C.bg} strokeWidth={1.5} />;
              })
          : null}

        <Circle cx={last.x} cy={last.y} r={4.5} fill={color} />
        <Circle cx={last.x} cy={last.y} r={9} fill={color} opacity={0.18} />

        {xLabels?.map((lb, i) => (
          <SvgText
            key={i}
            x={(i / Math.max(xLabels.length - 1, 1)) * w}
            y={h + 12}
            fill={C.textDim}
            fontSize={9}
            textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}>
            {lb}
          </SvgText>
        ))}
      </G>
    </Svg>
  );
}

function formatTick(v: number): string {
  if (Math.abs(v) >= 10000) return `${Math.round(v / 1000)}k`;
  if (Math.abs(v) >= 100) return String(Math.round(v));
  return v.toFixed(Math.abs(v) < 10 ? 1 : 0);
}

/* ------------------------------------------------------------------ */

export function Sparkline({
  values,
  width = 70,
  height = 26,
  color = C.leaf,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return <View style={{ width, height }} />;
  const pts = values.map((y, i) => ({ x: i, y }));
  const yE = extent(values, 0.1);
  const { line } = buildPath(pts, width, height, { min: 0, max: values.length - 1 }, yE);
  return (
    <Svg width={width} height={height}>
      <Path d={line} stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */

export function BarChart({
  data,
  width,
  height = 130,
  color = C.water,
  labels,
  unit = '',
}: {
  data: number[];
  width: number;
  height?: number;
  color?: string;
  labels?: string[];
  unit?: string;
}) {
  const padB = labels ? 18 : 0;
  const h = height - padB;
  const max = Math.max(...data, 1);
  const gap = 6;
  const bw = (width - gap * (data.length - 1)) / Math.max(data.length, 1);
  return (
    <Svg width={width} height={height}>
      {data.map((v, i) => {
        const bh = Math.max((v / max) * (h - 14), 2);
        const x = i * (bw + gap);
        return (
          <G key={i}>
            <Rect x={x} y={h - bh} width={bw} height={bh} rx={4} fill={color} opacity={v === 0 ? 0.18 : 0.85} />
            {v > 0 ? (
              <SvgText x={x + bw / 2} y={h - bh - 4} fill={C.textMuted} fontSize={9} textAnchor="middle">
                {v >= 1000 ? `${(v / 1000).toFixed(1)}L` : `${Math.round(v)}${unit}`}
              </SvgText>
            ) : null}
            {labels ? (
              <SvgText x={x + bw / 2} y={height - 5} fill={C.textDim} fontSize={9} textAnchor="middle">
                {labels[i]}
              </SvgText>
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
}

/* ------------------------------------------------------------------ */

export function Ring({
  value,
  size = 84,
  stroke = 8,
  color = C.leaf,
  label,
  sublabel,
}: {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sublabel?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.surfaceHi} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${circ - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {label ? (
        <View style={{ alignItems: 'center' }}>
          <Text style={[F.h3, { color: C.text }]}>{label}</Text>
          {sublabel ? <Text style={[F.tiny, { color: C.textDim }]}>{sublabel}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

export type HeatCell = {
  id: string;
  gx: number;
  gy: number;
  label: string;
  emoji: string;
  value: number;
  display: string;
  color: string;
};

export function HeatMap({
  cells,
  columns = 4,
  onPress,
}: {
  cells: HeatCell[];
  columns?: number;
  onPress?: (id: string) => void;
}) {
  const rows = Math.max(...cells.map((c) => c.gy), 0) + 1;
  return (
    <View style={{ gap: S.sm }}>
      {Array.from({ length: rows }).map((_, y) => (
        <Row key={y} gap={S.sm}>
          {Array.from({ length: columns }).map((__, x) => {
            const cell = cells.find((c) => c.gx === x && c.gy === y);
            if (!cell) {
              return (
                <View
                  key={x}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: R.md,
                    borderWidth: 1,
                    borderColor: C.border,
                    borderStyle: 'dashed',
                    opacity: 0.4,
                  }}
                />
              );
            }
            return (
              <Pressable
                key={x}
                onPress={() => onPress?.(cell.id)}
                style={({ pressed }) => ({
                  flex: 1,
                  aspectRatio: 1,
                  borderRadius: R.md,
                  backgroundColor: cell.color + '2E',
                  borderWidth: 1,
                  borderColor: cell.color + '99',
                  padding: 6,
                  justifyContent: 'space-between',
                  opacity: pressed ? 0.7 : 1,
                })}>
                <Text style={{ fontSize: 15 }}>{cell.emoji}</Text>
                <View>
                  <Text style={[F.tiny, { color: cell.color }]}>{cell.display}</Text>
                  <Text style={[F.tiny, { color: C.textDim, letterSpacing: 0 }]} numberOfLines={1}>
                    {cell.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </Row>
      ))}
    </View>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <Row gap={S.md} wrap style={{ marginTop: S.sm }}>
      {items.map((it) => (
        <Row key={it.label} center gap={5}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: it.color }} />
          <Txt variant="small" color={C.textDim}>
            {it.label}
          </Txt>
        </Row>
      ))}
    </Row>
  );
}

/** Compact day/hour matrix used for the "when does it drink" pattern view. */
export function PatternGrid({
  matrix,
  color = C.water,
  rowLabels,
  colLabels,
}: {
  matrix: number[][];
  color?: string;
  rowLabels: string[];
  colLabels: string[];
}) {
  const max = Math.max(1, ...matrix.flat());
  return (
    <View>
      <Row gap={3} style={{ marginLeft: 30, marginBottom: 4 }}>
        {colLabels.map((c, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[F.tiny, { color: C.textDim, letterSpacing: 0 }]}>{c}</Text>
          </View>
        ))}
      </Row>
      {matrix.map((row, y) => (
        <Row key={y} gap={3} center style={{ marginBottom: 3 }}>
          <View style={{ width: 27 }}>
            <Text style={[F.tiny, { color: C.textDim, letterSpacing: 0 }]}>{rowLabels[y]}</Text>
          </View>
          {row.map((v, x) => (
            <View
              key={x}
              style={{
                flex: 1,
                height: 18,
                borderRadius: 4,
                backgroundColor: v === 0 ? C.surfaceAlt : color,
                opacity: v === 0 ? 1 : 0.25 + (v / max) * 0.75,
              }}
            />
          ))}
        </Row>
      ))}
    </View>
  );
}
