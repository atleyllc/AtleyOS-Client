import { Image } from "react-native";
import { tabIconName } from "../lib/tabIcons";
import { TAB_ICONS } from "./icons";

/**
 * Tab glyphs are ordinary images.
 * Icon fonts (Ionicons, Material Symbols) draw an empty box when the font
 * is missing from the Android or iOS build. A tint filter can do the same
 * on web. These files already contain the glyph, in the active and inactive
 * colors, so nothing has to load a font or recolor the pixels.
 */

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
  const source = focused ? TAB_ICONS[name].active : TAB_ICONS[name].inactive;
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
