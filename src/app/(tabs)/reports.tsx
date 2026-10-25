import React, { useMemo, useState } from 'react';
import { Alert as RNAlert, Text, View, useWindowDimensions } from 'react-native';

import { C, F, S, scoreColor } from '@/theme/tokens';
import { useGarden } from '@/store/garden';
import { speciesById } from '@/domain/species';
import { weeklyReport } from '@/domain/insights';
import { DAY } from '@/lib/util';
import { BarChart, Ring } from '@/components/charts';
import {
  Badge,
  Btn,
  Card,
  Divider,
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

export default function ReportsScreen() {
  const g = useGarden();
  const { width } = useWindowDimensions();
  const chartW = width - S.lg * 2 - S.lg * 2;
  const [weeksAgo, setWeeksAgo] = useState(0);

  const report = useMemo(() => weeklyReport(g.plants, g.now, weeksAgo), [g.plants, g.now, weeksAgo]);
  const range = `${new Date(report.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(
    report.to,
  ).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  const share = () =>
    RNAlert.alert(
      'Weekly report',
      `${g.settings.householdName} · ${range}\n\n` +
        `Average health ${Math.round(report.avgHealth * 100)}%\n` +
        `${report.cycles} waterings · ${(report.totalMl / 1000).toFixed(1)} L\n\n` +
        report.highlights.join('\n'),
      [{ text: 'Done' }],
    );

  return (
    <Screen>
      <Overline>Digest</Overline>
      <Txt variant="h1" style={{ marginTop: 2 }}>
        Weekly report
      </Txt>
      <Muted variant="small" style={{ marginTop: 4 }}>
        {range} · {g.settings.householdName}
      </Muted>

      <View style={{ marginTop: S.lg }}>
        <Segmented
          options={[
            { key: '0', label: 'This week' },
            { key: '1', label: 'Last week' },
            { key: '2', label: '2 weeks ago' },
          ]}
          value={String(weeksAgo)}
          onChange={(v) => setWeeksAgo(Number(v))}
        />
      </View>

      <Card style={{ marginTop: S.md }}>
        <Row center gap={S.lg}>
          <Ring
            value={report.avgHealth}
            size={96}
            stroke={10}
            color={scoreColor(report.avgHealth)}
            label={`${Math.round(report.avgHealth * 100)}`}
            sublabel="AVG HEALTH"
          />
          <View style={{ flex: 1, gap: S.sm }}>
            <Row between center>
              <Muted variant="small">Week over week</Muted>
              <Txt variant="label" color={report.healthDelta >= 0 ? C.leaf : C.warn}>
                {report.healthDelta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(report.healthDelta * 100))} pts
              </Txt>
            </Row>
            {report.bestPlant ? (
              <Row between center>
                <Muted variant="small">🏆 Best</Muted>
                <Txt variant="small">
                  {report.bestPlant.name} · {Math.round(report.bestPlant.score * 100)}%
                </Txt>
              </Row>
            ) : null}
            {report.worstPlant ? (
              <Row between center>
                <Muted variant="small">🩹 Needs care</Muted>
                <Txt variant="small" color={C.warn}>
                  {report.worstPlant.name} · {Math.round(report.worstPlant.score * 100)}%
                </Txt>
              </Row>
            ) : null}
          </View>
        </Row>
      </Card>

      <Row gap={S.sm} style={{ marginTop: S.md }}>
        <StatTile label="Water used" value={(report.totalMl / 1000).toFixed(1)} unit="L" color={C.water} icon="💧" />
        <StatTile label="Waterings" value={report.cycles} icon="🔁" />
        <StatTile label="Plants" value={g.plants.length} color={C.leaf} icon="🪴" />
      </Row>

      <SectionHeader title="Water per day" subtitle="From logged waterings" />
      <Card>
        <BarChart
          data={report.dailyMl.map((d) => d.ml)}
          width={chartW}
          height={140}
          color={C.water}
          labels={report.dailyMl.map((d) => new Date(d.t).toLocaleDateString(undefined, { weekday: 'narrow' }))}
        />
      </Card>

      <SectionHeader title="Highlights" subtitle="From this week's sensor readings" />
      <Card>
        {report.highlights.map((h, i) => (
          <Row key={i} gap={S.sm} style={{ marginBottom: i === report.highlights.length - 1 ? 0 : S.md }}>
            <Text style={{ fontSize: 13 }}>{['🌱', '💧', '📈', '⚠️'][i % 4]}</Text>
            <Txt variant="small" style={{ flex: 1, lineHeight: 19 }} color={C.textMuted}>
              {h}
            </Txt>
          </Row>
        ))}
      </Card>

      <SectionHeader title="Per plant" />
      <Card>
        <Row between center style={{ paddingBottom: S.sm }}>
          <Overline>Plant</Overline>
          <Row gap={S.lg}>
            <View style={{ width: 52, alignItems: 'flex-end' }}>
              <Overline>Water</Overline>
            </View>
            <View style={{ width: 42, alignItems: 'flex-end' }}>
              <Overline>Health</Overline>
            </View>
          </Row>
        </Row>
        <Divider style={{ marginVertical: 0, marginBottom: S.sm }} />
        {report.perPlant.map((p) => (
          <View key={p.id} style={{ marginBottom: S.md }}>
            <Row between center>
              <Row center gap={6} style={{ flex: 1 }}>
                <Text style={{ fontSize: 14 }}>{p.emoji}</Text>
                <Txt variant="small" numberOfLines={1}>
                  {p.name}
                </Txt>
                {p.trend !== 0 ? (
                  <Text style={[F.tiny, { color: p.trend > 0 ? C.leaf : C.warn }]}>
                    {p.trend > 0 ? '▲' : '▼'}
                  </Text>
                ) : null}
              </Row>
              <Row gap={S.lg} center>
                <View style={{ width: 52, alignItems: 'flex-end' }}>
                  <Txt variant="small" color={C.water}>
                    {p.ml >= 1000 ? `${(p.ml / 1000).toFixed(1)} L` : `${p.ml} ml`}
                  </Txt>
                </View>
                <View style={{ width: 42, alignItems: 'flex-end' }}>
                  <Txt variant="small" color={scoreColor(p.score)}>
                    {Math.round(p.score * 100)}%
                  </Txt>
                </View>
              </Row>
            </Row>
            <View style={{ marginTop: 6 }}>
              <ProgressBar value={p.score * 100} color={scoreColor(p.score)} height={4} />
            </View>
          </View>
        ))}
      </Card>

      <SectionHeader title="Coming up" subtitle="Next 7 days" />
      <Card>
        {g.plants
          .map((p) => {
            const sp = speciesById(p.speciesId);
            const dueIn = sp.fertilizeEveryDays - (g.now - p.lastFertilizedAt) / DAY;
            return { p, sp, dueIn };
          })
          .sort((a, b) => a.dueIn - b.dueIn)
          .slice(0, 5)
          .map(({ p, sp, dueIn }) => (
            <Row key={p.id} between center style={{ paddingVertical: 7 }}>
              <Row center gap={8}>
                <Text style={{ fontSize: 13 }}>🧪</Text>
                <View>
                  <Txt variant="small">Feed {p.name}</Txt>
                  <Muted variant="small">
                    {sp.name} · every {sp.fertilizeEveryDays} days
                  </Muted>
                </View>
              </Row>
              <Badge
                label={dueIn <= 0 ? `${Math.round(-dueIn)}d overdue` : `in ${Math.round(dueIn)}d`}
                color={dueIn <= 0 ? C.warn : C.textMuted}
              />
            </Row>
          ))}
      </Card>

      <Spacer h={S.lg} />
      <Btn label="Share this report" icon="📤" onPress={share} />
      <Spacer h={S.lg} />
    </Screen>
  );
}
