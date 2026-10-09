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
import { router } from "expo-router";
import {
  ApiError,
  NotPairedError,
  UNPAIRED_MESSAGE,
  chatCompletions,
  clearPreferredBase,
  clientStatus,
  probeReachability,
} from "../../src/lib/api";
import { ModelSwitcher } from "../../src/components/ModelSwitcher";
import { openCitationUrl } from "../../src/lib/homeOpeners";
import { runObservationCycle } from "../../src/lib/observation";
import { loadSession } from "../../src/lib/session";
import type { ChatMessage } from "../../src/lib/types";
import { colors, space } from "../../src/lib/theme";
const URL_RE = /https?:\/\/[^\s)]+/g;

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState("Checking home…");
  const [needsRepair, setNeedsRepair] = useState(false);
  const [connected, setConnected] = useState(false);
  const [banner, setBanner] = useState<
    | { kind: "unpaired"; message: string }
    | { kind: "unreachable"; message: string; suggestPair: boolean }
    | null
  >(null);

  const refreshStatus = useCallback(async () => {
    try {
      const session = await loadSession();
      if (!session) {
        setConnected(false);
        setNeedsRepair(false);
        setStatusLine("Not paired");
        setBanner({ kind: "unpaired", message: UNPAIRED_MESSAGE });
        return;
      }
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
        setNeedsRepair(false);
        setConnected(true);
        setBanner(null);
        return;
      }
      setConnected(false);
      setNeedsRepair(false);
      if (probe.reason === "not_paired") {
        setStatusLine("Not paired");
        setBanner({ kind: "unpaired", message: probe.message });
        return;
      }
      setStatusLine("Home unreachable");
      setBanner({
        kind: "unreachable",
        message: probe.message,
        suggestPair: probe.suggestPair,
      });
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
      setNeedsRepair(false);
      setMessages([...next, { role: "assistant", content }]);
      await refreshStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const unpaired = e instanceof NotPairedError;
      const authFail =
        !unpaired &&
        ((e instanceof ApiError && e.status === 401) ||
          /auth failed|unauthorized|stale pair/i.test(msg));
      if (unpaired) {
        setConnected(false);
        setNeedsRepair(false);
        setStatusLine("Not paired");
        setBanner({ kind: "unpaired", message: msg });
      } else if (authFail) {
        setNeedsRepair(true);
        setStatusLine("Connected path rejected auth — re-pair on home Wi‑Fi");
      }
      setMessages([
        ...next,
        {
          role: "assistant",
          content: unpaired
            ? `${msg}\n\nTap Pair with home above.`
            : authFail
              ? `${msg}\n\nTap Re-pair below (home Wi‑Fi), scan a fresh dashboard QR, then send again.`
              : msg.startsWith("Couldn’t reach home")
                ? msg
                : `Could not reach home: ${msg}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.status}>{statusLine}</Text>
      {banner?.kind === "unpaired" ? (
        <Pressable
          style={styles.repairBanner}
          onPress={() => router.push("/pair")}
          accessibilityRole="button"
          accessibilityLabel="Pair this phone with home"
          testID="pair-banner"
        >
          <Text style={styles.repairText}>{banner.message}</Text>
          <Text style={styles.repairAction}>Pair with home</Text>
        </Pressable>
      ) : null}
      {banner?.kind === "unreachable" ? (
        <View style={styles.unreachable} testID="unreachable-banner">
          <Text style={styles.unreachableText}>{banner.message}</Text>
          {banner.suggestPair ? (
            <Pressable
              onPress={() => router.push("/pair")}
              accessibilityRole="button"
              accessibilityLabel="Re-pair on home Wi-Fi"
            >
              <Text style={styles.repairAction}>Re-pair on home Wi‑Fi</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {needsRepair ? (
        <Pressable
          style={styles.repairBanner}
          onPress={() => router.push("/pair")}
          accessibilityRole="button"
        >
          <Text style={styles.repairText}>
            Re-pair on home Wi‑Fi — scan a fresh Remote Access QR
          </Text>
        </Pressable>
      ) : null}
      {connected ? <ModelSwitcher presentation="chip" /> : null}
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
            {banner?.kind === "unpaired"
              ? "Pair this phone with home to chat. Your models stay on your server."
              : "Ask your home AtleyOS anything. Knowledge and models stay on your server."}
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
  repairBanner: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: 10,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  repairText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  repairAction: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
  },
  unreachable: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  unreachableText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
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
