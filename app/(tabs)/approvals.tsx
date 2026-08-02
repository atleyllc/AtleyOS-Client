import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  listApprovals,
  resolveApproval,
  seedDemoApproval,
  type PendingApproval,
} from "../../src/lib/approvals";
import { colors, space } from "../../src/lib/theme";

export default function ApprovalsScreen() {
  const [items, setItems] = useState<PendingApproval[]>(listApprovals());

  function refresh() {
    setItems(listApprovals());
  }

  return (
    <View style={styles.root}>
      <Text style={styles.lede}>
        Action assent when you are away. Push notifications will carry opaque
        ids only — never Knowledge contents.
      </Text>
      <Pressable
        style={styles.secondary}
        onPress={() => {
          seedDemoApproval();
          refresh();
        }}
      >
        <Text style={styles.secondaryText}>Load sample pending approval</Text>
      </Pressable>
      {items.length === 0 ? (
        <Text style={styles.empty}>No pending approvals</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.summary}>{item.summary}</Text>
            <View style={styles.row}>
              <Pressable
                style={styles.allow}
                onPress={() => {
                  resolveApproval(item.id, "allow");
                  refresh();
                }}
              >
                <Text style={styles.btnText}>Allow</Text>
              </Pressable>
              <Pressable
                style={styles.deny}
                onPress={() => {
                  resolveApproval(item.id, "deny");
                  refresh();
                }}
              >
                <Text style={styles.btnText}>Deny</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: space.md, gap: space.md },
  lede: { color: colors.muted, lineHeight: 20 },
  empty: { color: colors.muted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: space.md,
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontWeight: "700", fontSize: 16 },
  summary: { color: colors.muted },
  row: { flexDirection: "row", gap: space.sm },
  allow: {
    flex: 1,
    backgroundColor: colors.ok,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  deny: {
    flex: 1,
    backgroundColor: colors.danger,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700" },
  secondary: { padding: 8 },
  secondaryText: { color: colors.accent },
});
