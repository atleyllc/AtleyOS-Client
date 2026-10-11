import { useCallback, useState } from "react";
import { Alert, Linking, Platform, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import {
  Group,
  GroupLabel,
  ListRow,
  MenuButton,
  Note,
  Page,
  PrimaryButton,
  ScreenIntro,
  SecondaryButton,
  Section,
  StatusChip,
  ui,
  type MenuAction,
} from "../src/components/ui";
import { UNSUPPORTED, type AwayAppRow, type AwayAppsStatus } from "../src/lib/awayApps";
import { checkAwayApps, loadAwayApps } from "../src/lib/awayAppsClient";
import { isAppInstalled, launchApp, openPreference, setOpenPreference } from "../src/lib/nativeApps";
import {
  enableAwayApps,
  exportWgConfForShare,
  getTunnelState,
  isTunnelPaused,
  pauseTunnel,
  type TunnelState,
} from "../src/lib/wireguard";
import { space } from "../src/lib/theme";

const WIREGUARD_IOS = "https://apps.apple.com/app/wireguard/id1441195209";

type AppView = AwayAppRow & { installed: boolean; prefer: "native" | "browser" };

export default function AwayAppsScreen() {
  const [status, setStatus] = useState<AwayAppsStatus | null>(null);
  const [apps, setApps] = useState<AppView[]>([]);
  const [tunnel, setTunnel] = useState<TunnelState | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const apply = useCallback(async (next: AwayAppsStatus) => {
    setStatus(next);
    const rows = await Promise.all(
      next.apps.map(async (app) => ({
        ...app,
        installed: await isAppInstalled(app.androidPackage, app.iosScheme),
        prefer: await openPreference(app.id),
      })),
    );
    setApps(rows);
  }, []);

  const load = useCallback(async () => {
    setError("");
    setTunnel(await getTunnelState());
    setEnabled(!(await isTunnelPaused()));
    try {
      await apply(await loadAwayApps());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus((prev) => prev || UNSUPPORTED);
    }
  }, [apply]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function checkAgain() {
    setChecking(true);
    try {
      await apply(await checkAwayApps());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      setTunnel(on ? await enableAwayApps() : await pauseTunnel());
      setEnabled(on);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function shareToWireGuard() {
    const out = await exportWgConfForShare();
    if (!out) {
      Alert.alert("Away apps", "This phone has no VPN key yet. Re-pair on home Wi‑Fi, then try again.");
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FS = require("expo-file-system/legacy");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require("expo-sharing");
      const uri = `${FS.cacheDirectory}AtleyOS.conf`;
      await FS.writeAsStringAsync(uri, out.conf);
      await Sharing.shareAsync(uri, { mimeType: "application/octet-stream", UTI: "public.data" });
    } catch (e) {
      Alert.alert("Away apps", e instanceof Error ? e.message : String(e));
    }
  }

  const s = status;
  const connected = Boolean(s?.connected) || tunnel?.status === "up";
  const homeReady = Boolean(s?.homeReady);
  const chip = !s
    ? null
    : connected
      ? { label: "Connected", tone: "ok" as const }
      : tunnel?.atHome && enabled
        ? { label: "On · at home", tone: "ok" as const }
        : homeReady
          ? { label: enabled ? "Ready" : "Off", tone: enabled ? ("accent" as const) : ("muted" as const) }
          : { label: "One step left", tone: "warn" as const };

  function appActions(app: AppView): MenuAction[] {
    const actions: MenuAction[] = [
      { label: "Copy server address", icon: "copy", onPress: () => void Clipboard.setStringAsync(app.serverUrl) },
    ];
    const store = Platform.OS === "ios" ? app.store.ios : app.store.android;
    if (app.installed) {
      actions.push({ label: `Open ${app.appName}`, icon: "external", onPress: () => void launchApp(app.androidPackage, app.iosScheme) });
    } else if (store) {
      actions.push({ label: `Get ${app.appName}`, icon: "external", onPress: () => void Linking.openURL(store) });
    }
    actions.push({
      label: app.prefer === "native" ? "Open in the browser instead" : `Open in ${app.appName} instead`,
      icon: "link",
      onPress: () =>
        void (async () => {
          await setOpenPreference(app.id, app.prefer === "native" ? "browser" : "native");
          await load();
        })(),
    });
    return actions;
  }

  return (
    <Page>
      <ScreenIntro subtitle="Open Photos, Files, Media, and Home anywhere. A private link to your home turns on by itself when you leave Wi‑Fi. Only home traffic uses it." />
      {error ? <Note tone="danger">{error}</Note> : null}

      <Section title={connected ? "Your apps work away" : "Away apps"} icon="vpn" right={chip ? <StatusChip {...chip} /> : null}>
        <Text style={ui.body}>{s?.summary || "Checking your home…"}</Text>
        {Platform.OS === "android" ? (
          enabled ? (
            <SecondaryButton label={busy ? "Working…" : "Turn off Away apps"} icon="close" onPress={() => void toggle(false)} disabled={busy} />
          ) : (
            <PrimaryButton
              label="Turn on Away apps"
              icon="vpn"
              busy={busy}
              onPress={() => void toggle(true)}
              testID="away-apps-on"
            />
          )
        ) : null}
        {Platform.OS === "android" && !enabled ? (
          <Text style={ui.body}>Android asks once to allow a VPN. Tap OK.</Text>
        ) : null}
      </Section>

      {s && s.supported && !s.routerOk ? (
        <>
          <GroupLabel>At home, once</GroupLabel>
          <Section title="Let your home answer" icon="wifi">
            <Text style={ui.body}>
              Your router has to pass the link through to AtleyOS. Add this one rule in the router’s app or admin page
              (Port Forwarding). Or pair the router on the AtleyOS dashboard and AtleyOS adds it.
            </Text>
            {s.routerRule ? (
              <Group>
                <CopyRow title="Protocol" value={s.routerRule.protocol} />
                <CopyRow title="Outside port" value={String(s.routerRule.externalPort)} />
                <CopyRow title="Send to" value={s.routerRule.internalIp} />
                <CopyRow title="Inside port" value={String(s.routerRule.internalPort)} />
              </Group>
            ) : null}
            <SecondaryButton label={checking ? "Checking…" : "Check again"} icon="sync" onPress={() => void checkAgain()} disabled={checking} />
          </Section>
        </>
      ) : null}
      {s && s.supported && !s.firewallOk ? (
        <Note tone="warn">The home server still has to open its VPN port. Restarting AtleyOS does it; then tap Check again.</Note>
      ) : null}

      {Platform.OS === "ios" ? (
        <>
          <GroupLabel>On this iPhone, once</GroupLabel>
          <Group>
            <ListRow icon="external" title="1. Get WireGuard" subtitle="Free, from the App Store" onPress={() => void Linking.openURL(WIREGUARD_IOS)} chevron />
            <ListRow icon="vpn" title="2. Add AtleyOS to WireGuard" subtitle="Share, then pick WireGuard" onPress={() => void shareToWireGuard()} chevron />
          </Group>
          <Note>
            In WireGuard, open AtleyOS, tap Edit, turn on On‑Demand for Cellular and Wi‑Fi, and leave your home Wi‑Fi out. It
            then connects by itself when you leave.
          </Note>
        </>
      ) : null}

      {apps.length ? (
        <>
          <GroupLabel>Your apps, once each</GroupLabel>
          <Note icon="info">
            In each app, use the server address below. It works at home and away, so you set it one time.
          </Note>
          <Group>
            {apps.map((app) => (
              <ListRow
                key={app.id}
                icon={app.id === "photos" ? "photos" : app.id === "files" ? "files" : app.id === "media" ? "media" : app.id === "home" ? "smart-home" : "app"}
                title={`${app.title} · ${app.appName}`}
                subtitle={`${app.serverHint}: ${app.serverUrl}`}
                right={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                    <StatusChip label={app.installed ? "Installed" : "Not installed"} tone={app.installed ? "ok" : "muted"} dot={false} />
                    <MenuButton title={app.title} actions={appActions(app)} />
                  </View>
                }
                onPress={() => void Clipboard.setStringAsync(app.serverUrl).then(() => Alert.alert("Copied", app.serverUrl))}
              />
            ))}
          </Group>
        </>
      ) : null}
    </Page>
  );
}

function CopyRow({ title, value }: { title: string; value: string }) {
  return (
    <ListRow
      title={title}
      subtitle={value}
      right={<StatusChip label="Copy" tone="muted" dot={false} />}
      onPress={() => void Clipboard.setStringAsync(value)}
    />
  );
}
