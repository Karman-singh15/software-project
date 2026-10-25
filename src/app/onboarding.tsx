import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F, R, S } from '@/theme/tokens';
import { SPECIES, ZONES, speciesById } from '@/domain/species';
import { LUX_RANGE, fmtLux, tempRange } from '@/domain/insights';
import type { Reading } from '@/domain/types';
import { fetchReading, nodeUrl, useGarden } from '@/store/garden';
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
  Spacer,
  StatTile,
  Txt,
} from '@/components/ui';

const STEPS = ['Species', 'Details', 'Connect ESP32', 'Care plan'];

export default function Onboarding() {
  const g = useGarden();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [zone, setZone] = useState<string>(ZONES[0]);
  const [potLitres, setPotLitres] = useState(6);
  // Default to the address another plant already uses, since one ESP32 can serve several plants.
  const [address, setAddress] = useState(g.plants[g.plants.length - 1]?.address ?? '');
  const [conn, setConn] = useState<{ state: 'idle' | 'testing' | 'ok' | 'error'; reading?: Reading; error?: string }>({
    state: 'idle',
  });

  const species = speciesId ? speciesById(speciesId) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SPECIES;
    return SPECIES.filter(
      (s) => s.name.toLowerCase().includes(q) || s.latin.toLowerCase().includes(q) || s.light.includes(q),
    );
  }, [query]);

  const connect = async () => {
    setConn({ state: 'testing' });
    try {
      setConn({ state: 'ok', reading: await fetchReading(address, 4000) });
    } catch (e) {
      setConn({ state: 'error', error: (e as Error).message });
    }
  };

  const canNext =
    step === 0 ? !!speciesId : step === 1 ? name.trim().length > 0 : step === 2 ? conn.state === 'ok' : true;

  const finish = () => {
    if (!species || !conn.reading) return;
    const id = g.addPlant({
      name: name.trim() || species.name,
      speciesId: species.id,
      zone,
      potLitres,
      address,
      first: conn.reading,
    });
    router.replace(`/plant/${id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + S.sm }}>
      <Row between center style={{ paddingHorizontal: S.lg }}>
        <Pressable onPress={() => (step === 0 ? router.back() : setStep((s) => s - 1))} hitSlop={10}>
          <Txt variant="label" color={C.textMuted}>
            {step === 0 ? 'Cancel' : '← Back'}
          </Txt>
        </Pressable>
        <Overline>
          Step {step + 1} of {STEPS.length}
        </Overline>
        <View style={{ width: 52 }} />
      </Row>

      <View style={{ paddingHorizontal: S.lg, marginTop: S.md }}>
        <Row gap={5}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                backgroundColor: i <= step ? C.leaf : C.surfaceHi,
              }}
            />
          ))}
        </Row>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: S.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <>
            <Txt variant="h1">What are you growing?</Txt>
            <Muted variant="small" style={{ marginTop: 6 }}>
              The species sets the moisture band, light target and feeding interval used by every automation.
            </Muted>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search 14 species…"
              placeholderTextColor={C.textDim}
              style={inputStyle}
            />
            <Spacer h={S.md} />
            {filtered.map((s) => {
              const active = speciesId === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    setSpeciesId(s.id);
                    if (!name) setName(s.name);
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: active ? C.leaf + '14' : C.surface,
                    borderColor: active ? C.leaf : C.border,
                    borderWidth: 1,
                    borderRadius: R.lg,
                    padding: S.md,
                    marginBottom: S.sm,
                    opacity: pressed ? 0.7 : 1,
                  })}>
                  <Row center gap={S.md}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        backgroundColor: C.surfaceHi,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Text style={{ fontSize: 21 }}>{s.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Row center gap={6}>
                        <Txt variant="label">{s.name}</Txt>
                        {active ? <Badge label="selected" color={C.leaf} /> : null}
                      </Row>
                      <Muted variant="small" style={{ fontStyle: 'italic' }}>
                        {s.latin}
                      </Muted>
                      <Row gap={S.sm} style={{ marginTop: 5 }} wrap>
                        <Tag text={`${s.soil.min}–${s.soil.max}% soil`} color={C.water} />
                        <Tag text={`${s.light} light`} color={C.sun} />
                        <Tag text={s.difficulty} color={s.difficulty === 'fussy' ? C.warn : C.leaf} />
                      </Row>
                    </View>
                  </Row>
                  {active ? (
                    <Muted variant="small" style={{ marginTop: S.sm, lineHeight: 18 }}>
                      {s.blurb}
                    </Muted>
                  ) : null}
                </Pressable>
              );
            })}
          </>
        ) : null}

        {step === 1 && species ? (
          <>
            <Txt variant="h1">Give it a name</Txt>
            <Muted variant="small" style={{ marginTop: 6 }}>
              Naming makes alerts readable — “Pesto is dry” beats “node 4 below threshold”.
            </Muted>

            <Spacer h={S.lg} />
            <Overline>Plant name</Overline>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={species.name}
              placeholderTextColor={C.textDim}
              style={inputStyle}
            />

            <SectionHeader title="Where does it live?" />
            <Row gap={S.sm} wrap>
              {[...ZONES, 'Bathroom'].map((z) => (
                <Chip key={z} label={z} active={zone === z} onPress={() => setZone(z)} />
              ))}
            </Row>

            <SectionHeader title="Pot size" subtitle="Sets how much water to give per watering" />
            <Card>
              <Row between center>
                <Txt variant="h2">{potLitres} L</Txt>
                <Row gap={S.sm}>
                  <Btn label="−" small kind="soft" onPress={() => setPotLitres((v) => Math.max(0.5, +(v - 0.5).toFixed(1)))} />
                  <Btn label="+" small kind="soft" onPress={() => setPotLitres((v) => Math.min(40, +(v + 0.5).toFixed(1)))} />
                </Row>
              </Row>
              <View style={{ marginTop: S.md }}>
                <ProgressBar value={(potLitres / 40) * 100} color={C.soil} height={6} />
              </View>
              <Row gap={S.sm} style={{ marginTop: S.md }} wrap>
                {[1, 2.5, 6, 12, 18, 25].map((v) => (
                  <Chip key={v} label={`${v} L`} active={potLitres === v} onPress={() => setPotLitres(v)} color={C.soil} />
                ))}
              </Row>
            </Card>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Txt variant="h1">Connect the ESP32</Txt>
            <Muted variant="small" style={{ marginTop: 6, lineHeight: 18 }}>
              Power the sensor node and open the Arduino serial monitor (115200 baud). It prints “app address:
              http://…” once it joins Wi-Fi. Type that address here. Your phone must be on the same Wi-Fi.
            </Muted>

            <Spacer h={S.lg} />
            <Overline>ESP32 address</Overline>
            <TextInput
              value={address}
              onChangeText={(v) => {
                setAddress(v);
                setConn({ state: 'idle' });
              }}
              onSubmitEditing={connect}
              placeholder="172.20.10.2"
              placeholderTextColor={C.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              style={inputStyle}
            />
            <Muted variant="small" style={{ marginTop: 6 }}>
              Add “:port” if you changed the port from 80, e.g. 172.20.10.2:8080
            </Muted>
            <Btn
              label={conn.state === 'testing' ? 'Connecting…' : conn.state === 'ok' ? 'Test again' : 'Connect'}
              icon="📶"
              kind={conn.state === 'ok' ? 'soft' : undefined}
              disabled={!address.trim() || conn.state === 'testing'}
              onPress={connect}
              style={{ marginTop: S.lg }}
            />

            {conn.state === 'error' ? (
              <Card tone={C.danger} style={{ marginTop: S.md }}>
                <Txt variant="label" color={C.danger}>
                  Couldn’t read the sensors
                </Txt>
                <Muted variant="small" style={{ marginTop: 4, lineHeight: 18 }}>
                  {conn.error}. Check the address, that the ESP32 is powered, and that both devices are on the same
                  Wi-Fi.
                </Muted>
              </Card>
            ) : null}

            {conn.state === 'ok' && conn.reading ? (
              <Card tone={C.leaf} style={{ marginTop: S.md }}>
                <Row center gap={S.sm}>
                  <Text style={{ fontSize: 18 }}>✅</Text>
                  <Txt variant="label" color={C.leaf} style={{ flex: 1 }}>
                    Connected to {nodeUrl(address)}
                  </Txt>
                </Row>
                <Row gap={S.sm} style={{ marginTop: S.md }}>
                  <StatTile label="Soil" value={Math.round(conn.reading.soil)} unit="%" icon="💧" />
                  <StatTile label="Temp" value={conn.reading.temp.toFixed(1)} unit="°C" icon="🌡️" />
                </Row>
                <Row gap={S.sm} style={{ marginTop: S.sm }}>
                  <StatTile
                    label="Light"
                    value={fmtLux(conn.reading.lux)}
                    unit={conn.reading.lux == null ? undefined : 'lux'}
                    sub={conn.reading.lux == null ? 'sensor not answering' : undefined}
                    icon="☀️"
                  />
                  <StatTile label="Tank" value={Math.round(conn.reading.tank)} unit="%" icon="🪣" />
                </Row>
              </Card>
            ) : null}
          </>
        ) : null}

        {step === 3 && species ? (
          <>
            <Txt variant="h1">Care plan</Txt>
            <Muted variant="small" style={{ marginTop: 6 }}>
              Generated from the {species.name} profile. Everything here can be tuned later.
            </Muted>

            <Card style={{ marginTop: S.lg }}>
              <Row center gap={S.md}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    backgroundColor: C.surfaceHi,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ fontSize: 26 }}>{species.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="h3">{name.trim() || species.name}</Txt>
                  <Muted variant="small">
                    {species.name} · {zone} · {potLitres} L · {address.trim()}
                  </Muted>
                </View>
              </Row>
              <Divider />
              <KeyValue k="Moisture band" v={`${species.soil.min}–${species.soil.max}% VWC`} color={C.water} />
              <KeyValue k="Temperature" v={`${tempRange(species.id).min}–${tempRange(species.id).max} °C`} />
              <KeyValue k="Light" v={`${fmtLux(LUX_RANGE.min)}–${fmtLux(LUX_RANGE.max)} lux`} />
              <KeyValue k="Water per watering" v={`${Math.round(species.waterMlPerL * potLitres)} ml`} />
              <KeyValue k="Fertiliser" v={`every ${species.fertilizeEveryDays} days`} />
              {species.toxicToPets ? <KeyValue k="Pets" v="⚠️ Toxic if chewed" color={C.warn} /> : null}
            </Card>

            <Muted variant="small" style={{ marginTop: S.md, lineHeight: 18 }}>
              Charts and predictions fill in from the ESP32’s live readings, starting now. The app records a point every
              5 minutes while it’s open.
            </Muted>
          </>
        ) : null}
      </ScrollView>

      <View
        style={{
          padding: S.lg,
          paddingBottom: insets.bottom + S.md,
          borderTopWidth: 1,
          borderTopColor: C.border,
          backgroundColor: C.bgElevated,
        }}>
        <Btn
          label={step === STEPS.length - 1 ? 'Add to garden' : 'Continue'}
          icon={step === STEPS.length - 1 ? '🌱' : undefined}
          disabled={!canNext}
          onPress={() => (step === STEPS.length - 1 ? finish() : setStep((s) => s + 1))}
        />
      </View>
    </View>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.sm, backgroundColor: color + '18' }}>
      <Text style={[F.tiny, { color, letterSpacing: 0.2 }]}>{text}</Text>
    </View>
  );
}

const inputStyle = {
  ...F.body,
  color: C.text,
  backgroundColor: C.surfaceAlt,
  borderRadius: R.md,
  paddingHorizontal: S.md,
  paddingVertical: S.md,
  borderWidth: 1,
  borderColor: C.border,
  marginTop: S.md,
} as const;
