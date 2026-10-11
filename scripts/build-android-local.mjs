#!/usr/bin/env node
/**
 * Local Android release APK (no EAS cloud).
 * Requires user-local JDK + Android SDK (see docs/EAS_DEV_CLIENT.md).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = os.homedir();
const javaHome = process.env.JAVA_HOME || path.join(home, ".local/jdk-17");
const androidHome =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  path.join(home, ".local/android");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd || root,
    env: { ...process.env, ...opts.env },
    shell: false,
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

// Refuse to build with a stale, missing, or template icon, or a tab with no icon.
run(process.execPath, [path.join(root, "scripts/check-app-assets.mjs")]);

if (!fs.existsSync(path.join(javaHome, "bin/java"))) {
  console.error(`JAVA_HOME missing java: ${javaHome}`);
  process.exit(1);
}
if (!fs.existsSync(androidHome)) {
  console.error(`ANDROID_HOME missing: ${androidHome}`);
  process.exit(1);
}

const env = {
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  PATH: `${path.join(javaHome, "bin")}${path.delimiter}${path.join(androidHome, "platform-tools")}${path.delimiter}${process.env.PATH || ""}`,
};

// Always prebuild. Skipping it when android/ already exists kept the old
// launcher icon, splash, and manifest from an earlier build. Without --clean,
// prebuild keeps android/app/debug.keystore, so the APK still installs over
// the previous one.
const keystore = path.join(root, "android/app/debug.keystore");
const keyBefore = fs.existsSync(keystore) ? fs.readFileSync(keystore) : null;
run("npx", ["expo", "prebuild", "--platform", "android", "--no-install"], { env });
if (keyBefore && !keyBefore.equals(fs.readFileSync(keystore))) {
  console.error("prebuild replaced android/app/debug.keystore; the APK would not install over the old one.");
  process.exit(1);
}

fs.writeFileSync(
  path.join(root, "android/local.properties"),
  `sdk.dir=${androidHome.replace(/\\/g, "/")}\n`,
);

const gradlew = path.join(root, "android", "gradlew");
fs.chmodSync(gradlew, 0o755);
run(gradlew, ["assembleRelease", "--no-daemon"], {
  cwd: path.join(root, "android"),
  env,
});

const apkSrc = path.join(
  root,
  "android/app/build/outputs/apk/release/app-release.apk",
);
const distDir = path.join(root, "dist");
fs.mkdirSync(distDir, { recursive: true });
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const out = path.join(distDir, `AtleyOSClient-${pkg.version}-preview.apk`);
fs.copyFileSync(apkSrc, out);
console.log(`\nAPK ready: ${out}`);
