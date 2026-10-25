import React, { useState } from 'react';
import { Alert as RNAlert, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F, R, S, metricColor, scoreColor } from '@/theme/tokens';
import { speciesById } from '@/domain/species';
import { nodeUrl, useGarden } from '@/store/garden';
import type { MetricKind, Reading } from '@/domain/types';
import { LUX_RANGE, avg, fmtHours, fmtLux, healthScore, latest, predictNextWatering, relTime, tempRange } from '@/domain/insights';
import { DAY, HOUR } from '@/lib/util';
import { LineChart, Ring, type Point } from '@/components/charts';
import {
  Badge,
  Btn,
  Card,
  Chip,
  Divider,
  KeyValue,
  Muted,
  Overline,
  ProgressBar,
  Row,
  SectionHeader,
  Segmented,
  Spacer,
  StatTile,
  Txt,
} from '@/components/ui';

type Tab = 'live' | 'trends' | 'photos' | 'care';

export default function PlantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const g = useGarden();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const chartW = width - S.lg * 2 - S.lg * 2;

  const [tab, setTab] = useState<Tab>('live');
  const plant = g.plants.find((p) => p.id === id);

  if (!plant) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 34 }}>🥀</Text>
        <Txt variant="h3" style={{ marginTop: S.sm }}>
          Plant not found
        </Txt>
        <Btn label="Back to garden" kind="ghost" small style={{ marginTop: S.md }} onPress={() => router.replace('/')} />
      </View>
    );
  }

  const species = speciesById(plant.speciesId);
  const health = healthScore(plant, g.now);
  const col = scoreColor(health.score);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top + S.sm, paddingHorizontal: S.lg, paddingBottom: S.sm }}>
        <Row between center>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Txt variant="label" color={C.textMuted}>
              ← Garden
            </Txt>
          </Pressable>
          {plant.online ? (
            <Badge label={`live · ${plant.address}`} color={C.leaf} />
          ) : (
            <Badge label={`offline · ${plant.address}`} color={C.danger} />
          )}
        </Row>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}>
        {/* hero */}
        <Row center gap={S.lg} style={{ marginTop: S.sm }}>
          <View style={{ alignItems: 'center' }}>
            <Ring value={health.score} size={92} stroke={8} color={col} />
            <Text style={{ fontSize: 36, position: 'absolute', top: 26 }}>{species.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="h1">{plant.name}</Txt>
            <Muted variant="small" style={{ fontStyle: 'italic' }}>
              {species.latin}
            </Muted>
            <Row center gap={6} style={{ marginTop: S.sm }}>
              <Badge label={`grade ${health.grade}`} color={col} />
              <Muted variant="small">
                {plant.zone} · {plant.potLitres} L
              </Muted>
            </Row>
          </View>
        </Row>

        <Card
          style={{ marginTop: S.md, padding: S.md }}
          tone={health.headline.startsWith('Thriving') ? C.leaf : C.warn}>
          <Row center gap={S.sm}>
            <Text style={{ fontSize: 15 }}>{health.headline.startsWith('Thriving') ? '✅' : '💡'}</Text>
            <Txt variant="small" style={{ flex: 1, lineHeight: 18 }} color={C.textMuted}>
              {health.headline}
            </Txt>
          </Row>
        </Card>

        <View style={{ marginTop: S.md }}>
          <Segmented
            options={[
              { key: 'live', label: 'Live' },
              { key: 'trends', label: 'Trends' },
              { key: 'photos', label: 'Photos' },
              { key: 'care', label: 'Care' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>

        {tab === 'live' ? <LiveTab plantId={plant.id} chartW={chartW} /> : null}
        {tab === 'trends' ? <TrendsTab plantId={plant.id} chartW={chartW} /> : null}
        {tab === 'photos' ? <PhotosTab plantId={plant.id} /> : null}
        {tab === 'care' ? <CareTab plantId={plant.id} /> : null}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Live
 * ------------------------------------------------------------------ */

function LiveTab({ plantId, chartW }: { plantId: string; chartW: number }) {
  const g = useGarden();
  const plant = g.plants.find((p) => p.id === plantId)!;
  const species = speciesById(plant.speciesId);
  const last = latest(plant);
  const pred = predictNextWatering(plant, g.now);

  const soilData: Point[] = plant.history
    .filter((r) => r.t > g.now - DAY)
    .map((r) => ({ x: r.t, y: r.soil, flag: r.watered }));

  return (
    <View>
      <Muted variant="small" style={{ marginTop: S.md }}>
        {last
          ? plant.online
            ? `Live from ${plant.address} · updated ${relTime(last.t, g.now)}`
            : `⚠️ Last reading ${relTime(last.t, g.now)} — ${plant.address} isn't responding`
          : `Waiting for ${plant.address}…`}
      </Muted>
      <Row gap={S.sm} style={{ marginTop: S.sm }}>
        <StatTile
          label="Soil"
          value={last ? Math.round(last.soil) : '—'}
          unit="%"
          icon="💧"
          color={metricColor('soil')}
          sub={`target ${plant.soilTarget.min}–${plant.soilTarget.max}`}
        />
        <StatTile
          label="Temp"
          value={last ? last.temp.toFixed(1) : '—'}
          unit="°C"
          icon="🌡️"
          color={metricColor('temp')}
          sub={`ok ${tempRange(species.id).min}–${tempRange(species.id).max}`}
        />
      </Row>
      <Row gap={S.sm} style={{ marginTop: S.sm }}>
        <StatTile
          label="Light"
          value={fmtLux(last?.lux ?? null)}
          unit={last?.lux == null ? undefined : 'lux'}
          icon="☀️"
          color={metricColor('lux')}
          sub={last && last.lux == null ? 'sensor not answering' : `ok ${fmtLux(LUX_RANGE.min)}–${fmtLux(LUX_RANGE.max)}`}
        />
        <StatTile
          label="Tank"
          value={last ? Math.round(last.tank) : '—'}
          unit="%"
          icon="🪣"
          color={last && last.tank < 18 ? C.warn : metricColor('tank')}
          sub="reservoir level"
        />
      </Row>

      <SectionHeader title="Soil moisture" subtitle="Last 24 hours · dots are logged waterings" />
      <Card>
        {soilData.length > 1 ? (
          <LineChart
            data={soilData}
            width={chartW}
            height={190}
            color={C.water}
            band={plant.soilTarget}
            xLabels={[new Date(soilData[0].x).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }), '', 'now']}
          />
        ) : (
          <Muted variant="small" align="center">
            The chart appears after a few minutes of readings.
          </Muted>
        )}
      </Card>

      <SectionHeader title="Next watering" subtitle="Linear fit on the current drying trend" />
      <Card>
        <Row between center>
          <View style={{ flex: 1 }}>
            <Txt variant="h1" color={pred.hours != null && pred.hours <= 0.25 ? C.warn : C.leaf}>
              {pred.hours == null ? 'Learning…' : pred.hours <= 0.25 ? 'Due now' : fmtHours(pred.hours)}
            </Txt>
            <Muted variant="small">
              {pred.at && pred.hours
                ? new Date(pred.at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
                : pred.note}
            </Muted>
          </View>
          {pred.hours != null && pred.hours > 0 ? (
            <Ring
              value={pred.confidence}
              size={72}
              stroke={7}
              color={C.violet}
              label={`${Math.round(pred.confidence * 100)}%`}
              sublabel="FIT"
            />
          ) : null}
        </Row>
        {pred.ratePerDay > 0 ? (
          <>
            <Divider />
            <KeyValue k="Drying rate" v={`${pred.ratePerDay}% per day`} />
            <Muted variant="small" style={{ marginTop: S.sm }}>
              {pred.note}
            </Muted>
          </>
        ) : null}
      </Card>

      <Row gap={S.sm} style={{ marginTop: S.lg }}>
        <Btn label="I watered it" icon="💧" onPress={() => g.logWatering(plant.id)} style={{ flex: 1 }} />
        <Btn label="I fed it" icon="🧪" kind="soft" onPress={() => g.fertilize(plant.id)} style={{ flex: 1 }} />
      </Row>

      <SectionHeader title="Activity" subtitle="Newest first" />
      <Card>
        {plant.events.slice(0, 12).map((e) => (
          <Row key={e.id} gap={S.sm} style={{ paddingVertical: 7 }}>
            <Text style={{ fontSize: 13, width: 18 }}>{EVENT_ICON[e.type] ?? '•'}</Text>
            <View style={{ flex: 1 }}>
              <Txt variant="small" numberOfLines={2}>
                {e.note}
              </Txt>
              <Muted variant="small" style={{ marginTop: 1 }}>
                {relTime(e.t, g.now)}
                {e.by ? ` · ${e.by}` : ''}
              </Muted>
            </View>
          </Row>
        ))}
        {!plant.events.length ? <Muted variant="small">No events recorded yet.</Muted> : null}
      </Card>
      <Spacer h={S.lg} />
    </View>
  );
}

const EVENT_ICON: Record<string, string> = {
  watered: '💧',
  fertilized: '🧪',
  sensor_offline: '📡',
  sensor_online: '✅',
  photo: '📷',
  added: '🌱',
  threshold_change: '🎚️',
};

/* ------------------------------------------------------------------ *
 * Trends
 * ------------------------------------------------------------------ */

function TrendsTab({ plantId, chartW }: { plantId: string; chartW: number }) {
  const g = useGarden();
  const plant = g.plants.find((p) => p.id === plantId)!;
  const species = speciesById(plant.speciesId);
  const [metric, setMetric] = useState<MetricKind>('soil');
  const [days, setDays] = useState(1);

  const hist = plant.history.filter((r) => r.t > g.now - days * DAY);
  const data: Point[] = hist
    .filter((r) => r[metric] != null)
    .map((r: Reading) => ({ x: r.t, y: r[metric] as number, flag: metric === 'soil' && r.watered }));
  const vals = data.map((d) => d.y);
  const band =
    metric === 'soil' ? plant.soilTarget : metric === 'temp' ? tempRange(species.id) : metric === 'lux' ? LUX_RANGE : undefined;

  const waterings = plant.events.filter((e) => e.type === 'watered' && e.t > g.now - days * DAY);
  const intervals: number[] = [];
  for (let i = 1; i < waterings.length; i++) intervals.push((waterings[i - 1].t - waterings[i].t) / HOUR);
  const inBand = hist.filter((r) => r.soil >= plant.soilTarget.min && r.soil <= plant.soilTarget.max).length;
  const health = healthScore(plant, g.now);

  const bars: { label: string; value: number }[] = [
    { label: 'Moisture', value: health.soil },
    { label: 'Stability', value: health.stability },
    { label: 'Temperature', value: health.temp },
    ...(health.lux == null ? [] : [{ label: 'Light', value: health.lux }]),
    { label: 'Feeding', value: health.care },
  ];

  return (
    <View>
      <Row gap={S.sm} style={{ marginTop: S.md }} wrap>
        {(['soil', 'temp', 'lux', 'tank'] as MetricKind[]).map((m) => (
          <Chip key={m} label={LABELS[m]} active={metric === m} color={metricColor(m)} onPress={() => setMetric(m)} />
        ))}
      </Row>
      <View style={{ marginTop: S.md }}>
        <Segmented
          options={[
            { key: '1', label: '24 h' },
            { key: '3', label: '3 days' },
            { key: '7', label: '7 days' },
            { key: '14', label: '14 days' },
          ]}
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
        />
      </View>

      <Card style={{ marginTop: S.md }}>
        {data.length > 1 ? (
          <>
            <LineChart
              data={data}
              width={chartW}
              height={190}
              color={metricColor(metric)}
              band={band}
              xLabels={[relTime(data[0].x, g.now), '', 'now']}
            />
            <Row gap={S.sm} style={{ marginTop: S.md }}>
              <StatTile label="Min" value={fmtVal(Math.min(...vals), metric)} />
              <StatTile label="Avg" value={fmtVal(avg(vals), metric)} color={metricColor(metric)} />
              <StatTile label="Max" value={fmtVal(Math.max(...vals), metric)} />
            </Row>
          </>
        ) : (
          <Muted variant="small" align="center">
            {metric === 'lux' && hist.length ? 'No light readings — the light sensor isn’t answering.' : 'Not enough readings in this range yet.'}
          </Muted>
        )}
      </Card>

      <SectionHeader title="Watering" subtitle="From the waterings you log" />
      <Card>
        <Row gap={S.sm}>
          <StatTile label="Logged" value={waterings.length} sub={`last ${days}d`} icon="🔁" />
          <StatTile label="Avg gap" value={intervals.length ? fmtHours(avg(intervals)) : '—'} icon="⏳" />
          <StatTile label="In band" value={hist.length ? Math.round((inBand / hist.length) * 100) : 0} unit="%" icon="🎯" />
        </Row>
        <Divider />
        <KeyValue k="Per watering" v={`${Math.round(species.waterMlPerL * plant.potLitres)} ml`} />
        <KeyValue k="Water used" v={`${(waterings.reduce((a, e) => a + (e.ml ?? 0), 0) / 1000).toFixed(2)} L`} />
      </Card>

      <SectionHeader title="Health breakdown" subtitle="Weighted inputs to the score" />
      <Card>
        {bars.map((b) => (
          <View key={b.label} style={{ marginBottom: S.md }}>
            <Row between center style={{ marginBottom: 5 }}>
              <Muted variant="small">{b.label}</Muted>
              <Txt variant="small" color={scoreColor(b.value)}>
                {Math.round(b.value * 100)}%
              </Txt>
            </Row>
            <ProgressBar value={b.value * 100} color={scoreColor(b.value)} height={6} />
          </View>
        ))}
      </Card>
      <Spacer h={S.lg} />
    </View>
  );
}

const LABELS: Record<MetricKind, string> = {
  soil: '💧 Soil',
  temp: '🌡️ Temp',
  lux: '☀️ Light',
  tank: '🪣 Tank',
};

function fmtVal(v: number, m: MetricKind): string {
  if (!isFinite(v)) return '—';
  return m === 'lux' ? fmtLux(v) : v.toFixed(1);
}

/* ------------------------------------------------------------------ *
 * Photos
 * ------------------------------------------------------------------ */

function PhotosTab({ plantId }: { plantId: string }) {
  const g = useGarden();
  const plant = g.plants.find((p) => p.id === plantId)!;

  const pick = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      RNAlert.alert('Permission needed', `Allow ${fromCamera ? 'camera' : 'photo library'} access to add a growth photo.`);
      return;
    }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ['images'] });
    if (!res.canceled && res.assets[0]) g.addPhoto(plant.id, res.assets[0].uri);
  };

  return (
    <View>
      <SectionHeader title="Growth photos" subtitle={`${plant.photos.length} so far`} />
      {plant.photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Row gap={S.sm}>
            {plant.photos.map((ph) => (
              <View
                key={ph.id}
                style={{
                  width: 128,
                  height: 160,
                  borderRadius: R.md,
                  overflow: 'hidden',
                  backgroundColor: C.surfaceAlt,
                  borderWidth: 1,
                  borderColor: C.border,
                }}>
                <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 6, backgroundColor: '#000000AA' }}>
                  <Text style={[F.tiny, { color: C.text, letterSpacing: 0 }]}>
                    {new Date(ph.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              </View>
            ))}
          </Row>
        </ScrollView>
      ) : (
        <Card>
          <Muted variant="small" align="center">
            No photos yet. Add one every week or two to see it grow.
          </Muted>
        </Card>
      )}
      <Row gap={S.sm} style={{ marginTop: S.md }}>
        <Btn label="Take photo" icon="📸" onPress={() => pick(true)} style={{ flex: 1 }} />
        <Btn label="Choose" icon="🖼️" kind="soft" onPress={() => pick(false)} style={{ flex: 1 }} />
      </Row>
      <Spacer h={S.lg} />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Care
 * ------------------------------------------------------------------ */

