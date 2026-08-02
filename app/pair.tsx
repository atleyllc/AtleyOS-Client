import { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { parsePairPayload, redeemPairing } from "../src/lib/api";
import { saveWgConf, ensureTunnel } from "../src/lib/wireguard";
import { colors, space } from "../src/lib/theme";

export default function PairScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish(raw: string) {
    if (busy) return;
    setBusy(true);
    try {
      const payload = parsePairPayload(raw);
      const session = await redeemPairing(payload, {
        deviceLabel: `${Platform.OS} client`,
        platform: Platform.OS,
      });
      await saveWgConf(session.wgClientConf);
      await ensureTunnel();
      router.replace("/learn");
    } catch (e) {
      Alert.alert("Pairing failed", e instanceof Error ? e.message : String(e));
      setScanning(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.lede}>
        On your home AtleyOS: Settings → Remote Access → Show pair QR. Stay on
        home Wi‑Fi for the first pair. No router ports required.
      </Text>

      {!permission?.granted ? (
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Allow camera to scan QR</Text>
        </Pressable>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={
              scanning && !busy
                ? ({ data }) => {
                    setScanning(false);
                    void finish(data);
                  }
                : undefined
            }
          />
        </View>
      )}

      <Text style={styles.label}>Or paste pair JSON / atleyos:// URI</Text>
      <TextInput
        style={styles.input}
        multiline
        value={manual}
        onChangeText={setManual}
        placeholderTextColor={colors.muted}
        placeholder='{"product":"atleyos","kind":"client_pair",...}'
      />
      <Pressable
        style={[styles.btn, busy && styles.btnDisabled]}
        disabled={busy}
        onPress={() => void finish(manual)}
      >
        <Text style={styles.btnText}>{busy ? "Pairing…" : "Pair"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: space.md, gap: space.sm },
  lede: { color: colors.muted, lineHeight: 20 },
  cameraWrap: {
    height: 260,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.text, marginTop: space.sm, fontWeight: "600" },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: space.sm,
    color: colors.text,
    backgroundColor: colors.surface,
    textAlignVertical: "top",
  },
  btn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "700" },
});
