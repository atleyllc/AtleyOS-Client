import { useCallback, useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Network from "expo-network";
import { router, useFocusEffect } from "expo-router";
import { fetchFavorites, toggleFavorite, type Favorite } from "../../src/lib/favorites";
import { loadHomeApps } from "../../src/lib/homeOpeners";
import {
  homeStatusLine,
  presentHomeLinks,
  type HomeLink,
} from "../../src/lib/homeApps";
import {
  BITWARDEN_SCHEME,
  choosePasswordOpen,
  passwordRowFromApps,
  storeUrlForPlatform,
  type PasswordRow,
} from "../../src/lib/passwords";
import { loadSession } from "../../src/lib/session";
import { probeSurfaces, type SurfaceFlags } from "../../src/lib/surface";
import { getTunnelState } from "../../src/lib/wireguard";
import { Disclosure, PrimaryButton, QuietButton, ScreenIntro, Section } from "../../src/components/ui";
import { colors, space } from "../../src/lib/theme";

const EMPTY_FLAGS: SurfaceFlags = { storage: false, search: false, connectors: false, reminders: false };

export default function HomeRailScreen() {
  const [links, setLinks] = useState<HomeLink[]>([]);
  const [passwords, setPasswords] = useState<PasswordRow | null>(null);
  const [surfaces, setSurfaces] = useState<SurfaceFlags>(EMPTY_FLAGS);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favoritesSupported, setFavoritesSupported] = useState(false);
  const [note, setNote] = useState("");
  const [toggleId, setToggleId] = useState<string | null>(null);

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
    const next = presentHomeLinks({
      apps,
      lanApiBase: session?.lanApiBase,
      httpsApiBase: session?.httpsApiBase,
      onWifi: net?.type === Network.NetworkStateType.WIFI,
      homeVpnUp: tunnel?.status === "up" && tunnel.mode === "overlay",
    });
    setLinks(next);
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

  async function openLink(link: HomeLink) {
    if (!link.openUrl) {
      Alert.alert(link.title, link.openNote);
      return;
    }
    try {
      await Linking.openURL(link.openUrl);
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

  const primary = links.filter((link) => link.kind !== "other");
  const extra = links.filter((link) => link.kind === "other");

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenIntro
        title="Home"
        subtitle="Photos, Files, Media, and Home open at the LAN address on home Wi‑Fi, or the Away address when you are away."
      />
      {note ? <Text style={styles.warn}>{note}</Text> : null}
      {primary.map((link) => (
        <Section key={link.kind} eyebrow="Everyday" title={link.title}>
          <Text style={styles.body}>
            {link.openNote}
            {"\n"}
            {homeStatusLine(link)}
          </Text>
          <PrimaryButton
            label={link.openUrl ? `Open ${link.title}` : "No address yet"}
            onPress={() => void openLink(link)}
            disabled={!link.openUrl}
          />
          <Disclosure title="Addresses">
            <Text style={styles.mono}>
              {link.lanUrl ? `LAN ${link.lanUrl}` : "LAN — none"}
              {"\n"}
              {link.awayUrl ? `Away ${link.awayUrl}` : "Away — home didn’t send one"}
              {"\n"}
              {link.overlayUrl ? `Home VPN ${link.overlayUrl}` : "Home VPN — none"}
            </Text>
            {link.openUrl ? (
              <QuietButton
                label="Copy the address to open"
                onPress={() => void Clipboard.setStringAsync(link.openUrl)}
              />
            ) : null}
            <StoreLink link={link} />
          </Disclosure>
        </Section>
      ))}
      {passwords?.present ? (
        <Section eyebrow="Everyday" title={passwords.title || "Passwords"}>
          <Text style={styles.body}>
            Opens Bitwarden when it is installed. Otherwise it opens the server URL. LAN and Home VPN addresses are not used.
          </Text>
          <PrimaryButton label="Open Passwords" onPress={() => void openPasswords()} />
          <QuietButton
            label="Install Bitwarden"
            onPress={() => void Linking.openURL(storeUrlForPlatform(Platform.OS))}
          />
          {passwords.serverUrl ? (
            <QuietButton
              label="Copy server URL"
              onPress={() => void Clipboard.setStringAsync(passwords.serverUrl)}
            />
          ) : null}
        </Section>
      ) : null}
      {surfaces.storage || surfaces.search || surfaces.connectors || surfaces.reminders ? (
        <Section eyebrow="Everyday" title="On this phone">
          {surfaces.storage ? <QuietButton label="Storage" onPress={() => router.push("/storage")} /> : null}
          {surfaces.search ? <QuietButton label="Search" onPress={() => router.push("/search")} /> : null}
          {surfaces.connectors ? <QuietButton label="Connectors" onPress={() => router.push("/connectors")} /> : null}
          {surfaces.reminders ? <QuietButton label="Reminders and routines" onPress={() => router.push("/reminders")} /> : null}
        </Section>
      ) : null}
      {favoritesSupported ? (
        <Section eyebrow="Everyday" title="Favorites">
          <Text style={styles.body}>
            {favorites.length
              ? "These come from home. Toggle sends that favorite to the home server."
              : "Home didn’t return any favorites."}
          </Text>
          {favorites.map((favorite) => (
            <QuietButton
              key={favorite.id}
              label={
                toggleId === favorite.id
                  ? "Sending…"
                  : `${favorite.label}${favorite.domain ? ` · ${favorite.domain}` : ""}${favorite.state ? ` · ${favorite.state}` : ""}`
              }
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
          ))}
        </Section>
      ) : null}
      {extra.length ? (
        <Section eyebrow="Advanced" title="Other apps">
          {extra.map((link) => (
            <Disclosure key={`${link.app}-${link.title}`} title={link.title}>
              <Text style={styles.body}>{link.openNote}</Text>
              <PrimaryButton
                label={link.openUrl ? "Open" : "No address yet"}
                onPress={() => void openLink(link)}
                disabled={!link.openUrl}
              />
            </Disclosure>
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

function StoreLink({ link }: { link: HomeLink }) {
  const store = Platform.OS === "ios" ? link.store?.ios : link.store?.android;
  if (!store) return null;
  return <QuietButton label="Install the phone app" onPress={() => void Linking.openURL(store)} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl },
  body: { color: colors.muted, lineHeight: 21 },
  warn: { color: colors.danger, lineHeight: 20 },
  mono: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: colors.surface,
    padding: space.sm,
    borderRadius: 8,
  },
});
