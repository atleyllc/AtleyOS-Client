import { Fragment } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { parseMarkdown, type MdInline } from "../lib/markdown";
import { colors, space } from "../lib/theme";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function Inline({ parts }: { parts: MdInline[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <Text
          key={index}
          style={[
            part.bold && styles.bold,
            part.italic && styles.italic,
            part.code && styles.inlineCode,
            part.href ? styles.link : null,
          ]}
          onPress={part.href ? () => void Linking.openURL(part.href!) : undefined}
        >
          {part.text}
        </Text>
      ))}
    </>
  );
}

/** Chat reply text with headings, lists, quotes, and code blocks (each with Copy). */
export function Markdown({ text, color = colors.text }: { text: string; color?: string }) {
  const blocks = parseMarkdown(text);
  return (
    <View style={styles.root}>
      {blocks.map((block, index) => {
        if (block.type === "code") {
          return (
            <View key={index} style={styles.code}>
              <View style={styles.codeHead}>
                <Text style={styles.codeLang}>{block.lang || "code"}</Text>
                <Pressable
                  onPress={() => void Clipboard.setStringAsync(block.text)}
                  accessibilityRole="button"
                  accessibilityLabel="Copy code"
                  hitSlop={8}
                >
                  <Text style={styles.copy}>Copy</Text>
                </Pressable>
              </View>
              <Text style={styles.codeText} selectable>
                {block.text}
              </Text>
            </View>
          );
        }
        if (block.type === "heading") {
          return (
            <Text key={index} style={[styles.text, { color }, styles.heading, block.level <= 2 && styles.headingBig]}>
              <Inline parts={block.inline} />
            </Text>
          );
        }
        if (block.type === "list") {
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, i) => (
                <View key={i} style={styles.listRow}>
                  <Text style={[styles.text, { color }, styles.bullet]}>{block.ordered ? `${i + 1}.` : "•"}</Text>
                  <Text style={[styles.text, { color }, styles.flex]} selectable>
                    <Inline parts={item} />
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        if (block.type === "quote") {
          return (
            <Text key={index} style={[styles.text, styles.quote]} selectable>
              <Inline parts={block.inline} />
            </Text>
          );
        }
        return (
          <Fragment key={index}>
            <Text style={[styles.text, { color }]} selectable>
              <Inline parts={block.inline} />
            </Text>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  text: { color: colors.text, lineHeight: 21, fontSize: 15 },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  inlineCode: { fontFamily: MONO, backgroundColor: colors.bg, fontSize: 13 },
  link: { color: colors.accent, textDecorationLine: "underline" },
  heading: { fontWeight: "700" },
  headingBig: { fontSize: 17 },
  list: { gap: 2 },
  listRow: { flexDirection: "row", gap: 6 },
  bullet: { minWidth: 16 },
  flex: { flex: 1 },
  quote: { color: colors.muted, borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: space.sm },
  code: { backgroundColor: colors.bg, borderRadius: 10, padding: space.sm, gap: 4 },
  codeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  codeLang: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  copy: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  codeText: { color: colors.text, fontFamily: MONO, fontSize: 13, lineHeight: 18 },
});
