import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BITWARDEN_ANDROID_STORE,
  BITWARDEN_IOS_STORE,
  BITWARDEN_SCHEME,
  choosePasswordOpen,
  passwordRowFromApps,
  passwordServerUrl,
} from "./passwords";

describe("passwords", () => {
  it("uses https_url and ignores lan and overlay", () => {
    const url = passwordServerUrl({
      https_url: "https://vault.example",
      server_url: "https://other.example",
      lan_url: "http://192.168.8.140:8222",
      overlay_url: "http://10.55.0.1:8222",
    });
    assert.equal(url, "https://vault.example");
  });

  it("uses server_url when https_url is missing", () => {
    assert.equal(
      passwordServerUrl({
        https_url: "",
        server_url: "https://vault.example/bitwarden",
        lan_url: "http://192.168.8.140:8222",
      }),
      "https://vault.example/bitwarden",
    );
  });

  it("reads the passwords row and the Bitwarden store links", () => {
    const row = passwordRowFromApps([
      { id: "photos", lan_url: "http://192.168.8.140:2283" },
      {
        id: "passwords",
        title: "Passwords",
        server_url: "https://vault.example",
        lan_url: null,
        overlay_url: null,
      },
    ]);
    assert.equal(row.present, true);
    assert.equal(row.serverUrl, "https://vault.example");
    assert.equal(row.nativeScheme, BITWARDEN_SCHEME);
    assert.equal(row.store.ios, BITWARDEN_IOS_STORE);
    assert.match(row.store.ios, /id1137397744/);
    assert.match(row.store.android, /com\.x8bit\.bitwarden/);
    assert.equal(BITWARDEN_ANDROID_STORE.includes("com.x8bit.bitwarden"), true);
  });

  it("prefers the native scheme when Bitwarden is installed", () => {
    assert.deepEqual(
      choosePasswordOpen({ serverUrl: "https://vault.example", nativeInstalled: true }),
      { mode: "native", url: BITWARDEN_SCHEME },
    );
    assert.deepEqual(
      choosePasswordOpen({ serverUrl: "https://vault.example", nativeInstalled: false }),
      { mode: "https", url: "https://vault.example" },
    );
  });
});
