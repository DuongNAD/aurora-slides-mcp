import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION = "0.8.0";
/** Package root (works from dist/aurora.mjs and from src/*.ts). */
export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const UA = `AuroraSlides/${VERSION} (self-study slide builder; Model Context Protocol server) Node.js/${process.versions.node}`;

/** Per-user cache/app folder. Kept off the project drive on purpose (exFAT cluster slack). */
export function appDir(...parts: string[]): string {
  const base =
    process.env.AURORA_HOME ??
    (process.platform === "win32"
      ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "aurora-slides")
      : process.platform === "darwin"
        ? join(homedir(), "Library", "Caches", "aurora-slides")
        : join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "aurora-slides"));
  return join(base, ...parts);
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]!);

export const hash = (s: string, n = 8): string => createHash("sha1").update(s).digest("hex").slice(0, n);

export function slugify(s: string, fallback = "deck"): string {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || fallback
  );
}

export async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")) as T;
  } catch {
    return undefined;
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, headers: { "User-Agent": UA, ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(t);
  }
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Count words the way a reader perceives them (markup stripped). */
export function wordCount(s: string | undefined): number {
  if (!s) return 0;
  return s
    .replace(/\$[^$]*\$/g, " x ")
    .replace(/[*_=+~`[\]()#>]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/* ───────────── LaTeX repair ─────────────
 * An agent that types "\\\\text{Question}" into deck JSON stores `\\text{Question}`. KaTeX reads `\\` as a line break, so the
 * formula prints "textQuestion" on a new line and a notebook page stacks it over the lines below (AMD Lab 1 deck, 2026-10-12).
 * An even run of backslashes that sits directly in front of a TeX command name is never a deliberate line break (a break is
 * followed by a space, a newline, a digit or "[2pt]"), so it collapses to the command's single backslash. Matrix and aligned
 * rows keep their breaks: `a & b \\ c & d` and `1&0\\0&1` are left alone. */

// Command names agents double-escape in practice. A bare word that is not listed is only repaired when "{" follows it.
const TEX_COMMANDS = new Set(
  [
    "text|textbf|textit|textrm|textsf|texttt|mathrm|mathbf|mathit|mathsf|mathtt|mathbb|mathcal|mathfrak|mathscr|operatorname|boldsymbol",
    "frac|dfrac|tfrac|cfrac|sqrt|sum|prod|int|iint|oint|lim|limsup|liminf|max|min|sup|inf|log|ln|lg|exp|sin|cos|tan|cot|sec|csc",
    "arcsin|arccos|arctan|sinh|cosh|tanh|det|dim|ker|gcd|arg|deg|Pr|hom|to|gets|mapsto|rightarrow|leftarrow|leftrightarrow",
    "Rightarrow|Leftarrow|Leftrightarrow|longrightarrow|longleftarrow|longleftrightarrow|implies|impliedby|iff|uparrow|downarrow",
    "updownarrow|nearrow|searrow|rightleftharpoons|xrightarrow|xleftarrow|cdot|cdots|ldots|dots|vdots|ddots|times|div|pm|mp|ast",
    "star|circ|bullet|oplus|ominus|otimes|oslash|odot|cup|cap|setminus|subset|subseteq|supset|supseteq|in|notin|ni|emptyset",
    "varnothing|forall|exists|nexists|neg|lnot|land|lor|wedge|vee|leq|geq|le|ge|neq|ne|approx|sim|simeq|cong|equiv|propto|ll|gg",
    "perp|parallel|mid|nmid|infty|partial|nabla|angle|triangle|prime|hbar|ell|Re|Im|aleph|alpha|beta|gamma|delta|epsilon",
    "varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi",
    "psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|left|right|big|Big|bigg|Bigg|langle|rangle|lceil",
    "rceil|lfloor|rfloor|lvert|rvert|lVert|rVert|vec|hat|bar|tilde|dot|ddot|overline|underline|overbrace|underbrace",
    "overrightarrow|widehat|widetilde|binom|choose|begin|end|quad|qquad|space|hspace|vspace|phantom|displaystyle|textstyle",
    "scriptstyle|limits|nolimits|overset|underset|stackrel|substack|boxed|cancel|color|textcolor|ce|pu|rm|bf|it|cal|not|colon",
    "bmod|pmod|pod|mod|Bbb|ket|bra|braket|dagger|hline",
  ]
    .join("|")
    .split("|"),
);

// An even run of backslashes (not preceded by another one), a letter run, then an optional "{".
const TEX_OVERESCAPED = /(?<!\\)((?:\\\\)+)([A-Za-z]{2,})(?![A-Za-z])(\{?)/g;
// $$display$$ and $inline$ spans inside markup text.
const TEX_SPAN = /\$\$[^$]+\$\$|\$[^$\n]+\$/g;

export interface TexRepair {
  text: string;
  /** How many commands lost their extra backslash. */
  fixed: number;
  /** First repaired command name, for the message. */
  first?: string;
}

/** Repairs a pure TeX string (no $ delimiters). */
export function repairTex(tex: string): TexRepair {
  if (!tex.includes("\\\\")) return { text: tex, fixed: 0 };
  let fixed = 0;
  let first: string | undefined;
  const text = tex.replace(TEX_OVERESCAPED, (all, _run: string, name: string, brace: string) => {
    if (!TEX_COMMANDS.has(name) && !brace) return all;
    fixed++;
    first ??= name;
    return "\\" + name + brace;
  });
  return { text, fixed, first };
}

/** Repairs the $…$ and $$…$$ spans of a markup string; text outside the spans is left alone. */
export function repairTexSpans(src: string): TexRepair {
  if (!src.includes("\\\\") || !src.includes("$")) return { text: src, fixed: 0 };
  let fixed = 0;
  let first: string | undefined;
  const text = src.replace(TEX_SPAN, (span) => {
    const r = repairTex(span);
    fixed += r.fixed;
    first ??= r.first;
    return r.text;
  });
  return { text, fixed, first };
}

// Fields whose text is code, terminal output or markup, never math.
const NOT_MATH = new Set(["code", "output", "command", "html", "css", "svg"]);

function fixTexString(s: string, key: string | undefined, type: string | undefined, t: { fixed: number; first?: string }): string {
  let r: TexRepair;
  if (type === "notebook" && key === "lines" && s.startsWith("= ")) {
    const inner = repairTex(s.slice(2));
    r = { ...inner, text: "= " + inner.text };
  } else if (type === "formula" && (key === "formula" || key === "symbol")) r = repairTex(s);
  else r = repairTexSpans(s);
  if (r.fixed) {
    t.fixed += r.fixed;
    t.first ??= r.first;
  }
  return r.text;
}

function fixTexNode(node: unknown, key: string | undefined, type: string | undefined, t: { fixed: number; first?: string }): void {
  if (Array.isArray(node)) {
    node.forEach((x, i) => {
      if (typeof x === "string") node[i] = fixTexString(x, key, type, t);
      else fixTexNode(x, key, type, t);
    });
  } else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) {
      if (NOT_MATH.has(k)) continue;
      if (typeof v === "string") o[k] = fixTexString(v, k, type, t);
      else fixTexNode(v, k, type, t);
    }
  }
}

/**
 * Walks the slides of a raw deck and repairs doubled backslashes in math (`= ` notebook lines, formula slides and every
 * $…$ span). Returns the input untouched when nothing needs repair; otherwise a repaired deep copy and one note per slide.
 */
export function repairDeckTex(raw: unknown): { value: unknown; fixes: string[] } {
  const slides = (raw as { slides?: unknown } | null)?.slides;
  if (!raw || typeof raw !== "object" || !Array.isArray(slides)) return { value: raw, fixes: [] };
  // Cheap pre-check: nothing to repair without a doubled backslash in the serialised deck (four characters in JSON text).
  let json: string;
  try {
    json = JSON.stringify(raw);
  } catch {
    return { value: raw, fixes: [] };
  }
  if (!json.includes("\\\\\\\\")) return { value: raw, fixes: [] };
  const copy = structuredClone(raw) as { slides: unknown[] };
  const fixes: string[] = [];
  copy.slides.forEach((slide, i) => {
    if (!slide || typeof slide !== "object") return;
    const type = (slide as { type?: unknown }).type;
    const t: { fixed: number; first?: string } = { fixed: 0 };
    fixTexNode(slide, undefined, typeof type === "string" ? type : undefined, t);
    if (t.fixed) {
      fixes.push(
        `slide ${i + 1} (${String(type)}): fixed ${t.fixed} LaTeX command(s) written with a doubled backslash, e.g. \\\\${t.first} became \\${t.first}. ` +
          "KaTeX reads \\\\ as a line break, which stacked the formula over the lines below. In deck JSON one backslash is typed as two (\\\\text), never four.",
      );
    }
  });
  return fixes.length ? { value: copy, fixes } : { value: raw, fixes: [] };
}