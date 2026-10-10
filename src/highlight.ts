/**
 * Code highlighting (Shiki, Xcode-inspired dual theme) and math (KaTeX).
 * Tokens carry both light and dark colors as CSS variables, so a code window
 * follows its slide's theme without re-rendering.
 */
import katex from "katex";
import "katex/contrib/mhchem";
import type { HighlighterCore, LanguageRegistration, ThemeRegistration } from "shiki/core";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { esc } from "./util.js";

type LangModule = { default: LanguageRegistration[] };
const LANGS: Record<string, () => Promise<LangModule>> = {
  javascript: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  jsx: () => import("@shikijs/langs/jsx"),
  tsx: () => import("@shikijs/langs/tsx"),
  python: () => import("@shikijs/langs/python"),
  java: () => import("@shikijs/langs/java"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  go: () => import("@shikijs/langs/go"),
  rust: () => import("@shikijs/langs/rust"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  swift: () => import("@shikijs/langs/swift"),
  php: () => import("@shikijs/langs/php"),
  ruby: () => import("@shikijs/langs/ruby"),
  sql: () => import("@shikijs/langs/sql"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  scss: () => import("@shikijs/langs/scss"),
  json: () => import("@shikijs/langs/json"),
  yaml: () => import("@shikijs/langs/yaml"),
  toml: () => import("@shikijs/langs/toml"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  powershell: () => import("@shikijs/langs/powershell"),
  markdown: () => import("@shikijs/langs/markdown"),
  xml: () => import("@shikijs/langs/xml"),
  dart: () => import("@shikijs/langs/dart"),
  r: () => import("@shikijs/langs/r"),
  lua: () => import("@shikijs/langs/lua"),
  docker: () => import("@shikijs/langs/docker"),
  graphql: () => import("@shikijs/langs/graphql"),
  diff: () => import("@shikijs/langs/diff"),
  matlab: () => import("@shikijs/langs/matlab"),
  latex: () => import("@shikijs/langs/latex"),
  vue: () => import("@shikijs/langs/vue"),
  julia: () => import("@shikijs/langs/julia"),
  scala: () => import("@shikijs/langs/scala"),
  haskell: () => import("@shikijs/langs/haskell"),
  asm: () => import("@shikijs/langs/asm"),
};
const ALIASES: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", node: "javascript",
  ts: "typescript", py: "python", python3: "python", "c++": "cpp", cc: "cpp", hpp: "cpp", h: "c",
  cs: "csharp", "c#": "csharp", golang: "go", rs: "rust", kt: "kotlin", rb: "ruby",
  sh: "shellscript", bash: "shellscript", shell: "shellscript", zsh: "shellscript", console: "shellscript",
  ps1: "powershell", pwsh: "powershell", md: "markdown", yml: "yaml", jsonc: "json", json5: "json",
  dockerfile: "docker", tex: "latex", gql: "graphql", htm: "html", svg: "xml", jl: "julia", hs: "haskell",
  mysql: "sql", postgres: "sql", postgresql: "sql", sqlite: "sql", plsql: "sql", tsql: "sql",
};
export const SUPPORTED_LANGS = Object.keys(LANGS);

function theme(name: string, type: "dark" | "light", c: Record<string, string>): ThemeRegistration {
  return {
    name,
    type,
    colors: { "editor.background": c.bg!, "editor.foreground": c.fg! },
    tokenColors: [
      { scope: ["comment", "punctuation.definition.comment", "string.comment"], settings: { foreground: c.comment } },
      {
        scope: [
          "keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "keyword.other",
          "constant.language", "variable.language", "keyword.operator.new", "keyword.operator.expression",
          "keyword.operator.logical.python", "keyword.operator.wordlike", "support.type.primitive",
        ],
        settings: { foreground: c.keyword, fontStyle: "bold" },
      },
      { scope: ["string", "string.quoted", "string.template", "punctuation.definition.string", "string.regexp"], settings: { foreground: c.string } },
      { scope: ["constant.numeric", "constant.character", "constant.other", "keyword.other.unit"], settings: { foreground: c.number } },
      { scope: ["entity.name.function", "support.function", "variable.function", "meta.function-call.generic"], settings: { foreground: c.func } },
      {
        scope: ["entity.name.type", "entity.name.class", "support.class", "support.type", "entity.other.inherited-class", "entity.name.namespace"],
        settings: { foreground: c.type },
      },
      { scope: ["support.function.builtin", "support.type.builtin", "support.class.builtin", "entity.name.type.builtin"], settings: { foreground: c.builtin } },
      {
        scope: ["variable.other.property", "support.variable.property", "meta.object-literal.key", "variable.other.object.property", "entity.name.tag.yaml", "support.type.property-name"],
        settings: { foreground: c.prop },
      },
      {
        scope: ["entity.other.attribute-name", "meta.decorator", "entity.name.function.decorator", "punctuation.decorator", "storage.type.annotation"],
        settings: { foreground: c.attr },
      },
      { scope: ["meta.preprocessor", "keyword.control.directive", "entity.name.function.preprocessor", "keyword.control.import"], settings: { foreground: c.pre } },
      { scope: ["entity.name.tag", "punctuation.definition.tag"], settings: { foreground: c.keyword } },
      { scope: ["variable.parameter", "variable.other", "variable"], settings: { foreground: c.fg } },
      { scope: ["punctuation", "meta.brace", "keyword.operator"], settings: { foreground: c.punct } },
      { scope: ["markup.heading", "markup.bold"], settings: { fontStyle: "bold" } },
      { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
      { scope: ["markup.inserted"], settings: { foreground: c.func } },
      { scope: ["markup.deleted"], settings: { foreground: c.string } },
      { scope: ["invalid"], settings: { foreground: "#ff453a" } },
    ],
  };
}

// Palettes adapted from Xcode's "Default (Dark)" and "Default (Light)".
const DARK = theme("aurora-dark", "dark", {
  bg: "#1f1f24", fg: "#dfdfe0", comment: "#7f8c98", keyword: "#ff7ab2", string: "#ff8170", number: "#d9c97c",
  func: "#67b7a4", type: "#5dd8ff", builtin: "#d0a8ff", prop: "#b281eb", attr: "#cc9768", pre: "#ffa14f", punct: "#a8a8ad",
});
const LIGHT = theme("aurora-light", "light", {
  bg: "#ffffff", fg: "#262626", comment: "#5d6c79", keyword: "#ad3da4", string: "#d12f1b", number: "#272ad8",
  func: "#326d74", type: "#0b4f79", builtin: "#3900a0", prop: "#6c36a9", attr: "#815f03", pre: "#78492a", punct: "#5c5c60",
});

let hlPromise: Promise<HighlighterCore> | undefined;
const getHighlighter = (): Promise<HighlighterCore> =>
  (hlPromise ??= createHighlighterCore({ themes: [DARK, LIGHT], langs: [], engine: createJavaScriptRegexEngine() }));

export function resolveLang(lang: string): string | undefined {
  const l = lang.trim().toLowerCase();
  const id = ALIASES[l] ?? l;
  return LANGS[id] ? id : undefined;
}

export interface CodeHtml {
  /** <span class="ln" data-l="n">…</span> per line */
  html: string;
  lines: number;
  longest: number;
  lang: string;
  known: boolean;
}

export async function highlightCode(code: string, lang: string): Promise<CodeHtml> {
  const src = code.replace(/\r\n/g, "\n").replace(/\t/g, "    ").replace(/\s+$/, "");
  const raw = src.split("\n");
  const longest = Math.max(1, ...raw.map((l) => [...l].length));
  const id = resolveLang(lang);
  if (!id) {
    const html = raw.map((l, i) => `<span class="ln" data-l="${i + 1}">${esc(l) || " "}</span>`).join("\n");
    return { html, lines: raw.length, longest, lang, known: lang === "text" || lang === "plain" || lang === "txt" };
  }
  const h = await getHighlighter();
  if (!h.getLoadedLanguages().includes(id)) await h.loadLanguage((await LANGS[id]!()).default);
  const { tokens } = h.codeToTokens(src, { lang: id, themes: { light: "aurora-light", dark: "aurora-dark" }, defaultColor: false });
  const html = tokens
    .map((line, i) => {
      const inner = line
        .map((t) => {
          const style = t.htmlStyle
            ? Object.entries(t.htmlStyle)
                .map(([k, v]) => `${k}:${v}`)
                .join(";")
            : t.color
              ? `color:${t.color}`
              : "";
          return style ? `<span style="${esc(style)}">${esc(t.content)}</span>` : esc(t.content);
        })
        .join("");
      return `<span class="ln" data-l="${i + 1}">${inner || " "}</span>`;
    })
    .join("\n");
  return { html, lines: tokens.length, longest, lang: id, known: true };
}

/** KaTeX → HTML. Never throws; bad TeX renders as red source text. */
export function createMath(): { render: (tex: string, display: boolean) => string; used: () => boolean } {
  let used = false;
  return {
    render(tex, display) {
      used = true;
      try {
        return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "html", strict: "ignore" });
      } catch {
        return `<span class="math-err">${esc(tex)}</span>`;
      }
    },
    used: () => used,
  };
}