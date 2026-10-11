/**
 * Let the phone ask whether Bitwarden is installed.
 * Android 11+ hides canOpenURL unless the package and scheme are declared.
 */
const { withAndroidManifest } = require("expo/config-plugins");

const PACKAGE = "com.x8bit.bitwarden";

function withBitwardenQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const queries = manifest.queries || [];
    const hasPackage = queries.some((entry) =>
      (entry.package || []).some((item) => item?.$?.["android:name"] === PACKAGE),
    );
    if (!hasPackage) {
      queries.push({ package: [{ $: { "android:name": PACKAGE } }] });
    }
    const hasScheme = queries.some((entry) =>
      (entry.intent || []).some((intent) =>
        (intent.data || []).some((data) => data?.$?.["android:scheme"] === "bitwarden"),
      ),
    );
    if (!hasScheme) {
      queries.push({
        intent: [
          {
            action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
            data: [{ $: { "android:scheme": "bitwarden" } }],
          },
        ],
      });
    }
    manifest.queries = queries;
    return cfg;
  });
}

module.exports = withBitwardenQueries;
