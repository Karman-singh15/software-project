import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { C, F, S, scoreColor } from '@/theme/tokens';
import { useGarden } from '@/store/garden';
import { avg, buildAlerts, healthScore, latest, predictNextWatering } from '@/domain/insights';
import type { Alert, Plant } from '@/domain/types';
import {
  Badge,
  Btn,
  Card,
  Muted,
  Overline,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  Spacer,
  Txt,
} from '@/components/ui';
import { Ring } from '@/components/charts';
import { PlantCard } from '@/components/plant-card';

export default function GardenScreen() {
  const g = useGarden();
  const router = useRouter();
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const alerts = useMemo(() => buildAlerts(g.plants, g.now), [g.plants, g.now]);
  const gardenHealth = useMemo(() => {
    const measured = g.plants.filter((p) => latest(p));
    return measured.length ? avg(measured.map((p) => healthScore(p, g.now).score)) : 0;
  }, [g.plants, g.now]);

  const sorted = useMemo(() => {
    const due = (p: Plant) => predictNextWatering(p, g.now).hours ?? Infinity;
    return [...g.plants].sort((a, b) => due(a) - due(b));
  }, [g.plants, g.now]);

  // Lowest reservoir across the ESP32s that have reported.
  const tanks = g.plants.map((p) => latest(p)?.tank).filter((v): v is number => v != null);
  const tank = tanks.length ? Math.min(...tanks) : null;
  const midnight = new Date(g.now).setHours(0, 0, 0, 0);
  const mlToday = g.plants
    .flatMap((p) => p.events)
    .filter((e) => e.type === 'watered' && e.t >= midnight)
    .reduce((a, e) => a + (e.ml ?? 0), 0);
  const shown = showAllAlerts ? alerts : alerts.slice(0, 2);
  const hour = new Date(g.now).getHours();
  const greeting = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (!g.ready) {
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 40 }}>🌱</Text>
          <Muted style={{ marginTop: S.sm }}>Loading your garden…</Muted>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Row between center>
        <View>
          <Overline>{g.settings.householdName}</Overline>
          <Txt variant="h1" style={{ marginTop: 2 }}>
            {greeting}
          </Txt>
          <Muted variant="small" style={{ marginTop: 2 }}>
            {new Date(g.now).toLocaleString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Muted>
        </View>
        <Pressable
          onPress={() => router.push('/onboarding')}
          style={({ pressed }) => ({
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: C.leaf,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}>
          <Text style={{ fontSize: 24, color: '#04140C', marginTop: -2 }}>+</Text>
        </Pressable>
      </Row>

      {/* Overview */}
      {g.plants.length ? (
        <Card style={{ marginTop: S.lg }}>
          <Row center gap={S.lg}>
            <View style={{ alignItems: 'center' }}>
              <Ring
                value={gardenHealth}
                size={88}
                stroke={9}
                color={scoreColor(gardenHealth)}
                label={`${Math.round(gardenHealth * 100)}`}
                sublabel="HEALTH"
              />
            </View>
            <View style={{ flex: 1, gap: S.sm }}>
              <MiniStat
                label="Sensors live"
                value={`${g.plants.filter((p) => p.online).length}/${g.plants.length}`}
                icon="📡"
                color={g.plants.every((p) => p.online) ? C.text : C.danger}
              />
              <MiniStat label="Watered today" value={`${(mlToday / 1000).toFixed(2)} L`} icon="💧" />
              <MiniStat
                label="Reservoir"
                value={tank == null ? '—' : `${Math.round(tank)}%`}
                icon="🪣"
                color={tank != null && tank < 18 ? C.warn : C.text}
              />
            </View>
          </Row>
          {tank != null ? (
            <View style={{ marginTop: S.md }}>
              <ProgressBar value={tank} color={tank < 18 ? C.warn : C.water} height={6} />
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* Alerts */}
      {alerts.length ? (
        <>
          <SectionHeader
            title={`Alerts (${alerts.length})`}
            action={alerts.length > 2 ? (showAllAlerts ? 'Show less' : 'Show all') : undefined}
            onAction={() => setShowAllAlerts((v) => !v)}
          />
          {shown.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              onPress={
                a.plantId ? () => router.push(`/plant/${a.plantId}`) : () => router.push('/system')
              }
            />
          ))}
        </>
      ) : g.plants.length ? (
        <Card tone={C.leaf} style={{ marginTop: S.lg, padding: S.md }}>
          <Row center gap={S.sm}>
            <Text style={{ fontSize: 18 }}>✅</Text>
            <Txt variant="label" color={C.leaf}>
              Everything in range across {g.plants.length} plant{g.plants.length > 1 ? 's' : ''}
            </Txt>
          </Row>
        </Card>
      ) : null}

      <SectionHeader title="Your plants" subtitle="Sorted by who needs water first" />
      {g.plants.length === 0 ? (
        <Card>
          <View style={{ alignItems: 'center', gap: S.sm, paddingVertical: S.lg }}>
            <Text style={{ fontSize: 36 }}>🪴</Text>
            <Txt variant="h3">No plants yet</Txt>
            <Muted variant="small" align="center">
              Add your first plant and connect it to your ESP32 sensor node.
            </Muted>
            <Btn label="Add a plant" icon="＋" onPress={() => router.push('/onboarding')} small />
          </View>
        </Card>
      ) : (
        sorted.map((p) => (
          <PlantCard
            key={p.id}
            plant={p}
            now={g.now}
            onWater={() => g.logWatering(p.id)}
          />
        ))
      )}

      <Spacer h={S.md} />
      {g.plants.length ? (
        <Btn label="Add another plant" icon="＋" kind="ghost" onPress={() => router.push('/onboarding')} />
      ) : null}
    </Screen>
  );
}

function MiniStat({
  label,
  value,
  icon,
  color = C.text,
  sub,
}: {
  label: string;
  value: string;
  icon: string;
  color?: string;
  sub?: string;
}) {
  return (
    <Row between center>
      <Row center gap={6}>
        <Text style={{ fontSize: 12 }}>{icon}</Text>
        <Muted variant="small">{label}</Muted>
      </Row>
      <Row center gap={6}>
        {sub ? <Text style={[F.tiny, { color: C.textDim }]}>{sub}</Text> : null}
        <Txt variant="label" color={color}>
          {value}
        </Txt>
      </Row>
    </Row>
  );
}

export function AlertCard({ alert, onPress }: { alert: Alert; onPress?: () => void }) {
  const tone = alert.level === 'critical' ? C.danger : alert.level === 'warning' ? C.warn : C.water;
  return (
    <Card tone={tone} style={{ marginBottom: S.sm, padding: S.md }} onPress={onPress}>
      <Row gap={S.sm}>
        <Text style={{ fontSize: 18 }}>{alert.icon}</Text>
        <View style={{ flex: 1 }}>
          <Row between center>
            <Txt variant="label" color={tone} style={{ flex: 1 }} numberOfLines={1}>
              {alert.title}
            </Txt>
            <Badge label={alert.level} color={tone} />
          </Row>
          <Muted variant="small" style={{ marginTop: 3, lineHeight: 17 }}>
            {alert.detail}
          </Muted>
        </View>
      </Row>
    </Card>
  );
}
