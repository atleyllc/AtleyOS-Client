import { useCallback, useState } from "react";
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Network from "expo-network";
import { router, useFocusEffect, type Href } from "expo-router";
import { fetchFavorites, toggleFavorite, type Favorite } from "../../src/lib/favorites";
import { loadHomeApps } from "../../src/lib/homeOpeners";
import { presentHomeLinks, type HomeLink } from "../../src/lib/homeApps";
import {
  BITWARDEN_SCHEME,
  choosePasswordOpen,
  passwordRowFromApps,
  storeUrlForPlatform,
  type PasswordRow,
} from "../../src/lib/passwords";
import { loadSession } from "../../src/lib/session";
import { probeSurfaces, type SurfaceFlags } from "../../src/lib/surface";
import { statusChip } from "../../src/lib/tone";
import { getTunnelState, isTunnelPaused, syncAwayTunnel } from "../../src/lib/wireguard";
import { awayChip, planOpen } from "../../src/lib/awayApps";
import { homeLanAnswers } from "../../src/lib/awayAppsClient";
import { isAppInstalled, launchApp, openPreference, setOpenPreference } from "../../src/lib/nativeApps";
import { Icon } from "../../src/components/Icon";
import type { IconName } from "../../src/components/icons";
import {
  Group,
  GroupLabel,
  IconBadge,
  ListRow,
  MenuButton,
  Note,
  Screen,
  StatusChip,
  type MenuAction,
} from "../../src/components/ui";
import { colors, radius, space } from "../../src/lib/theme";

const EMPTY_FLAGS: SurfaceFlags = {
  storage: false,
  search: false,
  connectors: false,
  reminders: false,
  machines: false,
  coding: false,
  usage: false,
};

const KIND_ICON: Record<HomeLink["kind"], IconName> = {
  photos: "photos",
  files: "files",
  media: "media",
  home: "smart-home",
  other: "app",
};

type Tool = { flag: keyof SurfaceFlags; title: string; subtitle: string; icon: IconName; href: Href };

const TOOLS: Tool[] = [
  { flag: "machines", title: "Machines", subtitle: "Server, Mac, and PC jobs", icon: "machines", href: "/machines" },
  { flag: "coding", title: "Coding jobs", subtitle: "Changes started from Chat", icon: "coding", href: "/coding" },
  { flag: "usage", title: "AI usage", subtitle: "Local models, Cursor, and plans", icon: "usage", href: "/usage" },
  { flag: "connectors", title: "Connectors", subtitle: "Accounts AtleyOS can use", icon: "connectors", href: "/connectors" },
  { flag: "storage", title: "Storage", subtitle: "Drives and backups", icon: "storage", href: "/storage" },
  { flag: "search", title: "Search", subtitle: "Files and notes at home", icon: "search", href: "/search" },
  { flag: "reminders", title: "Reminders", subtitle: "Reminders and routines", icon: "reminders", href: "/reminders" },
];

