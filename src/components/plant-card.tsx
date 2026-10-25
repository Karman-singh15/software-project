import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { C, F, R, S, scoreColor } from '@/theme/tokens';
import { speciesById } from '@/domain/species';
import type { Plant } from '@/domain/types';
import { fmtHours, healthScore, latest, predictNextWatering, relTime } from '@/domain/insights';
import { Badge, Card, Muted, Overline, ProgressBar, Row, Txt } from './ui';
import { Ring, Sparkline } from './charts';

export function PlantCard({
  plant,
  now,
  onWater,
}: {
  plant: Plant;
  now: number;
  onWater?: () => void;
}) {
  const router = useRouter();
  const species = speciesById(plant.speciesId);
  const health = healthScore(plant, now);
  const pred = predictNextWatering(plant, now);
  const last = latest(plant);
  const soil = last?.soil ?? 0;
  const spark = plant.history.slice(-48).map((r) => r.soil);
  const col = scoreColor(health.score);
  const dry = soil < plant.soilTarget.min;

  return (
    <Card style={{ marginBottom: S.md, padding: S.md }} onPress={() => router.push(`/plant/${plant.id}`)}>
      <Row gap={S.md}>
        <View style={{ alignItems: 'center', width: 60 }}>
          <Ring value={health.score} size={56} stroke={5} color={col} />
          <Text style={{ fontSize: 24, position: 'absolute', top: 15 }}>{species.emoji}</Text>
          <Text style={[F.tiny, { color: col, marginTop: 4 }]}>{Math.round(health.score * 100)}%</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Row between center>
            <View style={{ flex: 1 }}>
              <Txt variant="h3" numberOfLines={1}>
                {plant.name}
              </Txt>
              <Muted variant="small" numberOfLines={1}>
                {species.name} · {plant.zone}
              </Muted>
            </View>
            <Sparkline values={spark} color={dry ? C.warn : C.water} width={54} height={22} />
          </Row>

          <Row center between style={{ marginTop: S.sm, marginBottom: 4 }}>
            <Row center gap={5}>
              <Text style={{ fontSize: 11 }}>💧</Text>
              <Text style={[F.label, { color: dry ? C.warn : C.water }]}>{Math.round(soil)}%</Text>
              <Muted variant="small">
                target {plant.soilTarget.min}–{plant.soilTarget.max}%
              </Muted>
            </Row>
            {plant.online ? (
              <Badge label="live" color={C.leaf} />
            ) : (
              <Badge label="offline" color={C.danger} icon="📡" />
            )}
          </Row>

          <ProgressBar
            value={soil}
            color={dry ? C.warn : C.water}
            bands={{ from: plant.soilTarget.min, to: plant.soilTarget.max, color: C.leaf + '33' }}
          />

          <Row between center style={{ marginTop: S.sm }}>
            <Muted variant="small">
              {pred.hours == null ? 'Learning drying rate' : pred.hours <= 0.25 ? 'Water due now' : `Water in ${fmtHours(pred.hours)}`}
              {' · watered '}
              {plant.lastWateredAt ? relTime(plant.lastWateredAt, now) : 'never'}
            </Muted>
            {onWater ? (
              <Pressable
                onPress={onWater}
                hitSlop={8}
                style={({ pressed }) => ({
                  paddingVertical: 5,
                  paddingHorizontal: 11,
                  borderRadius: R.pill,
                  backgroundColor: C.water + '1F',
                  opacity: pressed ? 0.6 : 1,
                })}>
                <Text style={[F.tiny, { color: C.water }]}>LOG WATER</Text>
              </Pressable>
            ) : null}
          </Row>
        </View>
      </Row>
    </Card>
  );
}

export function PlantRowMini({ plant, now, right }: { plant: Plant; now: number; right?: React.ReactNode }) {
  const router = useRouter();
  const species = speciesById(plant.speciesId);
  const health = healthScore(plant, now);
  return (
    <Pressable
      onPress={() => router.push(`/plant/${plant.id}`)}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Row center gap={S.md} style={{ paddingVertical: S.sm }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: C.surfaceHi,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 17 }}>{species.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="label">{plant.name}</Txt>
          <Overline>{plant.zone}</Overline>
        </View>
        {right ?? (
          <Txt variant="label" color={scoreColor(health.score)}>
            {Math.round(health.score * 100)}
          </Txt>
        )}
      </Row>
    </Pressable>
  );
}
