/** Small Markdown reader for chat replies: fenced code, headings, lists, quotes, paragraphs. */

export type MdInline = { text: string; bold?: boolean; italic?: boolean; code?: boolean; href?: string };

export type MdBlock =
  | { type: "code"; lang: string; text: string }
  | { type: "heading"; level: number; inline: MdInline[] }
  | { type: "list"; ordered: boolean; items: MdInline[][] }
  | { type: "quote"; inline: MdInline[] }
  | { type: "paragraph"; inline: MdInline[] };

const INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;

export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ text: text.slice(last, index) });
    const token = match[0];
    if (match[1]) out.push({ text: token.slice(1, -1), code: true });
    else if (match[2] || match[3]) out.push({ text: token.slice(2, -2), bold: true });
    else if (match[4]) out.push({ text: token.slice(1, -1), italic: true });
    else if (match[5]) {
      const close = token.indexOf("](");
      out.push({ text: token.slice(1, close), href: token.slice(close + 2, -1) });
    }
    last = index + token.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text: "" }];
}

export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "paragraph", inline: parseInline(para.join("\n")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      blocks.push({ type: "code", lang: fence[1] || "", text: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: heading[1].length, inline: parseInline(heading[2].trim()) });
      continue;
    }
    const bullet = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      const ordered = /\d/.test(bullet[1]);
      const prev = blocks[blocks.length - 1];
      const item = parseInline(bullet[2]);
      if (prev && prev.type === "list" && prev.ordered === ordered) prev.items.push(item);
      else blocks.push({ type: "list", ordered, items: [item] });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      blocks.push({ type: "quote", inline: parseInline(quote[1]) });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}
