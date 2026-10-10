import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION = "0.5.0";
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

export function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "deck"
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