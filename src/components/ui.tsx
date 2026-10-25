import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F, R, S } from '@/theme/tokens';

/* ---------------- text ---------------- */

type TxtProps = {
  children?: React.ReactNode;
  variant?: keyof typeof F;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  align?: TextStyle['textAlign'];
};

export function Txt({ children, variant = 'body', color = C.text, style, numberOfLines, align }: TxtProps) {
  return (
    <Text numberOfLines={numberOfLines} style={[F[variant], { color, textAlign: align }, style]}>
      {children}
    </Text>
  );
}

export function Muted(props: Omit<TxtProps, 'color'>) {
  return <Txt {...props} color={C.textMuted} />;
}

export function Overline({ children, color = C.textDim }: { children: React.ReactNode; color?: string }) {
  return (
    <Text style={[F.tiny, { color, textTransform: 'uppercase' }]}>{children}</Text>
  );
}

/* ---------------- layout ---------------- */

export function Screen({
  children,
  scroll = true,
  refreshing,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + S.sm, paddingBottom: insets.bottom + 96 };
  if (!scroll) {
    return <View style={[styles.screen, pad]}>{children}</View>;
  }
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[{ paddingHorizontal: S.lg }, pad]}
      showsVerticalScrollIndicator={false}>
      {refreshing ? <ActivityIndicator color={C.leaf} /> : null}
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  onPress,
  tone,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  tone?: string;
}) {
  const body = (
    <View
      style={[
        styles.card,
        tone ? { borderColor: tone + '55', backgroundColor: tone + '10' } : null,
        style,
      ]}>
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}

export function Row({
  children,
  gap = S.sm,
  style,
  center,
  between,
  wrap,
}: {
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  center?: boolean;
  between?: boolean;
  wrap?: boolean;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: center ? 'center' : 'flex-start',
          justifyContent: between ? 'space-between' : 'flex-start',
          gap,
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Spacer({ h = S.md }: { h?: number }) {
  return <View style={{ height: h }} />;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: C.border, marginVertical: S.md }, style]} />;
}

export function SectionHeader({
  title,
  action,
  onAction,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ marginTop: S.xl, marginBottom: S.sm }}>
      <Row between center>
        <View style={{ flex: 1 }}>
          <Txt variant="h3">{title}</Txt>
          {subtitle ? <Muted variant="small" style={{ marginTop: 2 }}>{subtitle}</Muted> : null}
        </View>
        {action ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Txt variant="label" color={C.leaf}>{action}</Txt>
          </Pressable>
        ) : null}
      </Row>
    </View>
  );
}

/* ---------------- controls ---------------- */

export function Btn({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  small,
  style,
  tone,
}: {
  label: string;
  onPress?: () => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'soft';
  icon?: string;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  tone?: string;
}) {
  const bg =
    kind === 'primary'
      ? tone ?? C.leaf
      : kind === 'danger'
        ? C.danger + '22'
        : kind === 'soft'
          ? C.surfaceHi
          : 'transparent';
  const fg =
    kind === 'primary' ? '#04140C' : kind === 'danger' ? C.danger : tone ?? C.text;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: R.pill,
          paddingVertical: small ? 8 : 13,
          paddingHorizontal: small ? 14 : 20,
          borderWidth: kind === 'ghost' ? 1 : 0,
          borderColor: C.borderHi,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        },
        style,
      ]}>
      {icon ? <Text style={{ fontSize: small ? 12 : 14 }}>{icon}</Text> : null}
      <Text style={[small ? F.small : F.label, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  color = C.leaf,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
  icon?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 7,
        paddingHorizontal: 13,
        borderRadius: R.pill,
        backgroundColor: active ? color + '22' : C.surfaceAlt,
        borderWidth: 1,
        borderColor: active ? color + '88' : C.border,
        opacity: pressed ? 0.7 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
      })}>
      {icon ? <Text style={{ fontSize: 12 }}>{icon}</Text> : null}
      <Text style={[F.small, { color: active ? color : C.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, color = C.leaf, icon }: { label: string; color?: string; icon?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: R.pill,
        backgroundColor: color + '1F',
      }}>
      {icon ? <Text style={{ fontSize: 10 }}>{icon}</Text> : null}
      <Text style={[F.tiny, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.segmentItem, active && { backgroundColor: C.surfaceHi }]}>
            <Text style={[F.small, { color: active ? C.text : C.textDim }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={{
        width: 48,
        height: 28,
        borderRadius: R.pill,
        padding: 3,
        backgroundColor: value ? C.leaf : C.surfaceHi,
        borderWidth: 1,
        borderColor: value ? C.leaf : C.border,
        justifyContent: 'center',
      }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: value ? '#04140C' : C.textDim,
          alignSelf: value ? 'flex-end' : 'flex-start',
        }}
      />
    </Pressable>
  );
}

