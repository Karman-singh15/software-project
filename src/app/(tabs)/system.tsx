import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { C, F, S } from '@/theme/tokens';
import { useGarden, nodeUrl } from '@/store/garden';
import { speciesById } from '@/domain/species';
import { fmtLux, latest, relTime } from '@/domain/insights';
import type { Plant } from '@/domain/types';
import { Badge, Btn, Card, Divider, KeyValue, Muted, Overline, ProgressBar, Row, Screen, SectionHeader, Spacer, Txt } from '@/components/ui';
import { Ring, Sparkline } from '@/components/charts';

export default function SystemScreen() {
  const g = useGarden();
  const router = useRouter();

  // One card per ESP32; several plants can share a node.
  const nodes = new Map<string, Plant[]>();
  for (const p of g.plants) nodes.set(p.address, [...(nodes.get(p.address) ?? []), p]);

  return (
    <Screen>
      <Overline>Infrastructure</Overline>
      <Txt variant="h1" style={{ marginTop: 2 }}>
        Hardware
      </Txt>
      <Muted variant="small" style={{ marginTop: 4 }}>
        {nodes.size} ESP32 node{nodes.size === 1 ? '' : 's'} · polled every 2 s over Wi-Fi
      </Muted>

      {!nodes.size ? (
        <Card style={{ marginTop: S.lg }}>
          <View style={{ alignItems: 'center', gap: S.sm, paddingVertical: S.lg }}>
            <Text style={{ fontSize: 36 }}>📡</Text>
            <Txt variant="h3">No sensor nodes yet</Txt>
            <Muted variant="small" align="center">
              Add a plant and enter its ESP32’s address to see the node here.
            </Muted>
            <Btn label="Add a plant" icon="＋" onPress={() => router.push('/onboarding')} small />
          </View>
        </Card>
      ) : null}

      {[...nodes.entries()].map(([address, plants]) => {
        const p = plants[0];
        const last = latest(p);
        return (
          <View key={address}>
            <SectionHeader title={address} subtitle={nodeUrl(address)} />
            <Card tone={p.online ? C.leaf : C.danger}>
              <Row between center>
                <Row center gap={S.sm}>
                  <Text style={{ fontSize: 20 }}>🛰️</Text>
                  <View>
                    <Txt variant="h3">ESP32 DevKit V1</Txt>
                    <Muted variant="small">Last reading {p.lastSeen ? relTime(p.lastSeen, g.now) : 'never'}</Muted>
                  </View>
                </Row>
                <Badge label={p.online ? 'live' : 'offline'} color={p.online ? C.leaf : C.danger} />
              </Row>

              {last ? (
                <>
                  <Row gap={S.lg} center style={{ marginTop: S.md }}>
                    <Ring
                      value={last.tank / 100}
                      size={84}
                      stroke={9}
                      color={last.tank < 18 ? C.warn : C.water}
                      label={`${Math.round(last.tank)}%`}
                      sublabel="TANK"
                    />
                    <View style={{ flex: 1, gap: 4 }}>
                      <KeyValue k="Soil moisture" v={`${last.soil.toFixed(1)}%`} />
                      <KeyValue k="Temperature (TMP36)" v={`${last.temp.toFixed(1)} °C`} />
                      <KeyValue
                        k="Light (BH1750)"
                        v={last.lux == null ? 'not answering' : `${fmtLux(last.lux)} lux`}
                        color={last.lux == null ? C.warn : C.text}
                      />
                    </View>
                  </Row>
                  <View style={{ marginTop: S.md }}>
                    <ProgressBar value={last.tank} color={last.tank < 18 ? C.warn : C.water} height={8} />
                  </View>
                  {last.tank < 18 ? (
                    <Muted variant="small" style={{ marginTop: S.sm }}>
                      ⚠️ Reservoir below 18% — refill it.
                    </Muted>
                  ) : null}
                </>
              ) : null}

              {!p.online ? (
                <Muted variant="small" style={{ marginTop: S.md, lineHeight: 18 }}>
                  Not responding. Check that the ESP32 is powered, that the serial monitor still shows this address,
                  and that the phone is on the same Wi-Fi.
                </Muted>
              ) : null}

              <Divider />
              <Overline>Plants on this node</Overline>
              {plants.map((pl) => (
                <Card key={pl.id} style={{ marginTop: S.sm, padding: S.md }} onPress={() => router.push(`/plant/${pl.id}`)}>
                  <Row between center>
                    <Row center gap={S.sm} style={{ flex: 1 }}>
                      <Text style={{ fontSize: 17 }}>{speciesById(pl.speciesId).emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Txt variant="label">{pl.name}</Txt>
                        <Muted variant="small">
                          {pl.zone} · {pl.history.length} points stored
                        </Muted>
                      </View>
                    </Row>
                    <Sparkline values={pl.history.slice(-36).map((r) => r.soil)} width={70} height={20} color={C.water} />
                  </Row>
                </Card>
              ))}
            </Card>
          </View>
        );
      })}

      <SectionHeader title="Protocol" subtitle="What the app reads from each node" />
      <Card>
        <Text style={[F.small, { color: C.leaf, fontFamily: 'monospace' }]}>GET http://&lt;address&gt;/</Text>
        <Muted variant="small" style={{ marginTop: 4, lineHeight: 18 }}>
          {'{"soil": %, "temp": °C, "lux": lux or -1, "tank": %}'}
          {'\n'}Firmware: hardware/plantnet_node/plantnet_node.ino
        </Muted>
      </Card>

      <Spacer h={S.lg} />
    </Screen>
  );
}
