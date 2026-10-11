import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyHomeApp,
  findHomeLink,
  homeStatusLine,
  hostFromApiBase,
  presentHomeLinks,
} from "./homeApps";

describe("home apps", () => {
  it("classifies the four home apps", () => {
    assert.equal(classifyHomeApp({ app: "immich", title: "Photos" }), "photos");
    assert.equal(classifyHomeApp({ app: "nextcloud", title: "Files" }), "files");
    assert.equal(classifyHomeApp({ title: "Jellyfin" }), "media");
    assert.equal(classifyHomeApp({ app: "home_assistant" }), "home");
    assert.equal(classifyHomeApp({ title: "Anchor" }), "other");
  });

  it("leaves the passwords row out of the app list", () => {
    const links = presentHomeLinks({
      apps: [
        {
          id: "passwords",
          title: "Passwords",
          app: "vaultwarden",
          lan_url: "http://192.168.8.140:8080",
          https_url: "https://vault.example",
          overlay_url: "http://10.55.0.1:8080",
        },
      ],
      lanApiBase: "http://192.168.8.140:8765",
      onWifi: true,
    });
    assert.equal(
      links.some((link) => /password|vault/i.test(`${link.title} ${link.app}`)),
      false,
    );
    assert.equal(
      links.some((link) => link.openUrl.includes("8080") || link.lanUrl.includes("8080")),
      false,
    );
  });

  it("does not use a loopback host for standard ports", () => {
    assert.equal(hostFromApiBase("http://127.0.0.1:8765"), "");
    assert.equal(hostFromApiBase("http://192.168.8.140:8765"), "192.168.8.140");
  });

  it("prefers the LAN URL on Wi-Fi and the Away URL off Wi-Fi", () => {
    const apps = [
      {
        id: "photos",
        title: "Photos",
        app: "immich",
        lan_url: "http://192.168.8.140:2283",
        https_url: "https://photos.example",
        overlay_url: "http://10.55.0.1:2283",
        status: "up",
      },
    ];
    const wifi = presentHomeLinks({ apps, lanApiBase: "http://192.168.8.140:8765", onWifi: true });
    const photos = findHomeLink(wifi, "photos");
    assert.equal(photos?.openUrl, "http://192.168.8.140:2283");
    assert.equal(photos?.openMode, "lan");
    assert.match(homeStatusLine(photos!), /up/);

    const away = presentHomeLinks({ apps, lanApiBase: "http://192.168.8.140:8765", onWifi: false });
    assert.equal(findHomeLink(away, "photos")?.openUrl, "https://photos.example");
    assert.equal(findHomeLink(away, "photos")?.openMode, "away");
  });

  it("fills Photos Files Media and Home from the saved LAN host", () => {
    const links = presentHomeLinks({
      apps: [],
      lanApiBase: "http://192.168.8.140:8765",
      onWifi: true,
    });
    assert.deepEqual(
      links.map((link) => [link.kind, link.lanUrl]),
      [
        ["photos", "http://192.168.8.140:2283"],
        ["files", "http://192.168.8.140:10081"],
        ["media", "http://192.168.8.140:8097"],
        ["home", "http://192.168.8.140:8123"],
      ],
    );
    assert.match(homeStatusLine(links[0]), /didn’t report status/);
  });

  it("does not invent addresses when the phone has no LAN host", () => {
    const links = presentHomeLinks({ apps: [], lanApiBase: "http://127.0.0.1:8765", onWifi: true });
    assert.equal(findHomeLink(links, "photos")?.openUrl, "");
    assert.equal(findHomeLink(links, "photos")?.openMode, "none");
  });

  it("keeps an explicit empty LAN URL empty", () => {
    const links = presentHomeLinks({
      apps: [{ id: "files", title: "Files", app: "nextcloud", lan_url: "", status: "down" }],
      lanApiBase: "http://192.168.8.140:8765",
      onWifi: true,
    });
    const files = findHomeLink(links, "files");
    assert.equal(files?.lanUrl, "");
    assert.equal(files?.openUrl, "");
    assert.equal(files?.status, "down");
  });

  it("drops the client API host from an app Away URL", () => {
    const links = presentHomeLinks({
      apps: [
        {
          id: "photos",
          title: "Photos",
          app: "immich",
          lan_url: "http://192.168.8.140:2283",
          https_url: "https://atleyos.atley.llc",
        },
        {
          id: "media",
          title: "Media",
          app: "jellyfin",
          lan_url: "http://192.168.8.140:8097",
          https_url: "https://media.example",
        },
      ],
      lanApiBase: "http://192.168.8.140:8765",
      httpsApiBase: "https://media.example",
      onWifi: false,
    });
    assert.equal(findHomeLink(links, "photos")?.awayUrl, "");
    assert.equal(findHomeLink(links, "photos")?.openUrl, "http://192.168.8.140:2283");
    assert.equal(findHomeLink(links, "media")?.awayUrl, "");
  });

  it("fills a missing LAN URL from the standard port", () => {
    const links = presentHomeLinks({
      apps: [{ id: "photos", title: "Photos", app: "immich", status: "up" }],
      lanApiBase: "http://192.168.8.140:8765",
      onWifi: true,
    });
    const photos = findHomeLink(links, "photos");
    assert.equal(photos?.lanUrl, "http://192.168.8.140:2283");
    assert.equal(photos?.openUrl, "http://192.168.8.140:2283");
    assert.equal(photos?.status, "up");
  });

  it("uses Home VPN when Away has no public app URL", () => {
    const links = presentHomeLinks({
      apps: [
        {
          id: "files",
          title: "Files",
          app: "nextcloud",
          lan_url: "http://192.168.8.140:10081",
          overlay_url: "http://10.55.0.1:10081",
        },
      ],
      lanApiBase: "http://192.168.8.140:8765",
      onWifi: false,
      homeVpnUp: true,
    });
    const files = findHomeLink(links, "files");
    assert.equal(files?.openUrl, "http://10.55.0.1:10081");
    assert.equal(files?.openMode, "overlay");
  });
});