export function SettingRow({
  title,
  subtitle,
  icon,
  right,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <Row center gap={S.md} style={{ paddingVertical: S.md }}>
      {icon ? (
        <View style={styles.iconBubble}>
          <Text style={{ fontSize: 16 }}>{icon}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt variant="label">{title}</Txt>
        {subtitle ? (
          <Muted variant="small" style={{ marginTop: 2 }}>
            {subtitle}
          </Muted>
        ) : null}
      </View>
      {right}
    </Row>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

/* ---------------- data bits ---------------- */

export function StatTile({
  label,
  value,
  unit,
  color = C.text,
  sub,
  icon,
  flex = 1,
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  sub?: string;
  icon?: string;
  flex?: number;
}) {
  return (
    <View style={[styles.tile, { flex }]}>
      <Row center gap={5}>
        {icon ? <Text style={{ fontSize: 11 }}>{icon}</Text> : null}
        <Overline>{label}</Overline>
      </Row>
      <Row center gap={3} style={{ marginTop: 6 }}>
        <Text style={[F.metric, { color }]}>{value}</Text>
        {unit ? <Text style={[F.small, { color: C.textDim, marginBottom: 4 }]}>{unit}</Text> : null}
      </Row>
      {sub ? (
        <Muted variant="small" numberOfLines={1}>
          {sub}
        </Muted>
      ) : null}
    </View>
  );
}

export function ProgressBar({
  value,
  color = C.leaf,
  height = 8,
  track = C.surfaceHi,
  bands,
}: {
  value: number;
  color?: string;
  height?: number;
  track?: string;
  bands?: { from: number; to: number; color: string };
}) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      {bands ? (
        <View
          style={{
            position: 'absolute',
            left: `${bands.from}%`,
            width: `${Math.max(bands.to - bands.from, 1)}%`,
            top: 0,
            bottom: 0,
            backgroundColor: bands.color,
          }}
        />
      ) : null}
      <View
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

export function Avatar({ initials, color, size = 34 }: { initials: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color + '28',
        borderWidth: 1,
        borderColor: color + '66',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={[F.small, { color }]}>{initials}</Text>
    </View>
  );
}

export function EmptyState({
  emoji,
  title,
  detail,
  action,
  onAction,
}: {
  emoji: string;
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: S.xxl, gap: S.sm }}>
      <Text style={{ fontSize: 40 }}>{emoji}</Text>
      <Txt variant="h3">{title}</Txt>
      <Muted variant="small" align="center" style={{ maxWidth: 280, lineHeight: 18 }}>
        {detail}
      </Muted>
      {action ? <Btn label={action} onPress={onAction} small style={{ marginTop: S.sm }} /> : null}
    </View>
  );
}

export function KeyValue({ k, v, color = C.text }: { k: string; v: string; color?: string }) {
  return (
    <Row between center style={{ paddingVertical: 6 }}>
      <Muted variant="small">{k}</Muted>
      <Txt variant="small" color={color}>
        {v}
      </Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
  },
  tile: {
    backgroundColor: C.surfaceAlt,
    borderRadius: R.md,
    padding: S.md,
    borderWidth: 1,
    borderColor: C.border,
    minWidth: 90,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: C.surfaceAlt,
    borderRadius: R.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: C.border,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: R.pill,
  },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
