import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Network from "expo-network";
import { router, useLocalSearchParams } from "expo-router";
import {
  ATTACHMENT_LIMITS,
  NotPairedError,
  UNPAIRED_MESSAGE,
  chatCompletionsStream,
  chatStopControl,
  uploadAttachment,
  type ChatStopControl,
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
  GroupLabel,
  IconButton,
  ListRow,
  MenuButton,
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
import {
  archiveChat,
  deleteChat,
  exportChat,
  friendlyChatError,
  groupChats,
  listChats,
  pinChat,
  renameChat,
  truncateChat,
  type ChatRow,
} from "../../src/lib/chatManage";
import type { ServerConversation } from "../../src/lib/conversationParse";
import { runObservationCycle } from "../../src/lib/observation";
import { loadSession } from "../../src/lib/session";
import type { ChatAttachment, ChatMessage } from "../../src/lib/types";
import { colors, radius, space } from "../../src/lib/theme";

const SUGGESTIONS = [
  "What’s the status of my server?",
  "Find my FPV folder in Nextcloud",
  "Fix the StrikeNote sync bug",
];

type Pending = ChatAttachment & { uploading?: boolean; failed?: string };

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function plainExport(title: string, messages: ChatMessage[]): string {
  return [`# ${title}`, ...messages.map((m) => `**${m.role === "user" ? "You" : "AtleyOS"}:** ${m.content}`)].join("\n\n");
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{ send?: string; draft?: string; conversation?: string; fresh?: string; nonce?: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rows, setRows] = useState<ChatRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [menuChat, setMenuChat] = useState<ChatRow | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [editing, setEditing] = useState<{ messageId: string } | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [msgMenu, setMsgMenu] = useState<{ message: ChatMessage; index: number } | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const stopRef = useRef<ChatStopControl | null>(null);
  const handledNonce = useRef("");
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

  const refreshHistory = useCallback(async (q = "", archived = false) => {
    setThreads(await loadThreads());
    try {
      const managed = await listChats({ q, archived });
      if (managed) {
        setRows(managed);
        setServerThreads([]);
        setServerNote("");
        return;
      }
      setRows(null);
    } catch (error) {
      setServerNote(friendlyChatError(error).text);
      return;
    }
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

  async function openRow(row: ChatRow) {
    await openServer({ id: row.id, title: row.title, messages: [] } as unknown as ServerConversation);
  }

  async function openServer(conversation: ServerConversation) {
    setHistoryOpen(false);
    setEditing(null);
    setPending([]);
    setBusy(true);
    try {
      const detail =
        conversation.messages.length > 0 ? conversation : await fetchConversation(conversation.id);
      const next = detail?.messages?.length ? detail.messages : conversation.messages;
      setThreadId(conversation.id);
      setConversationId(conversation.id);
      setMessages(next);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
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
    setPending([]);
    setEditing(null);
  }

  /** Pull home's copy so messages carry ids (Regenerate / Edit) and attachments. */
  async function syncFromHome(cid: string | null) {
    if (!cid) return;
    try {
      const detail = await fetchConversation(cid);
      if (detail?.messages?.length && detail.messages.some((m) => m.id)) setMessages(detail.messages);
    } catch {
      /* the local copy is fine */
    }
  }

  async function pickFiles() {
    if (pending.length >= ATTACHMENT_LIMITS.perMessage) {
      Alert.alert("Attachments", `Up to ${ATTACHMENT_LIMITS.perMessage} files per message.`);
      return;
    }
    const picked = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true });
    if (picked.canceled) return;
    for (const asset of picked.assets.slice(0, ATTACHMENT_LIMITS.perMessage - pending.length)) {
      const mime = asset.mimeType || "application/octet-stream";
      const cap = mime.startsWith("image/") ? ATTACHMENT_LIMITS.imageBytes : ATTACHMENT_LIMITS.fileBytes;
      if (asset.size && asset.size > cap) {
        Alert.alert("Too big", `${asset.name} is ${formatSize(asset.size)}. The limit is ${formatSize(cap)}.`);
        continue;
      }
      const temp = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const row: Pending = {
        id: temp,
        name: asset.name,
        mime,
        size: asset.size || 0,
        kind: mime.startsWith("image/") ? "image" : "file",
        localUri: asset.uri,
        uploading: true,
      };
      setPending((current) => [...current, row]);
      try {
        const saved = await uploadAttachment({ uri: asset.uri, name: asset.name, mime, conversationId });
        setPending((current) => current.map((p) => (p.id === temp ? { ...p, ...saved, localUri: asset.uri, uploading: false } : p)));
      } catch (error) {
        setPending((current) =>
          current.map((p) => (p.id === temp ? { ...p, uploading: false, failed: friendlyChatError(error).text } : p)),
        );
      }
    }
  }

  function stop() {
    stopRef.current?.stop();
  }

  async function copyMessage(message: ChatMessage) {
    await Clipboard.setStringAsync(message.content);
  }

  function lastUserIndex(before = messages.length): number {
    for (let i = before - 1; i >= 0; i--) if (messages[i].role === "user") return i;
    return -1;
  }

  /** Regenerate / Retry: drop the last answer at home and ask again. */
  async function regenerate() {
    const index = lastUserIndex();
    if (index < 0 || busy) return;
    const user = messages[index];
    const base = messages.slice(0, index);
    if (conversationId && user.id) {
      try {
        const cut = await truncateChat(conversationId, user.id);
        await send({
          text: cut.text || user.content,
          attachments: user.attachments || [],
          base,
        });
        return;
      } catch (error) {
        Alert.alert("Regenerate", friendlyChatError(error).text);
        return;
      }
    }
    await send({ text: user.content, attachments: user.attachments || [], base });
  }

  function startEdit(message: ChatMessage) {
    if (!message.id || !conversationId) {
      setInput(message.content);
      return;
    }
    setEditing({ messageId: message.id });
    setInput(message.content);
    setPending((message.attachments || []).map((a) => ({ ...a })));
  }

  async function shareChat(id: string | null, title: string) {
    let text = "";
    if (id) {
      try {
        text = await exportChat(id);
      } catch {
        text = "";
      }
    }
    if (!text) text = plainExport(title, messages);
    await Share.share({ message: text, title });
  }

  function confirmDelete(id: string, title: string) {
    Alert.alert("Delete this chat?", `“${title}” and its attachments are removed from home. This can’t be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void (async () => {
            try {
              await deleteChat(id);
              if (id === conversationId) newChat();
              await refreshHistory(query, showArchived);
            } catch (error) {
              Alert.alert("Delete", friendlyChatError(error).text);
            }
          })(),
      },
    ]);
  }

  async function chatAction(row: { id: string; title: string; pinned?: boolean; archived?: boolean }, action: string) {
    setMenuChat(null);
    try {
      if (action === "rename") setRenaming({ id: row.id, title: row.title });
      else if (action === "pin") await pinChat(row.id, !row.pinned);
      else if (action === "archive") {
        await archiveChat(row.id, !row.archived);
        if (row.id === conversationId && !row.archived) newChat();
      } else if (action === "share") await shareChat(row.id, row.title);
      else if (action === "delete") confirmDelete(row.id, row.title);
      if (action === "pin" || action === "archive") await refreshHistory(query, showArchived);
    } catch (error) {
      Alert.alert("Chat", friendlyChatError(error).text);
    }
  }

  async function saveRename() {
    if (!renaming) return;
    const title = renaming.title.trim();
    if (!title) return;
    try {
      await renameChat(renaming.id, title);
      setRenaming(null);
      await refreshHistory(query, showArchived);
    } catch (error) {
      Alert.alert("Rename", friendlyChatError(error).text);
    }
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    setAtBottom(contentSize.height - contentOffset.y - layoutMeasurement.height < 80);
  }

  async function send(override?: { text: string; attachments: ChatAttachment[]; base: ChatMessage[]; fresh?: boolean }) {
    const text = (override ? override.text : input).trim();
    const ready = override ? override.attachments : pending.filter((p) => !p.uploading && !p.failed);
    if ((!text && !ready.length) || busy) return;
    if (!override && pending.some((p) => p.uploading)) {
      Alert.alert("Attachments", "Wait for the files to finish uploading.");
      return;
    }
    let base = override ? override.base : messages;
    if (!override && editing && conversationId) {
      try {
        await truncateChat(conversationId, editing.messageId);
        const cut = messages.findIndex((m) => m.id === editing.messageId);
        if (cut >= 0) base = messages.slice(0, cut);
      } catch (error) {
        Alert.alert("Edit", friendlyChatError(error).text);
        return;
      }
    }
    setEditing(null);
    const fresh = Boolean(override?.fresh);
    const cid = fresh ? null : conversationId;
    const id = (!fresh && threadId) || `local-${Date.now()}`;
    const userMessage: ChatMessage = { role: "user", content: text, ...(ready.length ? { attachments: ready } : {}) };
    const next = [...base, userMessage];
    setThreadId(id);
    setMessages(next);
    if (!override) {
      setInput("");
      setPending([]);
    }
    setBusy(true);
    setAtBottom(true);
    const control = chatStopControl();
    stopRef.current = control;
    let assistant = "";
    let extras: Pick<ChatMessage, "toolCalls" | "citations" | "embeddingRoute"> = {};
    try {
      clearPreferredBase();
      const result = await chatCompletionsStream(
        next.map((m) => ({ role: m.role, content: m.content })),
        (content, live) => {
          assistant = content;
          extras = {
            toolCalls: live.toolCalls,
            citations: live.citations,
            embeddingRoute: live.embeddingRoute,
          };
          setMessages([...next, { role: "assistant", content, ...extras }]);
        },
        {
          conversationId: cid,
          chatId: id,
          attachmentIds: ready.map((a) => a.id).filter((a) => a.startsWith("att_")),
          control,
        },
      );
      assistant = result.content;
      extras = {
        toolCalls: result.toolCalls,
        citations: result.citations,
        embeddingRoute: result.embeddingRoute,
      };
      if (result.stopped) assistant = `${assistant}${assistant ? "\n\n" : ""}_(Stopped)_`;
      if (!assistant && !result.toolCalls.length && !result.citations.length) {
        assistant = "Home replied with nothing.";
      }
      setNeedsRepair(false);
      const stored = [...next, { role: "assistant" as const, content: assistant, ...extras }];
      const nextConversationId = result.conversationId || cid;
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
      // Home may still be finishing the stopped reply; give it a moment before reading ids back.
      setTimeout(() => void syncFromHome(nextConversationId), result.stopped ? 1500 : 300);
      await refreshStatus();
    } catch (error) {
      const friendly = friendlyChatError(error);
      if (friendly.pair) {
        setConnected(false);
        setNeedsRepair(false);
        setStatusLine("Not paired");
        setBanner({ kind: "unpaired", message: error instanceof Error ? error.message : String(error) });
      } else if (friendly.repair) {
        setNeedsRepair(true);
        setStatusLine("Home rejected this phone — re-pair on home Wi‑Fi");
      }
      const stored = [...next, { role: "assistant" as const, content: friendly.text, error: true }];
      setMessages(stored);
      setThreads(await saveThread({ id, title: threadTitle(stored), updatedAt: Date.now(), messages: stored, conversationId: cid }));
    } finally {
      stopRef.current = null;
      setBusy(false);
    }
  }

  // Fix it (Inbox) sends its prompt in a fresh chat; Ask a follow-up opens the plan's chat with a draft.
  useEffect(() => {
    const nonce = String(params.nonce || "");
    if (!nonce || handledNonce.current === nonce) return;
    handledNonce.current = nonce;
    void (async () => {
      if (params.conversation) {
        await openServer({ id: String(params.conversation), title: "", messages: [] } as unknown as ServerConversation);
      } else if (params.fresh) {
        newChat();
      }
      if (params.draft) setInput(String(params.draft));
      if (params.send) {
        await send({ text: String(params.send), attachments: [], base: [], fresh: !params.conversation });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.nonce]);

  async function decideInline(id: string, decision: "allow" | "deny") {
    try {
      await decideApproval(id, decision);
      setPendingApprovalIds((current) => current.filter((item) => item !== id));
    } catch (error) {
      Alert.alert("Couldn’t record that", error instanceof Error ? error.message : String(error));
    }
  }

  const readyCount = pending.filter((p) => !p.uploading && !p.failed).length;
  const canSend = (Boolean(input.trim()) || readyCount > 0) && !busy && !pending.some((p) => p.uploading);
  const currentRow = rows?.find((row) => row.id === conversationId) || null;
  const currentTitle = currentRow?.title || (messages.length ? threadTitle(messages) : "New chat");
  const lastAssistant = messages.length && messages[messages.length - 1].role === "assistant" ? messages.length - 1 : -1;

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
              <IconButton
                icon="history"
                label="Chat history"
                onPress={() => {
                  setHistoryOpen(true);
                  void refreshHistory(query, showArchived);
                }}
                testID="chat-history"
              />
              <IconButton icon="new-chat" label="New chat" onPress={newChat} testID="chat-new" />
              {messages.length ? (
                <MenuButton
                  title="This chat"
                  testID="chat-menu"
                  actions={[
                    { label: "Share or export", icon: "share", onPress: () => void shareChat(conversationId, currentTitle) },
                    ...(conversationId
                      ? [
                          { label: "Rename", icon: "edit" as const, onPress: () => setRenaming({ id: conversationId, title: currentTitle }) },
                          {
                            label: currentRow?.pinned ? "Unpin" : "Pin",
                            icon: "pin" as const,
                            onPress: () => void chatAction({ id: conversationId, title: currentTitle, pinned: currentRow?.pinned }, "pin"),
                          },
                          { label: "Archive", icon: "archive" as const, onPress: () => void chatAction({ id: conversationId, title: currentTitle }, "archive") },
                          { label: "Delete", icon: "trash" as const, danger: true, onPress: () => confirmDelete(conversationId, currentTitle) },
                        ]
                      : []),
                  ]}
                />
              ) : null}
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
        ref={listRef}
        style={styles.list}
        data={messages}
        onScroll={onScroll}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (atBottom) listRef.current?.scrollToEnd({ animated: false });
        }}
        keyExtractor={(_, index) => String(index)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={messages.length ? styles.listContent : styles.listEmpty}
        renderItem={({ item, index }) => (
          <View style={item.role === "user" ? styles.userWrap : styles.assistantWrap}>
            <Pressable
              onLongPress={() => setMsgMenu({ message: item, index })}
              delayLongPress={300}
              style={[styles.bubble, item.role === "user" ? styles.user : styles.assistant, item.error && styles.errorBubble]}
              accessibilityHint="Long-press for Copy, Edit, or Regenerate"
            >
              {item.attachments?.length ? (
                <View style={styles.attachRow}>
                  {item.attachments.map((att) =>
                    att.kind === "image" && att.localUri ? (
                      <Image key={att.id} source={{ uri: att.localUri }} style={styles.thumb} />
                    ) : (
                      <View key={att.id} style={styles.fileChip}>
                        <Icon name={att.kind === "image" ? "image" : "file"} size={14} color={colors.muted} />
                        <Text style={styles.fileChipText} numberOfLines={1}>
                          {att.name}
                        </Text>
                      </View>
                    ),
                  )}
                </View>
              ) : null}
              <ChatMessageBody
                message={item}
                pendingApprovalIds={pendingApprovalIds}
                onDecide={(id, decision) => void decideInline(id, decision)}
              />
            </Pressable>
            {item.role === "assistant" && !busy ? (
              <View style={styles.msgActions}>
                <Pressable onPress={() => void copyMessage(item)} accessibilityRole="button" accessibilityLabel="Copy reply" hitSlop={6}>
                  <Icon name="copy" size={15} color={colors.faint} />
                </Pressable>
                {index === lastAssistant ? (
                  <Pressable onPress={() => void regenerate()} accessibilityRole="button" accessibilityLabel={item.error ? "Retry" : "Regenerate"} hitSlop={6}>
                    <View style={styles.inlineAction}>
                      <Icon name="refresh" size={15} color={item.error ? colors.accent : colors.faint} />
                      {item.error ? <Text style={styles.retryText}>Retry</Text> : null}
                    </View>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
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

      {!atBottom && messages.length ? (
        <Pressable
          style={styles.toBottom}
          onPress={() => {
            listRef.current?.scrollToEnd({ animated: true });
            setAtBottom(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Scroll to the newest message"
          testID="chat-scroll-bottom"
        >
          <Icon name="arrow-down" size={18} color={colors.text} />
        </Pressable>
      ) : null}

      {editing ? (
        <View style={styles.editBar}>
          <Text style={styles.editText}>Editing your message. Sending replaces it and everything after it.</Text>
          <Pressable
            onPress={() => {
              setEditing(null);
              setInput("");
              setPending([]);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {pending.length ? (
        <View style={styles.tray} testID="chat-pending">
          {pending.map((p) => (
            <View key={p.id} style={[styles.fileChip, p.failed && styles.chipFailed]}>
              {p.kind === "image" && p.localUri ? (
                <Image source={{ uri: p.localUri }} style={styles.chipThumb} />
              ) : (
                <Icon name="file" size={14} color={colors.muted} />
              )}
              <Text style={styles.fileChipText} numberOfLines={1}>
                {p.failed ? `${p.name}: ${p.failed}` : `${p.name} · ${formatSize(p.size)}`}
              </Text>
              {p.uploading ? <ActivityIndicator size="small" color={colors.muted} /> : null}
              <Pressable
                onPress={() => setPending((current) => current.filter((x) => x.id !== p.id))}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${p.name}`}
                hitSlop={8}
              >
                <Icon name="close" size={14} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.composer}>
        <Pressable
          style={styles.attach}
          onPress={() => void pickFiles()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Attach a photo or file"
          testID="chat-attach"
        >
          <Icon name="paperclip" size={20} color={busy ? colors.faint : colors.muted} />
        </Pressable>
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
        {busy ? (
          <Pressable
            style={[styles.send, styles.stopBtn]}
            onPress={stop}
            accessibilityRole="button"
            accessibilityLabel="Stop"
            testID="chat-stop"
          >
            <Icon name="stop" size={18} color="#fff" />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.send, !canSend && styles.sendIdle]}
            onPress={() => void send()}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
            testID="chat-send"
          >
            <Icon name="send" size={20} color="#fff" />
          </Pressable>
        )}
      </View>

      <Sheet visible={historyOpen} onClose={() => setHistoryOpen(false)} title={showArchived ? "Archived chats" : "Chats"}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void refreshHistory(query, showArchived)}
          onEndEditing={() => void refreshHistory(query, showArchived)}
          placeholder="Search chats"
          placeholderTextColor={colors.faint}
          returnKeyType="search"
          autoCapitalize="none"
          testID="chat-search"
        />
        <Group>
          <ListRow icon="new-chat" title="New chat" onPress={newChat} />
        </Group>
        {rows
          ? groupChats(rows).map((group) => (
              <View key={group.label}>
                <GroupLabel>{group.label}</GroupLabel>
                <Group>
                  {group.rows.map((row) => (
                    <ListRow
                      key={row.id}
                      icon={row.pinned ? "pin" : "chat"}
                      tone="muted"
                      title={row.title}
                      subtitle={row.match && row.match !== "title" ? row.match : row.preview}
                      onPress={() => void openRow(row)}
                      right={
                        <IconButton
                          icon="more"
                          label={`More for ${row.title}`}
                          color={colors.muted}
                          onPress={() => {
                            setHistoryOpen(false);
                            setMenuChat(row);
                          }}
                        />
                      }
                    />
                  ))}
                </Group>
              </View>
            ))
          : null}
        {rows && rows.length === 0 ? (
          <Text style={styles.sheetEmpty}>{query ? "No chats match." : showArchived ? "No archived chats." : "No chats at home yet."}</Text>
        ) : null}
        {threads.filter((t) => !t.conversationId).length && !showArchived ? (
          <View>
            <GroupLabel>On this phone</GroupLabel>
            <Group>
              {threads
                .filter((t) => !t.conversationId)
                .map((thread) => (
                  <ListRow key={thread.id} icon="phone" tone="muted" title={thread.title} onPress={() => openLocal(thread)} />
                ))}
            </Group>
          </View>
        ) : null}
        {!rows && serverThreads.length ? (
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
        {rows ? (
          <Pressable
            onPress={() => {
              const next = !showArchived;
              setShowArchived(next);
              void refreshHistory(query, next);
            }}
            accessibilityRole="button"
            style={styles.archivedLink}
          >
            <Text style={styles.retryText}>{showArchived ? "Back to chats" : "Archived chats"}</Text>
          </Pressable>
        ) : null}
      </Sheet>

      <Sheet visible={menuChat != null} onClose={() => setMenuChat(null)} title={menuChat?.title}>
        {menuChat ? (
          <Group>
            <ListRow icon="edit" title="Rename" onPress={() => void chatAction(menuChat, "rename")} />
            {!menuChat.archived ? (
              <ListRow icon="pin" title={menuChat.pinned ? "Unpin" : "Pin"} onPress={() => void chatAction(menuChat, "pin")} />
            ) : null}
            <ListRow icon="share" title="Share or export" onPress={() => void chatAction(menuChat, "share")} />
            <ListRow
              icon="archive"
              title={menuChat.archived ? "Restore from archive" : "Archive"}
              onPress={() => void chatAction(menuChat, "archive")}
            />
            <ListRow icon="trash" danger title="Delete" onPress={() => void chatAction(menuChat, "delete")} />
          </Group>
        ) : null}
      </Sheet>

      <Sheet visible={renaming != null} onClose={() => setRenaming(null)} title="Rename chat">
        <TextInput
          style={styles.search}
          value={renaming?.title || ""}
          onChangeText={(title) => setRenaming((current) => (current ? { ...current, title } : current))}
          onSubmitEditing={() => void saveRename()}
          autoFocus
          maxLength={120}
          placeholder="Chat name"
          placeholderTextColor={colors.faint}
          testID="chat-rename-input"
        />
        <Pressable style={styles.saveBtn} onPress={() => void saveRename()} accessibilityRole="button">
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </Sheet>

      <Sheet visible={msgMenu != null} onClose={() => setMsgMenu(null)} title={msgMenu?.message.role === "user" ? "Your message" : "Reply"}>
        {msgMenu ? (
          <Group>
            <ListRow
              icon="copy"
              title="Copy"
              onPress={() => {
                void copyMessage(msgMenu.message);
                setMsgMenu(null);
              }}
            />
            {msgMenu.message.role === "user" && !busy ? (
              <ListRow
                icon="edit"
                title="Edit and resend"
                onPress={() => {
                  startEdit(msgMenu.message);
                  setMsgMenu(null);
                }}
              />
            ) : null}
            {msgMenu.index === lastAssistant && !busy ? (
              <ListRow
                icon="refresh"
                title={msgMenu.message.error ? "Retry" : "Regenerate"}
                onPress={() => {
                  setMsgMenu(null);
                  void regenerate();
                }}
              />
            ) : null}
          </Group>
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
  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18 },
  userWrap: { alignSelf: "flex-end", maxWidth: "86%" },
  assistantWrap: { alignSelf: "flex-start", maxWidth: "92%", gap: 4 },
  user: { backgroundColor: colors.accentDim, borderBottomRightRadius: 6 },
  assistant: { backgroundColor: colors.surface, borderBottomLeftRadius: 6 },
  errorBubble: { backgroundColor: colors.dangerSoft },
  msgActions: { flexDirection: "row", gap: space.md, paddingHorizontal: space.xs },
  inlineAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  retryText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  attachRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  thumb: { width: 120, height: 120, borderRadius: 10, backgroundColor: colors.bg },
  fileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxWidth: 260,
  },
  chipFailed: { backgroundColor: colors.dangerSoft },
  chipThumb: { width: 22, height: 22, borderRadius: 4 },
  fileChipText: { color: colors.text, fontSize: 12, flexShrink: 1 },
  tray: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: space.sm, paddingTop: space.xs },
  editBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: colors.accentSoft,
  },
  editText: { color: colors.text, fontSize: 12, flex: 1 },
  toBottom: {
    position: "absolute",
    right: space.md,
    bottom: 76,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  attach: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  stopBtn: { backgroundColor: colors.danger },
  search: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 15,
  },
  archivedLink: { alignItems: "center", paddingVertical: space.sm },
  saveBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  saveText: { color: "#fff", fontWeight: "700" },
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
