/**
 * Expo config plugin: Android VpnService for WireGuard GoBackend + VPN perms.
 */
const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require("expo/config-plugins");

const VPN_SERVICE =
  "com.wireguard.android.backend.GoBackend$VpnService";

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- Home LAN + WireGuard overlay use cleartext HTTP for the client API. -->
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">10.55.0.1</domain>
    <domain includeSubdomains="true">localhost</domain>
    <domain includeSubdomains="true">127.0.0.1</domain>
  </domain-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

function ensurePermission(androidManifest, name) {
  const perms = androidManifest.manifest["uses-permission"] || [];
  const exists = perms.some((p) => p?.$?.["android:name"] === name);
  if (!exists) {
    perms.push({ $: { "android:name": name } });
  }
  androidManifest.manifest["uses-permission"] = perms;
}

function ensureVpnService(androidManifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  if (!app.service) app.service = [];
  const exists = app.service.some((s) => s?.$?.["android:name"] === VPN_SERVICE);
  if (!exists) {
    app.service.push({
      $: {
        "android:name": VPN_SERVICE,
        "android:permission": "android.permission.BIND_VPN_SERVICE",
        "android:exported": "false",
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": "android.net.VpnService" } }],
        },
      ],
    });
  }
  app.$ = app.$ || {};
  app.$["android:networkSecurityConfig"] =
    app.$["android:networkSecurityConfig"] || "@xml/network_security_config";
  // Allow http://192.168.x.x:8765 for first-pair on home LAN.
  app.$["android:usesCleartextTraffic"] = "true";
}

function withAtleyosWireGuard(config) {
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, "network_security_config.xml"),
        NETWORK_SECURITY_CONFIG,
        "utf8",
      );
      return cfg;
    },
  ]);

  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    ensurePermission(manifest, "android.permission.INTERNET");
    ensurePermission(manifest, "android.permission.FOREGROUND_SERVICE");
    ensurePermission(manifest, "android.permission.FOREGROUND_SERVICE_SPECIAL_USE");
    ensurePermission(manifest, "android.permission.RECEIVE_BOOT_COMPLETED");
    ensurePermission(manifest, "android.permission.BIND_VPN_SERVICE");
    ensureVpnService(manifest);
    return cfg;
  });
}

module.exports = withAtleyosWireGuard;