function CareTab({ plantId }: { plantId: string }) {
  const g = useGarden();
  const router = useRouter();
  const plant = g.plants.find((p) => p.id === plantId)!;
  const species = speciesById(plant.speciesId);
  const [name, setName] = useState(plant.name);
  const [address, setAddress] = useState(plant.address);
  const dose = Math.round(species.waterMlPerL * plant.potLitres);
  const feedDays = Math.round((g.now - plant.lastFertilizedAt) / DAY);

  const remove = () =>
    RNAlert.alert('Remove plant?', `${plant.name} and all of its readings will be deleted from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          g.removePlant(plant.id);
          router.replace('/');
        },
      },
    ]);

  return (
    <View>
      <SectionHeader title="Watering" />
      <Card>
        <Overline>Target moisture band</Overline>
        <Row between center style={{ marginTop: S.sm }}>
          <Txt variant="h2" color={C.water}>
            {plant.soilTarget.min}–{plant.soilTarget.max}%
          </Txt>
          <Muted variant="small">species default {species.soil.min}–{species.soil.max}%</Muted>
        </Row>
        <View style={{ marginTop: S.md }}>
          <ProgressBar
            value={latest(plant)?.soil ?? 0}
            color={C.water}
            bands={{ from: plant.soilTarget.min, to: plant.soilTarget.max, color: C.leaf + '3A' }}
            height={10}
          />
        </View>
        <Row between center style={{ marginTop: S.md }}>
          <Muted variant="small">Lower bound (dry alert)</Muted>
          <Row gap={S.sm}>
            <Btn
              label="−"
              small
              kind="soft"
              onPress={() => g.setSoilTarget(plant.id, Math.max(5, plant.soilTarget.min - 2), plant.soilTarget.max)}
            />
            <Btn
              label="+"
              small
              kind="soft"
              onPress={() =>
                g.setSoilTarget(plant.id, Math.min(plant.soilTarget.max - 5, plant.soilTarget.min + 2), plant.soilTarget.max)
              }
            />
          </Row>
        </Row>
        <Row between center style={{ marginTop: S.sm }}>
          <Muted variant="small">Upper bound</Muted>
          <Row gap={S.sm}>
            <Btn
              label="−"
              small
              kind="soft"
              onPress={() =>
                g.setSoilTarget(plant.id, plant.soilTarget.min, Math.max(plant.soilTarget.min + 5, plant.soilTarget.max - 2))
              }
            />
            <Btn
              label="+"
              small
              kind="soft"
              onPress={() => g.setSoilTarget(plant.id, plant.soilTarget.min, Math.min(92, plant.soilTarget.max + 2))}
            />
          </Row>
        </Row>
        <Row gap={S.sm} style={{ marginTop: S.lg }}>
          <Btn label={`Log ${dose} ml`} icon="💧" onPress={() => g.logWatering(plant.id)} style={{ flex: 1 }} />
          <Btn label="Log half" kind="soft" onPress={() => g.logWatering(plant.id, Math.round(dose / 2))} style={{ flex: 1 }} />
        </Row>
      </Card>

      <SectionHeader title="Fertiliser" />
      <Card>
        <Row between center>
          <View style={{ flex: 1 }}>
            <Txt variant="label">
              {feedDays >= species.fertilizeEveryDays ? 'Feeding is due' : `Next feed in ${species.fertilizeEveryDays - feedDays} days`}
            </Txt>
            <Muted variant="small">
              Last fed {feedDays} days ago · every {species.fertilizeEveryDays} days
            </Muted>
          </View>
          <Btn label="Log feed" icon="🧪" small kind="soft" onPress={() => g.fertilize(plant.id)} />
        </Row>
        <View style={{ marginTop: S.md }}>
          <ProgressBar
            value={Math.min((feedDays / species.fertilizeEveryDays) * 100, 100)}
            color={feedDays >= species.fertilizeEveryDays ? C.warn : C.leaf}
            height={6}
          />
        </View>
      </Card>

      <SectionHeader title="Sensor node" />
      <Card>
        <Overline>ESP32 address</Overline>
        <TextInput
          value={address}
          onChangeText={setAddress}
          onEndEditing={() => address.trim() && g.setAddress(plant.id, address)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{ ...F.h3, color: C.text, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: S.sm, marginTop: 4 }}
        />
        <Divider />
        <KeyValue k="Status" v={plant.online ? 'Live' : 'Not responding'} color={plant.online ? C.leaf : C.danger} />
        <KeyValue k="Last reading" v={plant.lastSeen ? relTime(plant.lastSeen, g.now) : 'never'} />
        <KeyValue k="URL" v={nodeUrl(plant.address)} />
        <KeyValue k="Points stored" v={String(plant.history.length)} />
      </Card>

      <SectionHeader title="Identity" />
      <Card>
        <Overline>Name</Overline>
        <TextInput
          value={name}
          onChangeText={setName}
          onEndEditing={() => g.renamePlant(plant.id, name.trim() || plant.name)}
          style={{ ...F.h3, color: C.text, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: S.sm, marginTop: 4 }}
        />
        <Divider />
        <KeyValue k="Species" v={`${species.name} (${species.latin})`} />
        <KeyValue k="Zone" v={plant.zone} />
        <KeyValue k="Pot volume" v={`${plant.potLitres} L`} />
        <KeyValue k="Added" v={new Date(plant.addedAt).toLocaleDateString()} />
      </Card>

      <SectionHeader title="Species profile" />
      <Card>
        <Muted variant="small" style={{ lineHeight: 19 }}>
          {species.blurb}
        </Muted>
        <Divider />
        <KeyValue k="Light preference" v={species.light} />
        <KeyValue k="Difficulty" v={species.difficulty} />
        <KeyValue k="Temp limit" v={`${tempRange(species.id).min}–${tempRange(species.id).max} °C`} />
        <KeyValue k="Light range" v={`${fmtLux(LUX_RANGE.min)}–${fmtLux(LUX_RANGE.max)} lux`} />
        {species.toxicToPets ? <KeyValue k="Pets" v="⚠️ Toxic if chewed" color={C.warn} /> : null}
      </Card>

      <Spacer h={S.lg} />
      <Btn label="Remove plant" kind="danger" onPress={remove} />
      <Spacer h={S.lg} />
    </View>
  );
}
