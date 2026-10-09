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
  chatCompletionsStream,
  clearPreferredBase,
  clientStatus,
  probeReachability,
} from "../../src/lib/api";
import { ModelSwitcher } from "../../src/components/ModelSwitcher";
import { Disclosure } from "../../src/components/ui";
import { saveThread, loadThreads } from "../../src/lib/chatHistory";
import { threadTitle, type LocalThread } from "../../src/lib/chatThreads";
import { fetchConversation, fetchConversations } from "../../src/lib/conversations";
import type { ServerConversation } from "../../src/lib/conversationParse";
import { openCitationUrl } from "../../src/lib/homeOpeners";
import { runObservationCycle } from "../../src/lib/observation";
import { loadSession } from "../../src/lib/session";
import type { ChatMessage } from "../../src/lib/types";
import { colors, space } from "../../src/lib/theme";

const URL_RE = /https?:\/\/[^\s)]+/g;

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [threads, setThreads] = useState<LocalThread[]>([]);
  const [serverThreads, setServerThreads] = useState<ServerConversation[]>([]);
  const [serverNote, setServerNote] = useState("");
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
      await clientStatus().catch(() => undefined);
      const probe = await probeReachability();
      if (probe.ok) {
        const underlay = net?.type ? ` · ${net.type}` : "";
        const via =
          probe.mode === "https" ? "Away HTTPS" : probe.mode === "lan" ? "home Wi‑Fi" : "Home VPN";
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
      setStatusLine("Reaching home… Chat uses Wi‑Fi or Away HTTPS (Home VPN optional)");
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    setThreads(await loadThreads());
    try {
      const remote = await fetchConversations();
      setServerThreads(remote.supported ? remote.conversations : []);
      setServerNote(
        remote.supported
          ? ""
          : "This home server doesn’t share Chat history. Threads you start here stay on this phone.",
      );
    } catch (error) {
      setServerNote(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshHistory();
    void runObservationCycle().catch(() => undefined);
    const sub = Network.addNetworkStateListener(() => {
      clearPreferredBase();
      void refreshStatus();
    });
    return () => sub.remove();
  }, [refreshHistory, refreshStatus]);

  function openLocal(thread: LocalThread) {
    setThreadId(thread.id);
    setConversationId(thread.conversationId || null);
    setMessages(thread.messages);
  }

  async function openServer(conversation: ServerConversation) {
    setBusy(true);
    try {
      const detail =
        conversation.messages.length > 0 ? conversation : await fetchConversation(conversation.id);
      const next = detail?.messages?.length ? detail.messages : conversation.messages;
      setThreadId(conversation.id);
      setConversationId(conversation.id);
      setMessages(next);
      if (!next.length) {
        setServerNote("That conversation didn’t include messages.");
      }
    } catch (error) {
      setServerNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function newChat() {
    setThreadId("");
    setConversationId(null);
    setMessages([]);
    setInput("");
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const id = threadId || `local-${Date.now()}`;
    const next = [...messages, { role: "user" as const, content: text }];
    setThreadId(id);
    setMessages(next);
    setInput("");
    setBusy(true);
    let assistant = "";
    try {
      clearPreferredBase();
      const result = await chatCompletionsStream(next, (content) => {
        assistant = content;
        setMessages([...next, { role: "assistant", content }]);
      });
      assistant = result.content || "Home replied with nothing.";
      setNeedsRepair(false);
      const stored = [
        ...next,
        ...(assistant ? [{ role: "assistant" as const, content: assistant }] : []),
      ];
      const nextConversationId = result.conversationId || conversationId;
      setConversationId(nextConversationId);
      setMessages(stored);
      setThreads(
        await saveThread({
          id,
          title: threadTitle(stored),
          updatedAt: Date.now(),
          messages: stored,
          conversationId: nextConversationId,
        }),
      );
      await refreshStatus();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const unpaired = error instanceof NotPairedError;
      const authFail =
        !unpaired &&
        ((error instanceof ApiError && error.status === 401) ||
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
      const content = unpaired
        ? `${msg}\n\nTap Pair with home above.`
        : authFail
          ? `${msg}\n\nTap Re-pair below (home Wi‑Fi), scan a fresh dashboard QR, then send again.`
          : error instanceof ApiError && error.status === 400
            ? msg
            : msg.startsWith("Couldn’t reach home")
              ? msg
              : `Could not reach home: ${msg}`;
      const stored = [...next, { role: "assistant" as const, content }];
      setMessages(stored);
      setThreads(
        await saveThread({ id, title: threadTitle(stored), updatedAt: Date.now(), messages: stored }),
      );
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
        <Pressable style={styles.repairBanner} onPress={() => router.push("/pair")} accessibilityRole="button">
          <Text style={styles.repairText}>Re-pair on home Wi‑Fi — scan a fresh Remote Access QR</Text>
        </Pressable>
      ) : null}
      {connected ? <ModelSwitcher presentation="chip" /> : null}
      <View style={styles.history}>
        <Disclosure title="History">
          <Pressable onPress={newChat} accessibilityRole="button">
            <Text style={styles.repairAction}>New chat</Text>
          </Pressable>
          {threads.map((thread) => (
            <Pressable key={thread.id} onPress={() => openLocal(thread)} accessibilityRole="button">
              <Text style={styles.thread}>{thread.title}</Text>
            </Pressable>
          ))}
          {serverNote ? <Text style={styles.serverNote}>{serverNote}</Text> : null}
          {serverThreads.map((conversation) => (
            <Pressable
              key={conversation.id}
              onPress={() => void openServer(conversation)}
              accessibilityRole="button"
            >
              <Text style={styles.thread}>{conversation.title}</Text>
            </Pressable>
          ))}
          {threads.length === 0 && serverThreads.length === 0 ? (
            <Text style={styles.serverNote}>No earlier chats on this phone yet.</Text>
          ) : null}
        </Disclosure>
      </View>
      <FlatList
        style={styles.list}
        data={messages}
        keyExtractor={(_, index) => String(index)}
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.user : styles.assistant]}>
            <Text style={styles.bubbleText}>{item.content}</Text>
            {(item.content.match(URL_RE) || []).map((url) => (
              <Pressable
                key={url}
                onPress={() => void openCitationUrl(url).catch(() => Linking.openURL(url))}
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
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send</Text>}
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
  history: { paddingHorizontal: space.md, paddingTop: space.xs },
  thread: { color: colors.text, paddingVertical: 6 },
  serverNote: { color: colors.muted, lineHeight: 18, fontSize: 13 },
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
  unreachableText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  list: { flex: 1 },
  empty: { color: colors.muted, lineHeight: 22 },
  bubble: { padding: space.md, borderRadius: 14, maxWidth: "92%" },
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
