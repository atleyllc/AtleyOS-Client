import type { TabIconName } from "../lib/tabIcons";

/**
 * Bundled icon images. Every glyph in the app is a PNG (Lucide, ISC licence,
 * see assets/icons/LICENSE-lucide.txt), so nothing depends on an icon font
 * being loaded on Android or iOS. scripts/check-app-assets.mjs fails the
 * build if a tab or icon below has no image.
 */
export const TAB_ICONS: Record<TabIconName, { active: number; inactive: number }> = {
  chat: {
    active: require("../../assets/tab/chat-active.png"),
    inactive: require("../../assets/tab/chat-inactive.png"),
  },
  home: {
    active: require("../../assets/tab/home-active.png"),
    inactive: require("../../assets/tab/home-inactive.png"),
  },
  you: {
    active: require("../../assets/tab/you-active.png"),
    inactive: require("../../assets/tab/you-inactive.png"),
  },
  approvals: {
    active: require("../../assets/tab/approvals-active.png"),
    inactive: require("../../assets/tab/approvals-inactive.png"),
  },
  settings: {
    active: require("../../assets/tab/settings-active.png"),
    inactive: require("../../assets/tab/settings-inactive.png"),
  },
};

/** White glyphs; tint them with the Icon component. */
export const ICONS = {
  chat: require("../../assets/icons/chat.png"),
  apps: require("../../assets/icons/apps.png"),
  you: require("../../assets/icons/you.png"),
  inbox: require("../../assets/icons/inbox.png"),
  settings: require("../../assets/icons/settings.png"),
  photos: require("../../assets/icons/photos.png"),
  files: require("../../assets/icons/files.png"),
  media: require("../../assets/icons/media.png"),
  "smart-home": require("../../assets/icons/smart-home.png"),
  passwords: require("../../assets/icons/passwords.png"),
  storage: require("../../assets/icons/storage.png"),
  search: require("../../assets/icons/search.png"),
  connectors: require("../../assets/icons/connectors.png"),
  reminders: require("../../assets/icons/reminders.png"),
  machines: require("../../assets/icons/machines.png"),
  coding: require("../../assets/icons/coding.png"),
  usage: require("../../assets/icons/usage.png"),
  more: require("../../assets/icons/more.png"),
  "chevron-right": require("../../assets/icons/chevron-right.png"),
  send: require("../../assets/icons/send.png"),
  "new-chat": require("../../assets/icons/new-chat.png"),
  history: require("../../assets/icons/history.png"),
  sync: require("../../assets/icons/sync.png"),
  wifi: require("../../assets/icons/wifi.png"),
  globe: require("../../assets/icons/globe.png"),
  shield: require("../../assets/icons/shield.png"),
  check: require("../../assets/icons/check.png"),
  close: require("../../assets/icons/close.png"),
  alert: require("../../assets/icons/alert.png"),
  sparkles: require("../../assets/icons/sparkles.png"),
  cpu: require("../../assets/icons/cpu.png"),
  app: require("../../assets/icons/app.png"),
  memory: require("../../assets/icons/memory.png"),
  phone: require("../../assets/icons/phone.png"),
  copy: require("../../assets/icons/copy.png"),
  external: require("../../assets/icons/external.png"),
  link: require("../../assets/icons/link.png"),
  moon: require("../../assets/icons/moon.png"),
  laptop: require("../../assets/icons/laptop.png"),
  monitor: require("../../assets/icons/monitor.png"),
  plus: require("../../assets/icons/plus.png"),
  trash: require("../../assets/icons/trash.png"),
  vpn: require("../../assets/icons/vpn.png"),
  clock: require("../../assets/icons/clock.png"),
  info: require("../../assets/icons/info.png"),
  "log-out": require("../../assets/icons/log-out.png"),
} as const;

export type IconName = keyof typeof ICONS;
