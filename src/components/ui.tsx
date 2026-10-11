import { Children, Fragment, isValidElement, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, space, type } from "../lib/theme";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

import type { Tone } from "../lib/tone";
export type { Tone } from "../lib/tone";

const TONE: Record<Tone, { fg: string; bg: string }> = {
  ok: { fg: colors.ok, bg: colors.okSoft },
  warn: { fg: colors.warn, bg: colors.warnSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  muted: { fg: colors.muted, bg: colors.surfaceRaised },
  accent: { fg: colors.accent, bg: colors.accentSoft },
};

/**
 * A tab screen: one large title, optional actions on the right, then content.
 * Tabs hide the navigator header, so this owns the top safe area.
 */
export function Screen({
  title,
  subtitle,
  right,
  children,
  refreshing,
  onRefresh,
  testID,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.screenContent, { paddingTop: insets.top + space.sm }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
      testID={testID}
    >
      <ScreenTitle title={title} subtitle={subtitle} right={right} />
      {children}
    </ScrollView>
  );
}

export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.titleBlock}>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {right ? <View style={styles.titleRight}>{right}</View> : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

/** Stack screens already show their title in the header; this is the short lede under it. */
export function ScreenIntro({ subtitle }: { title?: string; subtitle?: string }) {
  if (!subtitle) return null;
  return <Text style={styles.lede}>{subtitle}</Text>;
}

/** Plain scroll body for stack screens (the header owns the title and safe area). */
export function Page({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + space.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

/** A titled card. `eyebrow` is accepted for older callers and not shown. */
export function Section({
  title,
  icon,
  right,
  children,
}: {
  eyebrow?: string;
  title?: string;
  icon?: IconName;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card style={styles.section}>
      {title ? (
        <View style={styles.sectionHead}>
          {icon ? <IconBadge name={icon} /> : null}
          <Text style={styles.sectionTitle} numberOfLines={2}>
            {title}
          </Text>
          {right ? <View style={styles.sectionRight}>{right}</View> : null}
        </View>
      ) : null}
      {children}
    </Card>
  );
}

/** A small caption above a group of cards. */
export function GroupLabel({ children }: { children: string }) {
  return <Text style={styles.groupLabel}>{children}</Text>;
}

/** Rows in one card, split by hairlines. */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, style]}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={styles.hairline} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

export function IconBadge({
  name,
  tone = "accent",
  size = 32,
  color,
}: {
  name: IconName;
  tone?: Tone;
  size?: number;
  color?: string;
}) {
  const t = TONE[tone];
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: t.bg }]}>
      <Icon name={name} size={Math.round(size * 0.56)} color={color || t.fg} />
    </View>
  );
}

export function ListRow({
  icon,
  tone,
  title,
  subtitle,
  right,
  onPress,
  chevron,
  danger,
  testID,
  accessibilityLabel,
}: {
  icon?: IconName;
  tone?: Tone;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      {icon ? <IconBadge name={icon} tone={danger ? "danger" : tone} /> : null}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && { color: colors.danger }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-right" size={18} color={colors.faint} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

/** Compact status, e.g. a green "Up" or a grey "Offline". */
export function StatusChip({ label, tone = "muted", dot = true }: { label: string; tone?: Tone; dot?: boolean }) {
  const t = TONE[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]} accessibilityLabel={label}>
      {dot ? <View style={[styles.dot, { backgroundColor: t.fg }]} /> : null}
      <Text style={[styles.chipText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.disclosure}
      >
        <Text style={styles.disclosureText}>{title}</Text>
        <Icon
          name="chevron-right"
          size={16}
          color={colors.muted}
          style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
        />
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
  testID?: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.primary, (disabled || busy) && styles.disabled, pressed && styles.pressed]}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
      testID={testID}
    >
      {busy ? <ActivityIndicator color="#fff" /> : icon ? <Icon name={icon} size={18} color="#fff" /> : null}
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  icon,
  danger,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: IconName;
  danger?: boolean;
  testID?: string;
}) {
  const fg = danger ? colors.danger : colors.text;
  return (
    <Pressable
      style={({ pressed }) => [styles.secondary, disabled && styles.disabled, pressed && styles.pressed]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}
    >
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.secondaryText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function QuietButton({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.quiet} hitSlop={6}>
      <Text style={[styles.quietText, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  color = colors.text,
  filled,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  filled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, filled && styles.iconButtonFilled, pressed && styles.pressed]}
      testID={testID}
    >
      <Icon name={icon} size={20} color={color} />
    </Pressable>
  );
}

export type MenuAction = { label: string; onPress: () => void; danger?: boolean; icon?: IconName };

/** "⋯" button that opens a bottom sheet of secondary actions. */
export function MenuButton({ title, actions, testID }: { title?: string; actions: MenuAction[]; testID?: string }) {
  const [open, setOpen] = useState(false);
  if (!actions.length) return null;
  return (
    <>
      <IconButton icon="more" label={title ? `More for ${title}` : "More"} onPress={() => setOpen(true)} color={colors.muted} testID={testID} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <Group>
          {actions.map((action) => (
            <ListRow
              key={action.label}
              icon={action.icon}
              title={action.label}
              danger={action.danger}
              onPress={() => {
                setOpen(false);
                action.onPress();
              }}
            />
          ))}
        </Group>
      </Sheet>
    </>
  );
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]} onPress={() => undefined}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
          <ScrollView style={styles.sheetScroll} contentContainerStyle={{ gap: space.sm }}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ProgressBar({ value, tone = "accent" }: { value: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: TONE[tone].fg }]} />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon: IconName;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <IconBadge name={icon} size={56} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {children}
    </View>
  );
}