export default function HomeRailScreen() {
  const [links, setLinks] = useState<HomeLink[]>([]);
  const [passwords, setPasswords] = useState<PasswordRow | null>(null);
  const [surfaces, setSurfaces] = useState<SurfaceFlags>(EMPTY_FLAGS);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favoritesSupported, setFavoritesSupported] = useState(false);
  const [note, setNote] = useState("");
  const [toggleId, setToggleId] = useState<string | null>(null);
  const [onWifi, setOnWifi] = useState<boolean | null>(null);
  const [atHome, setAtHome] = useState<boolean | null>(null);
  const [vpnUp, setVpnUp] = useState(false);
  const [awayEnabled, setAwayEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const session = await loadSession();
    let apps: Awaited<ReturnType<typeof loadHomeApps>> = [];
    let warning = "";
    try {
      if (session) apps = await loadHomeApps();
    } catch (e) {
      warning = e instanceof Error ? e.message : String(e);
    }
    const net = await Network.getNetworkStateAsync().catch(() => null);
    const tunnel = await getTunnelState().catch(() => null);
    const wifi = net?.type === Network.NetworkStateType.WIFI;
    setOnWifi(net ? wifi : null);
    const up = tunnel?.status === "up";
    setVpnUp(up);
    setAwayEnabled(!(await isTunnelPaused()));
    // Any Wi‑Fi isn't home Wi‑Fi. Home is where the server answers directly.
    const home = Boolean(tunnel?.atHome) || (!up && wifi && session ? await homeLanAnswers(1200) : false);
    setAtHome(net ? home : null);
    setLinks(
      presentHomeLinks({
        apps,
        lanApiBase: session?.lanApiBase,
        httpsApiBase: session?.httpsApiBase,
        onWifi: home || up,
        homeVpnUp: up && tunnel?.mode === "overlay",
      }),
    );
    setPasswords(passwordRowFromApps(apps));
    setNote(warning);
    if (!session) {
      setSurfaces(EMPTY_FLAGS);
      return;
    }
    const [surfaceFlags, fav] = await Promise.all([
      probeSurfaces().catch(() => EMPTY_FLAGS),
      fetchFavorites().catch(() => null),
    ]);
    setSurfaces(surfaceFlags);
    setFavoritesSupported(Boolean(fav?.supported));
    setFavorites(fav?.favorites || []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function openLink(link: HomeLink) {
    const url = link.lanUrl || link.openUrl;
    let up = vpnUp;
    if (!atHome && !up && awayEnabled) {
      // Away apps is on but asleep: wake it, then open.
      up = (await syncAwayTunnel({ networkChanged: true }).catch(() => null))?.status === "up";
      setVpnUp(up);
    }
    const [installed, prefer] = await Promise.all([
      isAppInstalled(link.androidPackage, link.iosScheme),
      openPreference(link.kind),
    ]);
    const plan = planOpen({
      url,
      atHome: Boolean(atHome),
      vpnUp: up,
      installed,
      prefer,
      androidPackage: link.androidPackage,
      iosScheme: link.iosScheme,
    });
    if (plan.kind === "none") {
      Alert.alert(link.title, plan.reason);
      return;
    }
    if (plan.kind === "setup") {
      Alert.alert(
        link.title,
        "You’re away from home Wi‑Fi. Turn on Away apps once and this opens anywhere.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Set up Away apps", onPress: () => router.push("/away-apps") },
        ],
      );
      return;
    }
    if (plan.kind === "native" && (await launchApp(plan.androidPackage, plan.iosScheme))) return;
    try {
      await Linking.openURL(plan.url);
    } catch (e) {
      Alert.alert(link.title, e instanceof Error ? e.message : String(e));
    }
  }

  async function openPasswords() {
    if (!passwords?.present) return;
    let nativeInstalled = false;
    try {
      nativeInstalled = await Linking.canOpenURL(BITWARDEN_SCHEME);
    } catch {
      nativeInstalled = false;
    }
    const choice = choosePasswordOpen({ serverUrl: passwords.serverUrl, nativeInstalled });
    const url = choice.url || storeUrlForPlatform(Platform.OS);
    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert("Passwords", e instanceof Error ? e.message : String(e));
    }
  }

  function linkActions(link: HomeLink): MenuAction[] {
    const actions: MenuAction[] = [];
    const url = link.lanUrl || link.openUrl;
    if (url) {
      actions.push({ label: "Copy server address", icon: "copy", onPress: () => void Clipboard.setStringAsync(url) });
      actions.push({
        label: "Open in the browser",
        icon: "globe",
        onPress: () =>
          void (async () => {
            await setOpenPreference(link.kind, "browser");
            await openLink(link);
          })(),
      });
    }
    if (link.androidPackage || link.iosScheme) {
      actions.push({
        label: `Open in ${link.appName || "the app"}`,
        icon: "phone",
        onPress: () =>
          void (async () => {
            await setOpenPreference(link.kind, "native");
            await openLink(link);
          })(),
      });
    }
    actions.push({ label: "Away apps", icon: "vpn", onPress: () => router.push("/away-apps") });
    const store = Platform.OS === "ios" ? link.store?.ios : link.store?.android;
    if (store) actions.push({ label: `Get ${link.appName || "the phone app"}`, icon: "external", onPress: () => void Linking.openURL(store) });
    return actions;
  }

  const tools = TOOLS.filter((tool) => surfaces[tool.flag]);

  return (
    <Screen
      title="Home"
      right={(() => {
        const chip = awayChip({ atHome, vpnUp, enabled: awayEnabled });
        return chip ? <StatusChip {...chip} /> : null;
      })()}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      testID="home-screen"
    >
      {note ? <Note tone="danger">{note}</Note> : null}
      {atHome === false && !vpnUp && !awayEnabled ? (
        <Pressable onPress={() => router.push("/away-apps")} accessibilityRole="button" testID="away-apps-banner">
          <Note tone="accent" icon="vpn">
            Away from home? Turn on Away apps once to open Photos, Files, Media, and Home anywhere.
          </Note>
        </Pressable>
      ) : null}

      <View style={styles.grid}>
        {links.map((link) => (
          <AppTile
            key={`${link.kind}-${link.app}-${link.title}`}
            icon={KIND_ICON[link.kind]}
            title={link.title}
            status={link.status}
            disabled={!link.openUrl}
            onPress={() => void openLink(link)}
            actions={linkActions(link)}
          />
        ))}
        {passwords?.present ? (
          <AppTile
            icon="passwords"
            title={passwords.title || "Passwords"}
            status={null}
            onPress={() => void openPasswords()}
            actions={[
              {
                label: "Install Bitwarden",
                icon: "external",
                onPress: () => void Linking.openURL(storeUrlForPlatform(Platform.OS)),
              },
              ...(passwords.serverUrl
                ? [
                    {
                      label: "Copy server address",
                      icon: "copy" as const,
                      onPress: () => void Clipboard.setStringAsync(passwords.serverUrl),
                    },
                  ]
                : []),
            ]}
          />
        ) : null}
      </View>

      {tools.length ? (
        <>
          <GroupLabel>Tools</GroupLabel>
          <Group>
            {tools.map((tool) => (
              <ListRow
                key={tool.flag}
                icon={tool.icon}
                title={tool.title}
                subtitle={tool.subtitle}
                chevron
                onPress={() => router.push(tool.href)}
              />
            ))}
          </Group>
        </>
      ) : null}

      {favoritesSupported && favorites.length ? (
        <>
          <GroupLabel>Favorites</GroupLabel>
          <Group>
            {favorites.map((favorite) => {
              const chip = statusChip(favorite.state);
              return (
                <ListRow
                  key={favorite.id}
                  icon="sparkles"
                  tone="muted"
                  title={favorite.label}
                  subtitle={favorite.domain || undefined}
                  right={toggleId === favorite.id ? <StatusChip label="Sending…" tone="accent" dot={false} /> : chip ? <StatusChip {...chip} /> : null}
                  onPress={() =>
                    void (async () => {
                      setToggleId(favorite.id);
                      try {
                        await toggleFavorite(favorite);
                        await load();
                      } catch (e) {
                        Alert.alert(favorite.label, e instanceof Error ? e.message : String(e));
                      } finally {
                        setToggleId(null);
                      }
                    })()
                  }
                />
              );
            })}
          </Group>
        </>
      ) : null}
    </Screen>
  );
}

function AppTile({
  icon,
  title,
  status,
  onPress,
  actions,
  disabled,
}: {
  icon: IconName;
  title: string;
  status: string | null;
  onPress: () => void;
  actions: MenuAction[];
  disabled?: boolean;
}) {
  const chip = statusChip(status);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}${chip ? `, ${chip.label}` : ""}`}
      testID={`home-app-${title.toLowerCase()}`}
    >
      <View style={styles.tileTop}>
        <IconBadge name={icon} size={44} tone={disabled ? "muted" : "accent"} />
        <MenuButton title={title} actions={actions} />
      </View>
      <Text style={styles.tileTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.tileFoot}>
        {chip ? <StatusChip {...chip} /> : <Text style={styles.tileHint}>{disabled ? "No address yet" : "Open"}</Text>}
        {!disabled ? <Icon name="external" size={14} color={colors.faint} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.sm + 2 },
  tile: {
    width: "48.5%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md - 2,
    gap: space.sm,
  },
  pressed: { opacity: 0.7 },
  tileTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginRight: -8, marginTop: -4 },
  tileTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  tileFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileHint: { color: colors.muted, fontSize: 12, fontWeight: "600" },
});
