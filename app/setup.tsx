import { useCallback, useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Network from "expo-network";
import { router, useFocusEffect } from "expo-router";
import { clientStatus } from "../src/lib/api";
import { findHomeLink, presentHomeLinks } from "../src/lib/homeApps";
import { loadHomeApps } from "../src/lib/homeOpeners";
import { passwordRowFromApps, storeUrlForPlatform } from "../src/lib/passwords";
import { requestAllLearningPermissions, runObservationCycle } from "../src/lib/observation";
import { loadSession, updateSession } from "../src/lib/session";
import {
  awayCheckMessage,
  awayHealthUrl,
  phoneSetupSteps,
  type AwayCheck,
  type SetupStep,
} from "../src/lib/setupGuide";
import { PrimaryButton, QuietButton, ScreenIntro, Section } from "../src/components/ui";
import { colors, space } from "../src/lib/theme";

export default function SetupScreen() {
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [photosUrl, setPhotosUrl] = useState("");
  const [filesUrl, setFilesUrl] = useState("");
  const [passwordsUrl, setPasswordsUrl] = useState("");
  const [awayLive, setAwayLive] = useState<AwayCheck>("unknown");

  const refresh = useCallback(async () => {
    const session = await loadSession();
    let away: AwayCheck = awayLive;
    let awayAddress = session?.httpsApiBase || "";
    if (away === "unknown") {
      if (!session || !awayAddress) away = session ? "missing" : "unknown";
      else if (session.httpsReady === false) away = "down";
    }
    const loaded = await linksForSession();
    const photos = findHomeLink(loaded.links, "photos")?.openUrl || findHomeLink(loaded.links, "photos")?.lanUrl || "";
    const files = findHomeLink(loaded.links, "files")?.openUrl || findHomeLink(loaded.links, "files")?.lanUrl || "";
    setPhotosUrl(photos);
    setFilesUrl(files);
    setPasswordsUrl(loaded.passwordsUrl);
    setSteps(
      phoneSetupSteps({
        paired: Boolean(session),
        away,
        awayAddress,
        photosUrl: photos,
        filesUrl: files,
        passwordsUrl: loaded.passwordsUrl,
        passwordsSkipped: Boolean(session?.passwordsSetupSkippedAt),
        learningDone: Boolean(session?.learningConsentAt),
      }),
    );
  }, [awayLive]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function checkAway() {
    setBusy("away");
    try {
      await clientStatus().catch(() => undefined);
      const session = await loadSession();
      const base = session?.httpsApiBase || "";
      const url = awayHealthUrl(base);
      if (!url) {
        setAwayLive("missing");
        Alert.alert("Away", awayCheckMessage({ url: "", ok: false }));
        return;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
        const ok = res.ok;
        setAwayLive(ok ? "ready" : "down");
        Alert.alert("Away", awayCheckMessage({ url: base, ok, error: ok ? undefined : `HTTP ${res.status}` }));
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        setAwayLive("down");
        Alert.alert("Away", awayCheckMessage({ url: base, ok: false, error: detail }));
      } finally {
        clearTimeout(timer);
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function copyUrl(url: string, label: string) {
    if (!url) {
      Alert.alert(label, "Pair on home Wi‑Fi first so this phone has the LAN address.");
      return;
    }
    await Clipboard.setStringAsync(url);
    Alert.alert(label, `Copied ${url}`);
  }

  async function allowLearning() {
    setBusy("learn");
    try {
      await requestAllLearningPermissions();
      await updateSession({ learningConsentAt: Date.now() });
      await runObservationCycle().catch(() => undefined);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function skipPasswords() {
    await updateSession({ passwordsSetupSkippedAt: Date.now() });
    await refresh();
  }

  async function finish() {
    await updateSession({
      setupSeenAt: Date.now(),
      learningConsentAt: (await loadSession())?.learningConsentAt || Date.now(),
    });
    router.replace("/(tabs)/chat");
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenIntro
        title="Set up this phone"
        subtitle="Own my data. Own my intelligence. Own my future. Pair on home Wi‑Fi, confirm Away, then point Photos and Files at home."
      />
      {steps.map((step) => (
        <Section key={step.id} eyebrow="Setup" title={step.title}>
          <Text style={styles.body}>{step.body}</Text>
          {step.id === "pair" && !step.done ? (
            <PrimaryButton label={step.primary} onPress={() => router.push("/pair")} />
          ) : null}
          {step.id === "away" ? (
            <PrimaryButton
              label={busy === "away" ? "Checking…" : step.primary}
              onPress={() => void checkAway()}
              disabled={busy != null}
            />
          ) : null}
          {step.id === "photos" ? (
            <PrimaryButton
              label={step.primary}
              onPress={() => void copyUrl(photosUrl, "Photos")}
              disabled={!photosUrl}
            />
          ) : null}
          {step.id === "files" ? (
            <PrimaryButton
              label={step.primary}
              onPress={() => void copyUrl(filesUrl, "Files")}
              disabled={!filesUrl}
            />
          ) : null}
          {step.id === "passwords" ? (
            <>
              <PrimaryButton
                label={step.primary}
                onPress={() => void copyUrl(passwordsUrl, "Passwords")}
                disabled={!passwordsUrl}
              />
              <QuietButton
                label="Install Bitwarden"
                onPress={() => void Linking.openURL(storeUrlForPlatform(Platform.OS))}
              />
              {step.done ? null : <QuietButton label="Skip" onPress={() => void skipPasswords()} />}
            </>
          ) : null}
          {step.id === "learn" && !step.done ? (
            <PrimaryButton
              label={busy === "learn" ? "Asking…" : step.primary}
              onPress={() => void allowLearning()}
              disabled={busy != null}
            />
          ) : null}
          {step.done ? <Text style={styles.done}>Done</Text> : null}
        </Section>
      ))}
      <Section eyebrow="Everyday" title="Chat">
        <Text style={styles.body}>When pairing is done, Chat is the place you talk to home.</Text>
        <PrimaryButton label="Open Chat" onPress={() => void finish()} testID="setup-open-chat" />
        <QuietButton label="Back to pairing" onPress={() => router.push("/pair")} />
      </Section>
    </ScrollView>
  );
}

async function linksForSession() {
  const session = await loadSession();
  let apps: Awaited<ReturnType<typeof loadHomeApps>> = [];
  if (session) {
    try {
      apps = await loadHomeApps();
    } catch {
      apps = [];
    }
  }
  const net = await Network.getNetworkStateAsync().catch(() => null);
  return {
    passwordsUrl: passwordRowFromApps(apps).serverUrl,
    links: presentHomeLinks({
      apps,
      lanApiBase: session?.lanApiBase,
      httpsApiBase: session?.httpsApiBase,
      onWifi: net?.type === Network.NetworkStateType.WIFI,
    }),
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  body: { color: colors.muted, lineHeight: 21 },
  done: { color: colors.ok, fontWeight: "700" },
});