/** Inline banner for errors and notes. */
export function Note({ tone = "muted", icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <View style={[styles.note, { backgroundColor: t.bg }]}>
      <Icon name={icon || (tone === "danger" || tone === "warn" ? "alert" : "info")} size={18} color={t.fg} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

export function Body({ children, muted = true }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, !muted && { color: colors.text }]}>{children}</Text>;
}

export const ui = StyleSheet.create({
  body: { color: colors.muted, ...type.body },
  mono: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: colors.bg,
    padding: space.sm,
    borderRadius: radius.sm,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screenContent: { paddingHorizontal: space.md, paddingBottom: space.xl, gap: space.md },
  pageContent: { padding: space.md, gap: space.md },
  titleBlock: { gap: space.xxs, marginBottom: space.xs },
  titleRow: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  title: { color: colors.text, ...type.title, flex: 1 },
  titleRight: { flexDirection: "row", alignItems: "center", gap: space.xs },
  subtitle: { color: colors.muted, ...type.small },
  lede: { color: colors.muted, ...type.small },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md,
  },
  section: { gap: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  sectionTitle: { color: colors.text, ...type.heading, flex: 1 },
  sectionRight: { flexDirection: "row", alignItems: "center", gap: space.xs },
  groupLabel: {
    color: colors.muted,
    ...type.label,
    textTransform: "uppercase",
    fontSize: 12,
    marginTop: space.xs,
    marginBottom: -space.xs,
    marginLeft: space.xxs,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 60 },
  badge: { alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  rowSubtitle: { color: colors.muted, ...type.small },
  pressed: { opacity: 0.7 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: "700" },
  disclosure: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 },
  disclosureText: { color: colors.muted, fontWeight: "600", fontSize: 14 },
  disclosureBody: { gap: space.sm, paddingTop: space.xs },
  primary: {
    flexDirection: "row",
    gap: space.xs,
    backgroundColor: colors.accent,
    paddingVertical: 13,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondary: {
    flexDirection: "row",
    gap: space.xs,
    backgroundColor: colors.surfaceRaised,
    paddingVertical: 12,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontWeight: "600", fontSize: 15 },
  quiet: { paddingVertical: 8 },
  quietText: { color: colors.accent, fontWeight: "600" },
  dangerText: { color: colors.danger },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonFilled: { backgroundColor: colors.surface },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    gap: space.sm,
    maxHeight: "80%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.xs,
  },
  sheetTitle: { color: colors.text, ...type.heading, marginBottom: space.xxs },
  sheetScroll: { flexGrow: 0 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.lg, paddingHorizontal: space.md },
  emptyTitle: { color: colors.text, ...type.heading, fontSize: 19, textAlign: "center" },
  emptyBody: { color: colors.muted, ...type.small, textAlign: "center", maxWidth: 300 },
  note: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "flex-start",
    padding: space.sm + 2,
    borderRadius: radius.md,
  },
  noteText: { color: colors.text, ...type.small, flex: 1 },
  body: { color: colors.muted, ...type.body },
});
