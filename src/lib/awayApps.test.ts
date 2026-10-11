import { test } from "node:test";
import assert from "node:assert/strict";
import {
  awayChip,
  parseAwayApps,
  pickConf,
  planOpen,
  splitTunnelIps,
  withSplitTunnel,
} from "./awayApps";
import { presentHomeLinks } from "./homeApps";

const CONF = `[Interface]
PrivateKey = AAA
Address = 10.55.0.4/32

[Peer]
PublicKey = HOST
Endpoint = 74.205.133.77:51820
AllowedIPs = 10.55.0.0/24
PersistentKeepalive = 25
`;

test("split tunnel adds only the home server address", () => {
  assert.deepEqual(splitTunnelIps("192.168.8.140"), ["10.55.0.0/24", "192.168.8.140/32"]);
  assert.deepEqual(splitTunnelIps("127.0.0.1"), ["10.55.0.0/24"]);
  assert.deepEqual(splitTunnelIps("atleyos.local"), ["10.55.0.0/24"]);
  const next = withSplitTunnel(CONF, "192.168.8.140");
  assert.match(next, /AllowedIPs = 10\.55\.0\.0\/24, 192\.168\.8\.140\/32/);
  assert.doesNotMatch(next, /0\.0\.0\.0\/0/);
});

test("a re-pair's key wins over an older stored conf", () => {
  const fresh = CONF.replace("AAA", "BBB");
  assert.equal(pickConf(CONF, fresh), fresh);
  assert.equal(pickConf(CONF, CONF), CONF);
  assert.equal(pickConf(null, fresh), fresh);
  assert.equal(pickConf(CONF, null), CONF);
});

test("away without the VPN never opens a LAN address", () => {
  const plan = planOpen({ url: "http://192.168.8.140:8097", atHome: false, vpnUp: false, installed: true, prefer: "native" });
  assert.equal(plan.kind, "setup");
});

test("native app when installed, browser otherwise", () => {
  const base = { url: "http://192.168.8.140:2283", atHome: true, vpnUp: false, androidPackage: "app.alextran.immich" };
  assert.equal(planOpen({ ...base, installed: true, prefer: "native" }).kind, "native");
  assert.equal(planOpen({ ...base, installed: false, prefer: "native" }).kind, "browser");
  assert.equal(planOpen({ ...base, installed: true, prefer: "browser" }).kind, "browser");
  assert.equal(planOpen({ ...base, atHome: false, vpnUp: true, installed: true, prefer: "native" }).kind, "native");
});

test("status chip says whether apps work away", () => {
  assert.equal(awayChip({ atHome: false, vpnUp: true, enabled: true })?.label, "Away · apps on");
  assert.equal(awayChip({ atHome: false, vpnUp: false, enabled: false })?.label, "Away · apps off");
  assert.equal(awayChip({ atHome: true, vpnUp: false, enabled: true })?.label, "Home Wi‑Fi");
  assert.equal(awayChip({ atHome: null, vpnUp: false, enabled: false }), null);
});

test("parse server view", () => {
  const view = parseAwayApps({
    ok: true,
    summary: "One router step left",
    connected: false,
    handshake_age_sec: null,
    home_ready: false,
    endpoint: "74.205.133.77:51820",
    allowed_ips: "10.55.0.0/24, 192.168.8.140/32",
    firewall: { ok: true },
    router: { ok: false, protocol: "UDP", external_port: 51820, internal_ip: "192.168.8.140", internal_port: 51820 },
    apps: [{ id: "media", title: "Media", app_name: "Jellyfin", android_package: "org.jellyfin.mobile", server_url: "http://192.168.8.140:8097" }],
  });
  assert.equal(view.supported, true);
  assert.equal(view.routerRule?.internalIp, "192.168.8.140");
  assert.equal(view.apps[0].androidPackage, "org.jellyfin.mobile");
  assert.equal(parseAwayApps({ ok: false }).supported, false);
});

test("standard home apps carry their phone app ids", () => {
  const links = presentHomeLinks({ apps: [], lanApiBase: "http://192.168.8.140:8765", onWifi: true });
  const media = links.find((l) => l.kind === "media");
  assert.equal(media?.androidPackage, "org.jellyfin.mobile");
  assert.equal(media?.lanUrl, "http://192.168.8.140:8097");
});
