#!/usr/bin/env node
/**
 * Fails the build or tests when app.json points at a missing, old, or wrong
 * icon, or when a tab has no bundled icon image.
 *
 * Why: 1.1.x and 1.2.0 shipped the stock Expo template icon even though the
 * Atley OS mark existed, and a tab bar without tabBarIcon draws React
 * Navigation's "⏷" placeholder, which shows as a boxed X on Android.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const fail = (msg) => errors.push(msg);

/** Files from the stock Expo template (and the 0.9.0 beta.8/9 marks). Never ship these. */
const RETIRED_HASHES = new Map([
  ["cb975bba2216ce10a60e6c0ffe9941a2", "Expo template icon.png"],
  ["97dae5a0e62ad8551d8a31897b425e63", "Expo template splash-icon.png"],
  ["72e71a9c846c6aa4ae32476641a00e18", "Expo template android-icon-foreground.png"],
  ["2d65569cc0e2afdcea0af9f9902d4173", "Expo template android-icon-background.png"],
  ["1e097dab989759fc0b69440092ca22cd", "Expo template android-icon-monochrome.png"],
  ["d9f444efbdfbe7931aa93beada07318a", "Expo template favicon.png"],
]);
const RETIRED_PATHS = [
  /assets\/icon\.png$/,
  /assets\/splash-icon\.png$/,
  /assets\/android-icon-(foreground|background|monochrome)\.png$/,
  /assets\/favicon\.png$/,
];

function md5(file) {
  return crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
}

/** Width, height, and whether the PNG can carry alpha (color type 4/6 or tRNS). */
function pngInfo(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];
  const hasTrns = buf.includes(Buffer.from("tRNS"));
  return { width, height, alpha: colorType === 4 || colorType === 6 || hasTrns };
}

function checkPath(label, rel, { square, size, noAlpha } = {}) {
  if (typeof rel !== "string" || !rel) return fail(`${label} is not set in app.json`);
  if (RETIRED_PATHS.some((re) => re.test(rel))) fail(`${label} points at a retired asset: ${rel}`);
  const file = path.resolve(root, rel);
  if (!fs.existsSync(file)) return fail(`${label} points at a missing file: ${rel}`);
  const retired = RETIRED_HASHES.get(md5(file));
  if (retired) fail(`${label} (${rel}) is the ${retired}, not the Atley OS mark`);
  let info;
  try {
    info = pngInfo(file);
  } catch (err) {
    return fail(`${label} (${rel}) is not a valid PNG: ${err.message}`);
  }
  if (square && info.width !== info.height) fail(`${label} (${rel}) is ${info.width}x${info.height}, expected square`);
  if (size && (info.width !== size || info.height !== size)) fail(`${label} (${rel}) is ${info.width}x${info.height}, expected ${size}x${size}`);
  if (noAlpha && info.alpha) fail(`${label} (${rel}) has an alpha channel; the App Store rejects that`);
}

const expo = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8")).expo;
checkPath("expo.icon", expo.icon, { size: 1024, noAlpha: true });
if (expo.ios?.icon) checkPath("expo.ios.icon", expo.ios.icon, { size: 1024, noAlpha: true });
checkPath("expo.splash.image", expo.splash?.image);
const adaptive = expo.android?.adaptiveIcon ?? {};
checkPath("android.adaptiveIcon.foregroundImage", adaptive.foregroundImage, { square: true });
if (adaptive.monochromeImage) checkPath("android.adaptiveIcon.monochromeImage", adaptive.monochromeImage, { square: true });
if (adaptive.backgroundImage) checkPath("android.adaptiveIcon.backgroundImage", adaptive.backgroundImage, { square: true });
if (!adaptive.backgroundImage && !/^#[0-9a-f]{6}$/i.test(adaptive.backgroundColor ?? "")) {
  fail("android.adaptiveIcon needs a backgroundImage or a #rrggbb backgroundColor");
}
if (expo.web?.favicon) checkPath("expo.web.favicon", expo.web.favicon);
for (const plugin of expo.plugins ?? []) {
  if (Array.isArray(plugin) && plugin[0] === "expo-notifications" && plugin[1]?.icon) {
    checkPath("expo-notifications icon", plugin[1].icon, { square: true });
  }
}

// No retired template file may linger anywhere under assets/.
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".png")) {
      const retired = RETIRED_HASHES.get(md5(full));
      if (retired) fail(`${path.relative(root, full)} is the ${retired}; delete it`);
    }
  }
}
walk(path.join(root, "assets"));

// Every tab needs a bundled image icon, or React Navigation draws "⏷" (a boxed X on Android).
const layoutFile = path.join(root, "app/(tabs)/_layout.tsx");
const layout = fs.readFileSync(layoutFile, "utf8");
if (!/tabBarIcon\s*:/.test(layout)) fail("app/(tabs)/_layout.tsx sets no tabBarIcon, so tabs show a missing-glyph box");
const tabs = [...layout.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
if (tabs.length === 0) fail("no <Tabs.Screen> found in app/(tabs)/_layout.tsx");
const iconSource = fs.readFileSync(path.join(root, "src/components/icons.ts"), "utf8");
for (const tab of tabs) {
  for (const state of ["active", "inactive"]) {
    const rel = `assets/tab/${tab}-${state}.png`;
    if (!fs.existsSync(path.join(root, rel))) fail(`tab "${tab}" has no ${rel}`);
    if (!iconSource.includes(`tab/${tab}-${state}.png`)) fail(`src/components/icons.ts does not require ${rel}`);
  }
}

// Icon fonts are not loaded anywhere; using one would bring the boxes back.
function scanSources(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scanSources(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      if (/from\s+["']@expo\/vector-icons/.test(text) || /react-native-vector-icons/.test(text)) {
        fail(`${path.relative(root, full)} uses an icon font; use the bundled PNG icons in src/components/icons.ts`);
      }
    }
  }
}
scanSources(path.join(root, "app"));
scanSources(path.join(root, "src"));

if (errors.length) {
  console.error("App asset check failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`App asset check passed (${tabs.length} tabs, icon, splash, adaptive, notification).`);
