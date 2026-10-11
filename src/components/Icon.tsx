import { Image, type ImageStyle, type StyleProp } from "react-native";
import { colors } from "../lib/theme";
import { ICONS, type IconName } from "./icons";

/** A bundled PNG glyph, tinted. Works the same on Android, iOS, and web. */
export function Icon({
  name,
  size = 20,
  color = colors.text,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={ICONS[name]}
      fadeDuration={0}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size, tintColor: color }, style]}
    />
  );
}
