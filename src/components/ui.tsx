import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, space } from "../lib/theme";

export function ScreenIntro({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.intro}>
      <Text style={styles.kicker}>AtleyOS</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: "Everyday" | "Setup" | "Advanced";
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
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
      >
        <Text style={styles.disclosure}>{open ? "Hide" : "Show"} {title}</Text>
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      style={[styles.primary, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}
    >
      <Text style={styles.primaryText}>{label}</Text>
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
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.quiet}>
      <Text style={[styles.quietText, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 4, marginBottom: space.sm },
  kicker: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  title: { color: colors.text, fontSize: 28, fontWeight: "700" },
  subtitle: { color: colors.muted, lineHeight: 20 },
  section: {
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  disclosure: { color: colors.accent, fontWeight: "700", paddingVertical: 4 },
  disclosureBody: { gap: space.sm, paddingTop: space.xs },
  primary: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  primaryText: { color: "#fff", fontWeight: "700" },
  quiet: { paddingVertical: 8 },
  quietText: { color: colors.accent, fontWeight: "700" },
  dangerText: { color: colors.danger },
});
