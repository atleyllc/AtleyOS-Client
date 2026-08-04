import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Network from "expo-network";
import {
  chatCompletions,
  clearPreferredBase,
  clientStatus,
  probeReachability,
} from "../../src/lib/api";
import { openCitationUrl } from "../../src/lib/homeOpeners";
import { runObservationCycle } from "../../src/lib/observation";
import type { ChatMessage } from "../../src/lib/types";
import { colors, space } from "../../src/lib/theme";
const URL_RE = /https?:\/\/[^\s)]+/g;

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState("Checking home…");

  const refreshStatus = useCallback(async () => {
    try {
      const net = await Network.getNetworkStateAsync().catch(() => null);
      // Sync Away HTTPS URL from home when reachable (e.g. on Wi‑Fi after dashboard setup).
      await clientStatus().catch(() => undefined);
      const probe = await probeReachability();
      if (probe.ok) {
        const underlay = net?.type ? ` · ${net.type}` : "";
        const via =
          probe.mode === "https"
            ? "Away HTTPS"
            : probe.mode === "lan"
              ? "home Wi‑Fi"
              : "Home VPN";
        setStatusLine(`Connected via ${via}${underlay}`);
        return;
      }
      setStatusLine(probe.error || "Unreachable — check Away access or home Wi‑Fi");
    } catch {
      setStatusLine(
        "Reaching home… Chat uses Wi‑Fi or Away HTTPS (Home VPN optional)",
      );
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void runObservationCycle().catch(() => undefined);
    const sub = Network.addNetworkStateListener(() => {
      clearPreferredBase();
      // Do not auto-start Home VPN for Chat — only refresh reachability.
      void refreshStatus();
    });
    return () => sub.remove();
  }, [refreshStatus]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      clearPreferredBase();
      // HTTPS-first: never require or force Home VPN for Chat.
      const { content } = await chatCompletions(next);
      setMessages([...next, { role: "assistant", content }]);
      await refreshStatus();
    } catch (e) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: `Could not reach home: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.status}>{statusLine}</Text>
      <FlatList
        style={styles.list}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === "user" ? styles.user : styles.assistant,
            ]}
          >
            <Text style={styles.bubbleText}>{item.content}</Text>
            {(item.content.match(URL_RE) || []).map((url) => (
              <Pressable
                key={url}
                onPress={() =>
                  void openCitationUrl(url).catch(() => Linking.openURL(url))
                }
              >
                <Text style={styles.link}>{url}</Text>
              </Pressable>
            ))}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Ask your home AtleyOS anything. Knowledge and models stay on your
            server.
          </Text>
        }
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message AtleyOS…"
          placeholderTextColor={colors.muted}
          editable={!busy}
          onSubmitEditing={() => void send()}
        />
        <Pressable style={styles.send} onPress={() => void send()} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  status: {
    color: colors.muted,
    fontSize: 12,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  list: { flex: 1 },
  empty: { color: colors.muted, lineHeight: 22 },
  bubble: {
    padding: space.md,
    borderRadius: 14,
    maxWidth: "92%",
  },
  user: { alignSelf: "flex-end", backgroundColor: colors.accentDim },
  assistant: { alignSelf: "flex-start", backgroundColor: colors.surface },
  bubbleText: { color: colors.text, lineHeight: 21 },
  link: { color: colors.accent, marginTop: 6, fontSize: 13 },
  composer: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    color: colors.text,
  },
  send: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  sendText: { color: "#fff", fontWeight: "700" },
});
