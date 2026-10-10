/**
 * Mermaid diagrams (flowcharts, mind maps, sequence, state, timelines, charts…) rendered to SVG at build
 * time in the headless Chrome the QA tools already use, coloured from the slide's theme, cached on disk
 * and inlined into the deck. Decks stay small and work offline; the runtime animates the result.
 */
import { existsSync } from "node:fs";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { findBrowser, withPage } from "./browser.js";
import type { Deck } from "./schema.js";
import { appDir, errMsg, hash, PKG_ROOT } from "./util.js";

type ThemeName = Deck["theme"];
type Tone = "dark" | "light";

/* Opaque hex versions of the runtime's theme tokens (the Mermaid theming engine only accepts hex colours). */
const THEMES: Record<ThemeName, { tone: Tone; bg: string; bg2: string; fg: string; fg2: string; accent: string; accent2: string; c: string[] }> = {
  aurora: { tone: "dark", bg: "#04060c", bg2: "#0c1322", fg: "#f3f7fb", fg2: "#9da4b0", accent: "#4fe3b0", accent2: "#47c6f2", c: ["#b5a4ff", "#ffd36b", "#ff8e8e", "#9be38a"] },
  midnight: { tone: "dark", bg: "#000000", bg2: "#121214", fg: "#f5f5f7", fg2: "#a1a1a6", accent: "#2997ff", accent2: "#64d2ff", c: ["#ff9f0a", "#ff5f8f", "#30d158", "#bf5af2"] },
  daylight: { tone: "light", bg: "#f5f5f7", bg2: "#ffffff", fg: "#1d1d1f", fg2: "#6e6e73", accent: "#0071e3", accent2: "#2aa9d6", c: ["#ff9500", "#34c759", "#ff2d55", "#5856d6"] },
  titanium: { tone: "dark", bg: "#0e0f11", bg2: "#1a1b1e", fg: "#f2f0ec", fg2: "#a5a29d", accent: "#ff9f45", accent2: "#ffd08a", c: ["#9fb3c8", "#e66a5c", "#7ccfb0", "#c9b28f"] },
  ocean: { tone: "dark", bg: "#020c16", bg2: "#08192a", fg: "#ecf7ff", fg2: "#94a7b6", accent: "#38c8ff", accent2: "#4be0d0", c: ["#8aa8ff", "#ffd36b", "#ff8a80", "#b4f0a8"] },
  sunset: { tone: "dark", bg: "#120911", bg2: "#21121d", fg: "#fff4ee", fg2: "#bda7a0", accent: "#ff9a5c", accent2: "#ff6b8a", c: ["#ffd36b", "#8fd3ff", "#b9e769", "#d6a2ff"] },
  forest: { tone: "dark", bg: "#050d08", bg2: "#0d1a12", fg: "#f0f7ef", fg2: "#9bab9b", accent: "#8ee07a", accent2: "#e6d36d", c: ["#5cc8b0", "#ff9f6b", "#9fb8ff", "#f28ba8"] },
  paper: { tone: "light", bg: "#f6f1e7", bg2: "#fffdf8", fg: "#25211b", fg2: "#6b6458", accent: "#c2410c", accent2: "#b7791f", c: ["#2f6f6a", "#6b4f9a", "#a0522d", "#5b7a2e"] },
  liquid: { tone: "dark", bg: "#0b1026", bg2: "#141c38", fg: "#ffffff", fg2: "#c4c6cb", accent: "#6fd2ff", accent2: "#ffb36b", c: ["#ff7ab0", "#7cf0c8", "#ffe680", "#c3a8ff"] },
};

/* Apple system colours per tone, as in the runtime stylesheet; named accents pair with a partner colour. */
const NAMED: Record<Tone, Record<string, string>> = {
  dark: { blue: "#0a84ff", purple: "#bf5af2", pink: "#ff375f", red: "#ff453a", orange: "#ff9f0a", yellow: "#ffd60a", green: "#30d158", mint: "#63e6e2", teal: "#40c8e0", cyan: "#64d2ff", indigo: "#7d7aff" },
  light: { blue: "#0066cc", purple: "#8944ab", pink: "#d30f45", red: "#d70015", orange: "#c93400", yellow: "#a05a00", green: "#248a3d", mint: "#0c817b", teal: "#008299", cyan: "#0071a4", indigo: "#3634a3" },
};
const PAIR: Record<string, string> = { blue: "cyan", purple: "pink", pink: "orange", red: "orange", orange: "yellow", yellow: "orange", green: "mint", mint: "teal", teal: "blue", cyan: "blue", indigo: "blue" };

const rgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (c: number[]): string => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
/** a mixed toward b by t (0 = a, 1 = b). */
const mix = (a: string, b: string, t: number): string => {
  const x = rgb(a);
  const y = rgb(b);
  return hex(x.map((v, i) => v + (y[i]! - v) * t));
};

const FONT_FAMILY: Record<string, string> = {
  vietnam: '"Be Vietnam Pro", system-ui, sans-serif',
  inter: '"Inter Variable", Inter, system-ui, sans-serif',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
};

/** Mermaid `base` theme variables matching an Aurora theme (and an optional slide accent). */
export function mermaidTheme(theme: ThemeName, accent: string | undefined, font: string, partnerOf: (h: string) => string): Record<string, unknown> {
  const t = THEMES[theme];
  const dark = t.tone === "dark";
  let acc = t.accent;
  let acc2 = t.accent2;
  if (accent?.startsWith("#")) {
    acc = accent.toLowerCase();
    acc2 = partnerOf(acc);
  } else if (accent && NAMED[t.tone][accent]) {
    acc = NAMED[t.tone][accent]!;
    acc2 = NAMED[t.tone][PAIR[accent] ?? "blue"]!;
  }
  const pal = [acc, acc2, ...t.c];
  const node = mix(t.bg2, acc, dark ? 0.2 : 0.1);
  const node2 = mix(t.bg2, acc2, dark ? 0.2 : 0.12);
  const soft = mix(t.bg2, t.fg, dark ? 0.06 : 0.035);
  const border = mix(t.bg, t.fg, dark ? 0.3 : 0.22);
  const line = mix(t.bg, t.fg, dark ? 0.6 : 0.55);
  const red = NAMED[t.tone].red!;
  const onPal = dark ? "#0b0d12" : "#ffffff";
  const v: Record<string, unknown> = {
    darkMode: dark,
    background: t.bg,
    fontFamily: FONT_FAMILY[font] ?? FONT_FAMILY.vietnam,
    fontSize: "18px",
    primaryColor: node, primaryBorderColor: acc, primaryTextColor: t.fg,
    secondaryColor: node2, secondaryBorderColor: acc2, secondaryTextColor: t.fg,
    tertiaryColor: soft, tertiaryBorderColor: border, tertiaryTextColor: t.fg,
    mainBkg: node, nodeBorder: acc, nodeTextColor: t.fg, textColor: t.fg, titleColor: t.fg,
    lineColor: line, defaultLinkColor: line, arrowheadColor: line, edgeLabelBackground: t.bg2,
    clusterBkg: soft, clusterBorder: border,
    noteBkgColor: mix(t.bg2, pal[3]!, dark ? 0.22 : 0.16), noteBorderColor: pal[3], noteTextColor: t.fg,
    actorBkg: node, actorBorder: acc, actorTextColor: t.fg, actorLineColor: border, signalColor: line, signalTextColor: t.fg,
    labelBoxBkgColor: node, labelBoxBorderColor: acc, labelTextColor: t.fg, loopTextColor: t.fg,
    activationBkgColor: node2, activationBorderColor: acc2, sequenceNumberColor: onPal,
    taskBkgColor: node, taskBorderColor: acc, taskTextColor: t.fg, taskTextDarkColor: t.fg, taskTextLightColor: t.fg, taskTextOutsideColor: t.fg,
    taskTextClickableColor: acc, activeTaskBkgColor: node2, activeTaskBorderColor: acc2, doneTaskBkgColor: soft, doneTaskBorderColor: border,
    critBkgColor: mix(t.bg2, red, 0.3), critBorderColor: red, gridColor: border, todayLineColor: pal[4],
    sectionBkgColor: soft, altSectionBkgColor: t.bg2, sectionBkgColor2: node,
    attributeBackgroundColorOdd: t.bg2, attributeBackgroundColorEven: soft,
    pieStrokeColor: t.bg, pieOuterStrokeColor: border, pieTitleTextColor: t.fg, pieSectionTextColor: onPal, pieLegendTextColor: t.fg, pieOpacity: "0.94",
    quadrantPointFill: acc, quadrantTitleFill: t.fg, quadrantXAxisTextFill: t.fg2, quadrantYAxisTextFill: t.fg2,
    quadrantInternalBorderStrokeFill: border, quadrantExternalBorderStrokeFill: border, quadrantPointTextFill: t.fg,
    quadrant1TextFill: t.fg, quadrant2TextFill: t.fg, quadrant3TextFill: t.fg, quadrant4TextFill: t.fg,
    xyChart: {
      backgroundColor: t.bg, titleColor: t.fg, xAxisLabelColor: t.fg2, xAxisTitleColor: t.fg2, xAxisTickColor: border, xAxisLineColor: border,
      yAxisLabelColor: t.fg2, yAxisTitleColor: t.fg2, yAxisTickColor: border, yAxisLineColor: border, plotColorPalette: pal.join(","),
    },
  };
  for (let i = 0; i < 12; i++) {
    const c = pal[i % pal.length]!;
    v[`cScale${i}`] = mix(t.bg2, c, dark ? 0.52 : 0.3);
    v[`cScaleLabel${i}`] = t.fg;
    v[`cScalePeer${i}`] = c;
    v[`pie${i + 1}`] = i < pal.length ? c : mix(c, t.bg, 0.35);
    if (i < 8) v[`git${i}`] = c;
  }
  return v;
}

