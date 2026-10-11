import { Image } from "react-native";
import { tabIconName, type TabIconName } from "../lib/tabIcons";

/**
 * Tab glyphs are ordinary images.
 * Icon fonts (Ionicons, Material Symbols) draw an empty box when the font
 * is missing from the Android or iOS build. A tint filter can do the same
 * on web. These files already contain the glyph, in the active and inactive
 * colors, so nothing has to load a font or recolor the pixels.
 */
const SOURCES: Record<TabIconName, { active: number; inactive: number }> = {
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

export function TabIcon({
  route,
  focused = false,
  size = 24,
}: {
  route: string;
  focused?: boolean;
  size?: number;
}) {
  const name = tabIconName(route);
  if (!name) return null;
  const source = focused ? SOURCES[name].active : SOURCES[name].inactive;
  return (
    <Image
      source={source}
      resizeMode="contain"
      fadeDuration={0}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    />
  );
}
