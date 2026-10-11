import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { ChatMessageBody } from "../../src/components/ChatMessageBody";
import { ModelSwitcher } from "../../src/components/ModelSwitcher";
import { Icon } from "../../src/components/Icon";
import {
  EmptyState,
  Group,
  IconButton,
  ListRow,
  Note,
  ScreenTitle,
  Sheet,
  StatusChip,
  type Tone,
} from "../../src/components/ui";
import { onApprovalsChanged } from "../../src/lib/approvalEvents";
import { decideApproval, fetchApprovals } from "../../src/lib/approvals";
import { saveThread, loadThreads } from "../../src/lib/chatHistory";
import { threadTitle, type LocalThread } from "../../src/lib/chatThreads";
import { fetchConversation, fetchConversations } from "../../src/lib/conversations";
import type { ServerConversation } from "../../src/lib/conversationParse";
import { runObservationCycle } from "../../src/lib/observation";
import { loadSession } from "../../src/lib/session";
import type { ChatMessage } from "../../src/lib/types";
import { colors, radius, space } from "../../src/lib/theme";

const SUGGESTIONS = [
  "What’s the status of my server?",
  "Find my FPV folder in Nextcloud",
  "Fix the StrikeNote sync bug",
];

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
  const [via, setVia] = useState<{ label: string; tone: Tone }>({ label: "Connecting…", tone: "muted" });
  const [historyOpen, setHistoryOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const [needsRepair, setNeedsRepair] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pendingApprovalIds, setPendingApprovalIds] = useState<string[]>([]);
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
        setVia({ label: "Not paired", tone: "warn" });
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
        setVia({ label: probe.mode === "https" ? "Away" : probe.mode === "lan" ? "Home Wi‑Fi" : "Home VPN", tone: "ok" });
        setNeedsRepair(false);
        setConnected(true);
        setBanner(null);
        return;
      }
      setConnected(false);
      setNeedsRepair(false);
      if (probe.reason === "not_paired") {
        setStatusLine("Not paired");
        setVia({ label: "Not paired", tone: "warn" });
        setBanner({ kind: "unpaired", message: probe.message });
        return;
      }
      setStatusLine("Home unreachable");
      setVia({ label: "Offline", tone: "danger" });
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
    const loadPending = async () => {
      try {
        const next = await fetchApprovals();
        setPendingApprovalIds(next.supported ? next.items.map((item) => item.id) : []);
      } catch {
        setPendingApprovalIds([]);
      }
    };
    void loadPending();
    return onApprovalsChanged(() => void loadPending());
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshHistory();
    void runObservationCycle({ maxPasses: 2 }).catch(() => undefined);
    const sub = Network.addNetworkStateListener(() => {
      clearPreferredBase();
      void refreshStatus();
    });
    return () => sub.remove();
  }, [refreshHistory, refreshStatus]);

  function openLocal(thread: LocalThread) {
    setHistoryOpen(false);
    setThreadId(thread.id);
    setConversationId(thread.conversationId || null);
    setMessages(thread.messages);
  }

  async function openServer(conversation: ServerConversation) {
    setHistoryOpen(false);
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
    setHistoryOpen(false);
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
    let extras: Pick<ChatMessage, "toolCalls" | "citations" | "embeddingRoute"> = {};
    try {
      clearPreferredBase();
      const result = await chatCompletionsStream(next, (content, live) => {
        assistant = content;
        extras = {
          toolCalls: live.toolCalls,
          citations: live.citations,
          embeddingRoute: live.embeddingRoute,
        };
        setMessages([...next, { role: "assistant", content, ...extras }]);
      });
      assistant = result.content;
      extras = {
        toolCalls: result.toolCalls,
        citations: result.citations,
        embeddingRoute: result.embeddingRoute,
      };
      if (!assistant && !result.toolCalls.length && !result.citations.length) {
        assistant = "Home replied with nothing.";
      }
      setNeedsRepair(false);
      const stored = [
        ...next,
        { role: "assistant" as const, content: assistant, ...extras },
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

  async function decideInline(id: string, decision: "allow" | "deny") {
    try {
      await decideApproval(id, decision);
      setPendingApprovalIds((current) => current.filter((item) => item !== id));
    } catch (error) {
      Alert.alert("Couldn’t record that", error instanceof Error ? error.message : String(error));
    }
  }

  const canSend = Boolean(input.trim()) && !busy;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <ScreenTitle
          title="Chat"
          right={
            <>
              <IconButton icon="history" label="Chat history" onPress={() => setHistoryOpen(true)} testID="chat-history" />
              <IconButton icon="new-chat" label="New chat" onPress={newChat} testID="chat-new" />
            </>
          }
        />
        <View style={styles.meta}>
          <View accessibilityLabel={statusLine}>
            <StatusChip label={via.label} tone={via.tone} />
          </View>
          {connected ? <ModelSwitcher presentation="chip" /> : null}
        </View>
      </View>

      {banner?.kind === "unpaired" ? (
        <Pressable
          style={styles.banner}
          onPress={() => router.push("/pair")}
          accessibilityRole="button"
          accessibilityLabel="Pair this phone with home"
          testID="pair-banner"
        >
          <Note tone="warn" icon="link">
            {banner.message}
            {"\n"}
            <Text style={styles.bannerAction}>Pair with home</Text>
          </Note>
        </Pressable>
      ) : null}
      {banner?.kind === "unreachable" ? (
        <View style={styles.banner} testID="unreachable-banner">
          <Note tone="danger">
            {banner.message}
            {banner.suggestPair ? "\n" : ""}
            {banner.suggestPair ? (
              <Text
                style={styles.bannerAction}
                onPress={() => router.push("/pair")}
                accessibilityRole="button"
                accessibilityLabel="Re-pair on home Wi-Fi"
              >
                Re-pair on home Wi‑Fi
              </Text>
            ) : null}
          </Note>
        </View>
      ) : null}
      {needsRepair ? (
        <Pressable style={styles.banner} onPress={() => router.push("/pair")} accessibilityRole="button">
          <Note tone="warn">Home rejected this phone’s token. Re-pair on home Wi‑Fi with a fresh Remote Access QR.</Note>
        </Pressable>
      ) : null}

      <FlatList
        style={styles.list}
        data={messages}
        keyExtractor={(_, index) => String(index)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={messages.length ? styles.listContent : styles.listEmpty}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.user : styles.assistant]}>
            <ChatMessageBody
              message={item}
              pendingApprovalIds={pendingApprovalIds}
              onDecide={(id, decision) => void decideInline(id, decision)}
            />
          </View>
        )}
        ListFooterComponent={
          busy && messages[messages.length - 1]?.role === "user" ? (
            <View style={[styles.bubble, styles.assistant, styles.typing]}>
              <ActivityIndicator color={colors.muted} size="small" />
              <Text style={styles.typingText}>Thinking…</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          banner?.kind === "unpaired" ? (
            <EmptyState
              icon="link"
              title="Pair this phone"
              body="Scan the pair QR from your home dashboard to chat. Your models stay on your server."
            />
          ) : (
            <EmptyState
              icon="sparkles"
              title="Ask AtleyOS anything"
              body="Answers come from the models and files on your home server."
            >
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((text) => (
                  <Pressable
                    key={text}
                    style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}
                    onPress={() => setInput(text)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.suggestionText}>{text}</Text>
                  </Pressable>
                ))}
              </View>
            </EmptyState>
          )
        }
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message AtleyOS"
          placeholderTextColor={colors.faint}
          editable={!busy}
          multiline
          maxLength={8000}
          onSubmitEditing={() => void send()}
          blurOnSubmit={false}
          testID="chat-input"
        />
        <Pressable
          style={[styles.send, !canSend && styles.sendIdle]}
          onPress={() => void send()}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send"
          testID="chat-send"
        >
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="send" size={20} color="#fff" />}
        </Pressable>
      </View>

      <Sheet visible={historyOpen} onClose={() => setHistoryOpen(false)} title="Chats">
        <Group>
          <ListRow icon="new-chat" title="New chat" onPress={newChat} />
        </Group>
        {threads.length ? (
          <Group>
            {threads.map((thread) => (
              <ListRow
                key={thread.id}
                icon="phone"
                tone="muted"
                title={thread.title}
                subtitle="On this phone"
                onPress={() => openLocal(thread)}
              />
            ))}
          </Group>
        ) : null}
        {serverThreads.length ? (
          <Group>
            {serverThreads.map((conversation) => (
              <ListRow
                key={conversation.id}
                icon="chat"
                tone="muted"
                title={conversation.title}
                subtitle="From home"
                onPress={() => void openServer(conversation)}
              />
            ))}
          </Group>
        ) : null}
        {serverNote ? <Note>{serverNote}</Note> : null}
        {threads.length === 0 && serverThreads.length === 0 && !serverNote ? (
          <Text style={styles.sheetEmpty}>No earlier chats yet.</Text>
        ) : null}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.md, paddingBottom: space.sm, gap: space.xs },
  meta: { flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" },
  banner: { paddingHorizontal: space.md, paddingBottom: space.xs },
  bannerAction: { color: colors.accent, fontWeight: "700" },
  list: { flex: 1 },
  listContent: { padding: space.md, gap: space.sm },
  listEmpty: { flexGrow: 1, justifyContent: "center", padding: space.md },
  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, maxWidth: "86%" },
  user: { alignSelf: "flex-end", backgroundColor: colors.accentDim, borderBottomRightRadius: 6 },
  assistant: { alignSelf: "flex-start", backgroundColor: colors.surface, borderBottomLeftRadius: 6 },
  typing: { flexDirection: "row", alignItems: "center", gap: space.xs },
  typingText: { color: colors.muted, fontSize: 14 },
  suggestions: { gap: space.xs, alignSelf: "stretch", marginTop: space.sm },
  suggestion: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: space.md,
  },
  suggestionText: { color: colors.text, fontSize: 14 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingHorizontal: space.md,
    paddingTop: 12,
    paddingBottom: 12,
    color: colors.text,
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendIdle: { backgroundColor: colors.surfaceRaised },
  sheetEmpty: { color: colors.muted, textAlign: "center", paddingVertical: space.md },
});
