/**
 * Inline markup → HTML.
 *   **bold**  *italic*  ==marker==  ++gradient++  ~~strike~~  `code`
 *   [link](https://…)  $inline LaTeX$  $$display LaTeX$$  [[cloze blank]]
 *   <sub> <sup> <kbd> <u> <br> and "\n" line breaks. Everything else is escaped.
 * With `words`, every word is wrapped in <span class="w"> so the runtime can
 * choreograph Apple-style word-by-word reveals without touching layout.
 */
import { esc } from "./util.js";

export interface MarkupOptions {
  words?: boolean;
  math?: (tex: string, display: boolean) => string;
  /** Mutable counter: when present, [[blanks]] become cloze steps. */
  cloze?: { n: number; input?: boolean; ariaLabel?: string };
}

type Node =
  | { k: "text"; v: string }
  | { k: "br" }
  | { k: "raw"; html: string }
  | { k: "blank"; v: string; alts: string[]; step: number }
  | { k: "tag"; tag: string; href?: string; kids: Node[] };

const DELIMS: Array<[string, string]> = [
  ["**", "strong"],
  ["==", "mark"],
  ["++", "grad"],
  ["~~", "s"],
  ["*", "em"],
  ["_", "em"],
];
const HTML_TAGS = new Set(["sub", "sup", "kbd", "u", "b", "strong", "i", "em", "mark", "small", "s"]);
const isWordChar = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}]/u.test(c);
const isSpace = (c: string | undefined): boolean => !c || /\s/.test(c);

// ** may sit inside a word ("Sin **đ**i **h**ọc" bolds single letters for mnemonics); other marks need word boundaries (snake_case).
function canOpen(src: string, i: number, mark: string): boolean {
  return !isSpace(src[i + mark.length]) && (mark === "**" || !isWordChar(src[i - 1]));
}

function findClose(src: string, from: number, mark: string): number {
  for (let j = from + 1; j <= src.length - mark.length; j++) {
    if (!src.startsWith(mark, j)) continue;
    if (isSpace(src[j - 1]) || (mark !== "**" && isWordChar(src[j + mark.length]))) continue;
    if (mark.length === 1 && (src[j + 1] === mark || src[j - 1] === mark)) continue;
    return j;
  }
  return -1;
}

function findInlineMathEnd(src: string, i: number): number {
  if (isSpace(src[i + 1]) || src[i + 1] === "$") return -1;
  for (let j = i + 2; j < src.length; j++) {
    if (src[j] === "\n") return -1;
    if (src[j] === "$" && !isSpace(src[j - 1]) && src[j - 1] !== "\\" && !/\d/.test(src[j + 1] ?? "")) return j;
  }
  return -1;
}

