/**
 * Bundled icon images. Every glyph in the app is a PNG, so nothing depends
 * on an icon font being loaded on Android or iOS. scripts/check-app-assets.mjs
 * fails the build if a tab has no image here.
 */
import type { TabIconName } from "../lib/tabIcons";

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
