import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { deleteConfirmCopy } from "../lib/chatTools";
import { cloudEmbeddingWarning } from "../lib/searchParse";
import { openCitationUrl } from "../lib/homeOpeners";
import type { ChatMessage } from "../lib/types";
import { colors, space } from "../lib/theme";

const URL_RE = /https?:\/\/[^\s)]+/g;

export function ChatMessageBody({
  message,
  pendingApprovalIds,
  onDecide,
}: {
  message: ChatMessage;
  pendingApprovalIds: string[];
  onDecide: (id: string, decision: "allow" | "deny") => void;
}) {
  const warning = cloudEmbeddingWarning(message.embeddingRoute || "");
  return (
    <View>
      {message.content ? <Text style={styles.bubbleText}>{message.content}</Text> : null}
      {(message.content.match(URL_RE) || []).map((url) => (
        <Pressable key={url} onPress={() => void openCitationUrl(url).catch(() => Linking.openURL(url))}>
          <Text style={styles.link}>{url}</Text>
        </Pressable>
      ))}
      {warning ? <Text style={styles.warn}>{warning}</Text> : null}
      {(message.toolCalls || []).map((tool) => {
        const pending = Boolean(tool.approvalId) && pendingApprovalIds.includes(tool.approvalId);
        return (
          <View key={tool.id} style={styles.tool}>
            <Text style={styles.toolName}>{tool.name.replace(/[_-]+/g, " ")}</Text>
            <Text style={styles.bubbleText}>{tool.summary}</Text>
            {tool.undoNote ? <Text style={styles.note}>{tool.undoNote}</Text> : null}
            {tool.isDelete && !tool.undoNote ? (
              <Text style={styles.note}>You can undo a delete from the home dashboard.</Text>
            ) : null}
            {pending ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => confirmTool(tool, () => onDecide(tool.approvalId, "allow"))}
                  accessibilityRole="button"
                >
                  <Text style={styles.allow}>{tool.isDelete ? "Allow delete" : "Allow"}</Text>
                </Pressable>
                <Pressable onPress={() => onDecide(tool.approvalId, "deny")} accessibilityRole="button">
                  <Text style={styles.deny}>Deny</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
      {(message.citations || []).map((hit, index) => (
        <View key={`${hit.path}-${hit.page}-${index}`} style={styles.cite}>
          <Text style={styles.bubbleText}>{hit.title || hit.path || "Result"}</Text>
          {hit.path ? <Text style={styles.note}>{hit.path}{hit.page ? ` · page ${hit.page}` : ""}</Text> : null}
          {hit.snippet ? <Text style={styles.note}>{hit.snippet}</Text> : null}
          {hit.openUrl ? (
            <Pressable
              onPress={() => void openCitationUrl(hit.openUrl).catch(() => Linking.openURL(hit.openUrl))}
              accessibilityRole="button"
            >
              <Text style={styles.link}>Open</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function confirmTool(
  tool: { summary: string; undoNote: string; isDelete: boolean },
  allow: () => void,
) {
  if (!tool.isDelete) {
    allow();
    return;
  }
  const copy = deleteConfirmCopy(tool);
  Alert.alert(copy.title, copy.message, [
    { text: "Cancel", style: "cancel" },
    { text: "Allow delete", style: "destructive", onPress: allow },
  ]);
}

const styles = StyleSheet.create({
  bubbleText: { color: colors.text, lineHeight: 21 },
  link: { color: colors.accent, marginTop: 6, fontSize: 13, fontWeight: "700" },
  warn: { color: colors.danger, marginTop: space.sm, lineHeight: 18 },
  tool: {
    marginTop: space.sm,
    padding: space.sm,
    borderRadius: 10,
    backgroundColor: colors.bg,
    gap: 4,
  },
  toolName: { color: colors.accent, fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  note: { color: colors.muted, lineHeight: 18, fontSize: 13 },
  actions: { flexDirection: "row", gap: space.md, marginTop: 4 },
  allow: { color: colors.accent, fontWeight: "700" },
  deny: { color: colors.danger, fontWeight: "700" },
  cite: { marginTop: space.sm, gap: 2 },
});
