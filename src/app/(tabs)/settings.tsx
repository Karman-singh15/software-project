import React, { useState } from 'react';
import { Alert as RNAlert, Pressable, Text, TextInput, View } from 'react-native';

import { C, F, R, S } from '@/theme/tokens';
import { useGarden } from '@/store/garden';
import { relTime } from '@/domain/insights';
import {
  Avatar,
  Badge,
  Btn,
  Card,
  Chip,
  Divider,
  Muted,
  Overline,
  Row,
  Screen,
  SectionHeader,
  SettingRow,
  Spacer,
  Txt,
} from '@/components/ui';

export default function SettingsScreen() {
  const g = useGarden();
  const [inviting, setInviting] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'caretaker' | 'viewer'>('caretaker');
  const [household, setHousehold] = useState(g.settings.householdName);

  const confirmReset = () =>
    RNAlert.alert('Delete all data?', 'Every plant, reading and photo on this device will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: g.resetAll },
    ]);

  return (
    <Screen>
      <Overline>Account</Overline>
      <Txt variant="h1" style={{ marginTop: 2 }}>
        Settings
      </Txt>

      {/* Household */}
      <SectionHeader title="Household" />
      <Card>
        <Overline>Garden name</Overline>
        <TextInput
          value={household}
          onChangeText={setHousehold}
          onEndEditing={() => g.setSettings({ householdName: household.trim() || 'Home Garden' })}
          placeholder="Home Garden"
          placeholderTextColor={C.textDim}
          style={{
            ...F.h3,
            color: C.text,
            borderBottomWidth: 1,
            borderBottomColor: C.border,
            paddingVertical: S.sm,
            marginTop: 4,
          }}
        />
        <Divider />
        <Row between center>
          <Overline>Members ({g.members.length})</Overline>
          <Pressable onPress={() => setInviting((v) => !v)} hitSlop={8}>
            <Txt variant="label" color={C.leaf}>
              {inviting ? 'Cancel' : '+ Invite'}
            </Txt>
          </Pressable>
        </Row>

        {g.members.map((m) => (
          <Row key={m.id} center gap={S.md} style={{ paddingVertical: S.md }}>
            <Avatar initials={m.initials} color={m.color} />
            <View style={{ flex: 1 }}>
              <Row center gap={6}>
                <Txt variant="label">{m.name}</Txt>
                <Badge label={m.role} color={m.role === 'owner' ? C.leaf : m.role === 'caretaker' ? C.water : C.textMuted} />
              </Row>
              <Muted variant="small">Active {relTime(m.lastActive, g.now)}</Muted>
            </View>
            {m.role !== 'owner' ? (
              <Pressable onPress={() => g.removeMember(m.id)} hitSlop={8}>
                <Text style={[F.small, { color: C.danger }]}>Remove</Text>
              </Pressable>
            ) : null}
          </Row>
        ))}

        {inviting ? (
          <View style={{ marginTop: S.sm, gap: S.sm }}>
            <TextInput
              value={inviteName}
              onChangeText={setInviteName}
              placeholder="Name"
              placeholderTextColor={C.textDim}
              style={{
                ...F.body,
                color: C.text,
                backgroundColor: C.surfaceAlt,
                borderRadius: R.md,
                paddingHorizontal: S.md,
                paddingVertical: S.md,
                borderWidth: 1,
                borderColor: C.border,
              }}
            />
            <Row gap={S.sm}>
              <Chip label="Caretaker" active={inviteRole === 'caretaker'} onPress={() => setInviteRole('caretaker')} />
              <Chip label="Viewer" active={inviteRole === 'viewer'} onPress={() => setInviteRole('viewer')} />
            </Row>
            <Muted variant="small">
              Caretakers can water and edit thresholds. Viewers see the dashboard and reports only.
            </Muted>
            <Btn
              label="Send invite"
              small
              disabled={!inviteName.trim()}
              onPress={() => {
                g.addMember(inviteName.trim(), inviteRole);
                setInviteName('');
                setInviting(false);
              }}
            />
          </View>
        ) : null}
      </Card>

      <SectionHeader title="Data" />
      <Card>
        <SettingRow
          title="Stored on this phone"
          subtitle="Readings are saved every minute while the app is open (one point per 5 min, 14 days kept)"
          icon="💾"
        />
        <Divider style={{ marginVertical: 4 }} />
        <SettingRow
          title="Delete all data"
          subtitle="Removes every plant and its readings"
          icon="🗑️"
          right={<Btn label="Delete" kind="danger" small onPress={confirmReset} />}
        />
      </Card>

      <Spacer h={S.xl} />
      <Muted variant="small" align="center">
        PlantNet · Smart Plant Care Network{'\n'}v1.0.0 · Expo Go build
      </Muted>
      <Spacer h={S.lg} />
    </Screen>
  );
}
