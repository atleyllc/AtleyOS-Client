import * as LocalAuthentication from "expo-local-authentication";

export async function unlockWithBiometrics(): Promise<boolean> {
  const has = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!has || !enrolled) {
    // No biometrics — allow through (device passcode gate is OS-level for SecureStore).
    return true;
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock AtleyOS Client",
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });
  return result.success;
}