function parse(src: string, o: MarkupOptions): Node[] {
  const out: Node[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ k: "text", v: buf });
    buf = "";
  };
  let i = 0;
  outer: while (i < src.length) {
    const ch = src[i]!;
    if (ch === "\\" && "*_=+`$[]~\\<".includes(src[i + 1] ?? "\0")) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === "\n") {
      flush();
      out.push({ k: "br" });
      i++;
      continue;
    }
    if (ch === "`") {
      const j = src.indexOf("`", i + 1);
      if (j > i + 1) {
        flush();
        out.push({ k: "raw", html: `<code>${esc(src.slice(i + 1, j))}</code>` });
        i = j + 1;
        continue;
      }
    }
    if (ch === "$" && o.math) {
      if (src.startsWith("$$", i)) {
        const j = src.indexOf("$$", i + 2);
        if (j > i + 2) {
          flush();
          out.push({ k: "raw", html: o.math(src.slice(i + 2, j), true) });
          i = j + 2;
          continue;
        }
      } else {
        const j = findInlineMathEnd(src, i);
        if (j > 0) {
          flush();
          out.push({ k: "raw", html: o.math(src.slice(i + 1, j), false) });
          i = j + 1;
          continue;
        }
      }
    }
    if (ch === "[") {
      if (o.cloze && src.startsWith("[[", i)) {
        const j = src.indexOf("]]", i + 2);
        if (j > i + 2) {
          flush();
          const raw = src.slice(i + 2, j);
          const parts = raw.split("|").map((p) => p.trim());
          out.push({ k: "blank", v: parts[0]!, alts: parts, step: ++o.cloze.n });
          i = j + 2;
          continue;
        }
      }
      const m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        flush();
        const href = /^(https?:|#|\.{0,2}\/|mailto:)/i.test(m[2]!) ? m[2]! : "#";
        out.push({ k: "tag", tag: "a", href, kids: parse(m[1]!, o) });
        i += m[0].length;
        continue;
      }
    }
    if (ch === "<") {
      const m = /^<(br|[a-z]+)\s*\/?>/i.exec(src.slice(i));
      if (m) {
        const tag = m[1]!.toLowerCase();
        if (tag === "br") {
          flush();
          out.push({ k: "br" });
          i += m[0].length;
          continue;
        }
        if (HTML_TAGS.has(tag)) {
          const close = src.toLowerCase().indexOf(`</${tag}>`, i + m[0].length);
          if (close > 0) {
            flush();
            out.push({ k: "tag", tag, kids: parse(src.slice(i + m[0].length, close), o) });
            i = close + tag.length + 3;
            continue;
          }
        }
      }
    }
    for (const [mark, tag] of DELIMS) {
      if (src.startsWith(mark, i) && canOpen(src, i, mark)) {
        const j = findClose(src, i + mark.length, mark);
        if (j > 0) {
          flush();
          out.push({ k: "tag", tag, kids: parse(src.slice(i + mark.length, j), o) });
          i = j + mark.length;
          continue outer;
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

const wrapWords = (s: string): string =>
  s
    .split(/(\s+)/)
    .map((part) => (part === "" ? "" : /^\s+$/.test(part) ? " " : `<span class="w">${esc(part)}</span>`))
    .join("");

function render(nodes: Node[], words: boolean, o: MarkupOptions = {}): string {
  let html = "";
  for (const n of nodes) {
    switch (n.k) {
      case "text":
        html += words ? wrapWords(n.v) : esc(n.v);
        break;
      case "br":
        html += "<br>";
        break;
      case "raw":
        html += words ? `<span class="w wi">${n.html}</span>` : n.html;
        break;
      case "blank":
        if (o.cloze?.input) {
          const maxLen = Math.max(...n.alts.map((a) => a.length));
          const w = Math.max(4, maxLen);
          const altsStr = n.alts.join("|");
          const ariaLbl = `${o.cloze.ariaLabel || "Ô trống"} ${n.step}`;
          html += `<span class="cz-blank-wrap"><input class="cz-in" data-ans="${esc(n.v)}" data-alt="${esc(altsStr)}" aria-label="${esc(ariaLbl)}" style="width:${w}ch" autocomplete="off" spellcheck="false" autocapitalize="off"><span class="cz-mark" aria-hidden="true"></span><span class="cz-fb" aria-live="polite"></span></span>`;
        } else {
          html += `<span class="blank" data-step="${n.step}" tabindex="0" role="button" aria-label="Hiện đáp án"><span class="b-ans">${esc(n.v)}</span></span>`;
        }
        break;
      case "tag": {
        // Gradient and marker runs stay atomic so the gradient/sweep is continuous.
        const atomic = n.tag === "grad" || n.tag === "mark";
        const inner = render(n.kids, words && !atomic, o);
        let el: string;
        if (n.tag === "grad") el = `<span class="grad">${inner}</span>`;
        else if (n.tag === "a") el = `<a href="${esc(n.href)}" target="_blank" rel="noopener">${inner}</a>`;
        else el = `<${n.tag}>${inner}</${n.tag}>`;
        html += words && atomic ? `<span class="w wi">${el}</span>` : el;
        break;
      }
    }
  }
  return html;
}

/** Inline markup (titles, labels, one-liners). */
export function inline(src: string | undefined, o: MarkupOptions = {}): string {
  if (!src) return "";
  return render(parse(src, o), !!o.words, o);
}

/** Paragraph markup: blank lines split paragraphs, "- " lines become a list. */
export function block(src: string | undefined, o: MarkupOptions = {}): string {
  if (!src) return "";
  return src
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n\s*\n/)
    .map((para) => {
      const lines = para.split("\n");
      if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ""), o)}</li>`).join("")}</ul>`;
      }
      return `<p>${inline(para, o)}</p>`;
    })
    .join("");
}

/** Plain text (for alt text, titles in <title>, aria labels). */
export function plain(src: string | undefined): string {
  if (!src) return "";
  return src
    .replace(/\$\$?([^$]+)\$\$?/g, "$1")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|==|\+\+|~~|\*|_|`)/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}