/* Label weights. Also set on the render page itself, so Mermaid measures labels at the weight they are shown in. */
const LABEL_CSS =
  ".nodeLabel, .node .label, .mindmap-node .label, .cluster-label, .actor, text.actor > tspan { font-weight: 600; } " +
  ".edgeLabel, .edgeLabel .label, .messageText { font-weight: 500; }";

/** Finishing touches inside the SVG (scoped by Mermaid to the diagram): rounded boxes, soft shadows, medium-weight labels. */
export function mermaidCss(theme: ThemeName): string {
  const shadow = THEMES[theme].tone === "dark" ? "rgba(0,0,0,.32)" : "rgba(30,40,60,.13)";
  return [
    ".node rect.basic, .node rect.label-container { rx: 14px; ry: 14px; }",
    `.node .label-container, .mindmap-node .node-bkg, .actor { filter: drop-shadow(0 10px 22px ${shadow}); }`,
    LABEL_CSS,
    ".edgePaths path { stroke-width: 2px; }",
    ".mindmap-node line { stroke-opacity: 0; }",
    ".labelBkg, .edgeLabel p { border-radius: 8px; }",
    "rect.background { fill: transparent; }",
  ].join(" ");
}

/* Mermaid's sankey parser only accepts ASCII labels: render with ASCII tokens, then put the real labels back. */
function sankeyTokens(code: string): { code: string; names: string[] } | undefined {
  if (!/^\s*sankey(-beta)?\b/.test(code)) return undefined;
  const names: string[] = [];
  const cells = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };
  const token = (v: string): string => {
    if (/^[\x20-\x7e]*$/.test(v) && !/[",]/.test(v)) return v;
    let i = names.indexOf(v);
    if (i < 0) i = names.push(v) - 1;
    return `QQ${i}ZZ`;
  };
  const lines = code.split("\n").map((line, n) => {
    const t = line.trim();
    if (n === 0 || !t || t.startsWith("%%")) return line;
    const c = cells(t);
    return c.length === 3 ? `${token(c[0]!)},${token(c[1]!)},${c[2]}` : line;
  });
  return names.length ? { code: lines.join("\n"), names } : undefined;
}

const xmlEsc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface DiagramJob {
  key: string;
  code: string;
  vars: Record<string, unknown>;
  css: string;
  look: "classic" | "handDrawn";
}

export interface DiagramOut {
  svg?: string;
  error?: string;
  /** Natural size of the drawing (viewBox), used to cap how far the slide may enlarge it. */
  w?: number;
  h?: number;
}

const MERMAID = (): string => join(PKG_ROOT, "assets", "mermaid.min.js");
/** Bump when the render settings below change, so cached drawings are redrawn. */
const RENDER_REV = 3;

let versionCache: string | undefined;
async function mermaidVersion(): Promise<string> {
  if (versionCache) return versionCache;
  try {
    const fh = await open(MERMAID(), "r");
    const buf = Buffer.alloc(64);
    await fh.read(buf, 0, 64, 0);
    await fh.close();
    versionCache = /mermaid ([\d.]+)/.exec(buf.toString("utf8"))?.[1] ?? "unknown";
  } catch {
    versionCache = "missing";
  }
  return versionCache;
}

export function diagramKey(job: Omit<DiagramJob, "key">): string {
  return hash(JSON.stringify([job.code, job.vars, job.css, job.look]), 12);
}

/** Root <svg>: drop Mermaid's fixed width/max-width/background so the slide can size it; read the viewBox. */
function tidy(svg: string): DiagramOut {
  const m = /^<svg\b[^>]*>/.exec(svg.trim());
  if (!m) return { error: "Mermaid returned no SVG" };
  const root = m[0];
  const vb = /viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(root);
  const w = vb ? Math.round(+vb[3]!) : 800;
  const h = vb ? Math.round(+vb[4]!) : 500;
  const clean = root.replace(/\s(width|height|style)="[^"]*"/g, "").replace(/>$/, ` preserveAspectRatio="xMidYMid meet">`);
  return { svg: clean + svg.trim().slice(root.length), w, h };
}

/**
 * Renders every job (cached by code + theme + look + Mermaid version). Errors are per diagram: a syntax error
 * comes back as `error` with Mermaid's message so the agent can fix the code.
 */
export async function renderDiagrams(jobs: DiagramJob[], fontCss: string): Promise<Map<string, DiagramOut>> {
  const out = new Map<string, DiagramOut>();
  if (!jobs.length) return out;
  const version = await mermaidVersion();
  const dir = appDir("cache", "diagrams");
  await mkdir(dir, { recursive: true });
  const file = (j: DiagramJob) => join(dir, `${hash(`${version}|${RENDER_REV}|${j.key}`, 16)}.json`);
  const todo: DiagramJob[] = [];
  for (const j of jobs) {
    try {
      out.set(j.key, JSON.parse(await readFile(file(j), "utf8")) as DiagramOut);
    } catch {
      todo.push(j);
    }
  }
  if (!todo.length) return out;
  if (version === "missing" || !existsSync(MERMAID())) {
    todo.forEach((j) => out.set(j.key, { error: "Mermaid is not installed: run `node scripts/build.mjs` in the Aurora Slides folder." }));
    return out;
  }
  if (!findBrowser()) {
    todo.forEach((j) => out.set(j.key, { error: "Diagrams are drawn with Chrome or Edge at build time, and none was found (set AURORA_BROWSER)." }));
    return out;
  }
  // A tiny page with the deck fonts, so Mermaid measures labels exactly as the slide will show them.
  const page = join(dir, "render.html");
  await writeFile(
    page,
    `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}</style><style>body{margin:0} ${LABEL_CSS}</style>` +
      `<script src="${pathToFileURL(MERMAID()).href}"></script></head><body></body></html>`,
  );
  const tokens = new Map(todo.map((j) => [j.key, sankeyTokens(j.code)]));
  const payload = todo.map((j) => ({ key: j.key, id: `dg-${j.key}`, code: tokens.get(j.key)?.code ?? j.code, vars: j.vars, css: j.css, look: j.look }));
  try {
    const results = await withPage(
      pathToFileURL(page).href,
      { width: 1600, height: 1000 },
      (p) =>
        p.eval<Array<{ key: string; svg?: string; error?: string }>>(
          `(async () => {
            const jobs = ${JSON.stringify(payload).replace(/</g, "\\u003c")};
            const fams = [...new Set(jobs.map((j) => j.vars.fontFamily))];
            if (document.fonts) {
              await Promise.all(fams.flatMap((f) => ["400", "600", "700"].map((w) => document.fonts.load(w + " 18px " + f).catch(() => null))));
              await document.fonts.ready;
            }
            const res = [];
            for (const j of jobs) {
              try {
                mermaid.initialize({
                  startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, theme: "base", look: j.look,
                  handDrawnSeed: 7, themeVariables: j.vars, themeCSS: j.css, fontFamily: j.vars.fontFamily,
                  flowchart: { htmlLabels: true, padding: 16, wrappingWidth: 280 }, state: { wrappingWidth: 280 }, mindmap: { padding: 18 },
                });
                await mermaid.parse(j.code);
                const r = await mermaid.render(j.id, j.code);
                res.push({ key: j.key, svg: r.svg });
              } catch (e) {
                res.push({ key: j.key, error: String((e && (e.message || e.str)) || e) });
              }
              for (const id of [j.id, "d" + j.id, "i" + j.id]) document.getElementById(id)?.remove();
            }
            return res;
          })()`,
          120000,
        ),
      false,
    );
    for (const r of results) {
      const job = todo.find((j) => j.key === r.key)!;
      const names = tokens.get(r.key)?.names;
      const svg = r.svg && names ? r.svg.replace(/QQ(\d+)ZZ/g, (m, i: string) => (names[+i] !== undefined ? xmlEsc(names[+i]!) : m)) : r.svg;
      const done = svg ? tidy(svg) : { error: (r.error ?? "unknown error").replace(/\s+$/, "") };
      out.set(r.key, done);
      if (done.svg) await writeFile(file(job), JSON.stringify(done)).catch(() => {});
    }
  } catch (e) {
    todo.forEach((j) => out.set(j.key, { error: `Browser step failed: ${errMsg(e)}` }));
  }
  return out;
}
