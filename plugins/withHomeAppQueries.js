/**
 * Let the Home tab open the phone apps for home apps.
 * Android 11+ hides other apps unless their packages are declared;
 * iOS canOpenURL needs the schemes in LSApplicationQueriesSchemes.
 */
const { withAndroidManifest, withInfoPlist } = require("expo/config-plugins");

const PACKAGES = [
  "app.alextran.immich",
  "com.nextcloud.client",
  "org.jellyfin.mobile",
  "io.homeassistant.companion.android",
  "com.wireguard.android",
];
const SCHEMES = ["immich", "nextcloud", "homeassistant"];

function withHomeAppQueries(config) {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const queries = manifest.queries || [];
    const have = new Set();
    for (const entry of queries) {
      for (const item of entry.package || []) have.add(item?.$?.["android:name"]);
    }
    const missing = PACKAGES.filter((p) => !have.has(p));
    if (missing.length) {
      queries.push({ package: missing.map((name) => ({ $: { "android:name": name } })) });
    }
    manifest.queries = queries;
    return cfg;
  });
  return withInfoPlist(config, (cfg) => {
    const list = Array.isArray(cfg.modResults.LSApplicationQueriesSchemes)
      ? cfg.modResults.LSApplicationQueriesSchemes
      : [];
    for (const s of SCHEMES) if (!list.includes(s)) list.push(s);
    cfg.modResults.LSApplicationQueriesSchemes = list;
    return cfg;
  });
}

module.exports = withHomeAppQueries;
