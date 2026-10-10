/**
 * Images the agent did not find on the web:
 *  - picture requests (the default, AURORA_IMAGE_PROVIDER=agent): a slide's `generate` prompt is never sent to an
 *    image API at build time; the build lists it and the coding agent makes the picture with its own image tool
 *    (e.g. Antigravity) and files it with importImage({slot}) as images/gen-<id>.*;
 *  - generateImage: AI generation through keyless Pollinations, or OpenAI (gpt-image) / Gemini only when the user
 *    opts in with AURORA_IMAGE_PROVIDER, cached on the user's cache drive so rebuilds never pay twice;
 *  - importImage: bring a file the agent made itself, a URL or base64 into the deck's images/ folder so the deck
 *    stays portable.
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { Orientation } from "./media.js";
import { appDir, errMsg, fetchWithTimeout, hash, slugify } from "./util.js";

export type GenProvider = "openai" | "gemini" | "pollinations";
/** How `generate` prompts become pictures (AURORA_IMAGE_PROVIDER). */
export type ImageMode = "agent" | "auto" | GenProvider;

const MODES: ImageMode[] = ["agent", "auto", "openai", "gemini", "pollinations"];

/**
 * agent (default): builds never call an image API; prompts become requests the coding agent fills itself.
 * auto: OpenAI, then Gemini (when their keys are set), then Pollinations. openai | gemini | pollinations: that one.
 * Keys in the environment are ignored unless the user picks auto, openai or gemini here.
 */
export function imageMode(): ImageMode {
  const v = (process.env.AURORA_IMAGE_PROVIDER ?? "").trim().toLowerCase() as ImageMode;
  return MODES.includes(v) ? v : "agent";
}

const keyAllowed = (p: GenProvider, mode: ImageMode): boolean => p === "pollinations" || mode === "auto" || mode === p;

export interface GenOptions {
  prompt: string;
  orientation?: Orientation;
  transparent?: boolean;
  provider?: GenProvider | "auto";
  quality?: "low" | "medium" | "high";
}

interface GenResult {
  data: Buffer;
  ext: string;
  provider: GenProvider;
  model: string;
}

export function availableGenerators(mode = imageMode()): GenProvider[] {
  const list: GenProvider[] = [];
  if (process.env.OPENAI_API_KEY && keyAllowed("openai", mode)) list.push("openai");
  if ((process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) && keyAllowed("gemini", mode)) list.push("gemini");
  list.push("pollinations");
  return list;
}

const shape = (o: Orientation | undefined): "landscape" | "portrait" | "square" => (o === "portrait" ? "portrait" : o === "square" ? "square" : "landscape");

async function openai(o: GenOptions): Promise<GenResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const model = process.env.AURORA_OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  const size = { landscape: "1536x1024", portrait: "1024x1536", square: "1024x1024" }[shape(o.orientation)];
  const ext = o.transparent ? "png" : "webp";
  const body: Record<string, unknown> = { model, prompt: o.prompt, size, n: 1, quality: o.quality ?? "medium", output_format: ext };
  if (o.transparent) body.background = "transparent";
  else body.output_compression = 84;
  const res = await fetchWithTimeout(
    "https://api.openai.com/v1/images/generations",
    { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
    240000,
  );
  const json = (await res.json().catch(() => ({}))) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("the response contained no image");
  return { data: Buffer.from(b64, "base64"), ext, provider: "openai", model };
}

async function gemini(o: GenOptions): Promise<GenResult> {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.AURORA_GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
  const aspectRatio = { landscape: "16:9", portrait: "3:4", square: "1:1" }[shape(o.orientation)];
  const prompt = o.prompt + (o.transparent ? " Isolated object on a plain pure white background, no shadow." : "");
  const call = async (withConfig: boolean) => {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], ...(withConfig ? { imageConfig: { aspectRatio } } : {}) },
    };
    return fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      240000,
    );
  };
  let res = await call(true);
  if (res.status === 400) res = await call(false);
  type Part = { inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } };
  const json = (await res.json().catch(() => ({}))) as { candidates?: Array<{ content?: { parts?: Part[] } }>; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data || p.inline_data?.data);
  const data = part?.inlineData?.data ?? part?.inline_data?.data;
  const mime = part?.inlineData?.mimeType ?? part?.inline_data?.mime_type ?? "image/png";
  if (!data) throw new Error("the response contained no image");
  return { data: Buffer.from(data, "base64"), ext: mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png", provider: "gemini", model };
}

async function pollinations(o: GenOptions): Promise<GenResult> {
  const [w, h] = { landscape: [1600, 900], portrait: [960, 1280], square: [1024, 1024] }[shape(o.orientation)];
  const seed = parseInt(hash(o.prompt, 6), 16) % 1000000;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(o.prompt)}?width=${w}&height=${h}&nologo=true&seed=${seed}`;
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithTimeout(url, {}, 150000);
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && type.startsWith("image/")) {
        return { data: Buffer.from(await res.arrayBuffer()), ext: type.includes("png") ? "png" : "jpg", provider: "pollinations", model: "default" };
      }
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = errMsg(e);
    }
    await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
  }
  throw new Error(`Pollinations is busy (${last}); make the picture with your own image tool and import it with aurora_add_image`);
}

async function generate(o: GenOptions): Promise<GenResult> {
  const mode = imageMode();
  if (o.provider && o.provider !== "auto" && !keyAllowed(o.provider, mode))
    throw new Error(
      `${o.provider} is off: Aurora spends API keys only when the user sets AURORA_IMAGE_PROVIDER=${o.provider} (or auto). ` +
        `Make the picture with your own image tool and import it with aurora_add_image, or use provider "pollinations" (free).`,
    );
  const order: GenProvider[] = o.provider && o.provider !== "auto" ? [o.provider] : availableGenerators(mode);
  const errors: string[] = [];
  for (const p of order) {
    try {
      return p === "openai" ? await openai(o) : p === "gemini" ? await gemini(o) : await pollinations(o);
    } catch (e) {
      errors.push(`${p}: ${errMsg(e)}`);
    }
  }
  throw new Error(`Image generation failed (${errors.join("; ")})`);
}

export const genKey = (prompt: string, orientation: Orientation | undefined, transparent: boolean | undefined): string =>
  hash(JSON.stringify([prompt.trim(), shape(orientation), !!transparent]), 16);

const GEN_EXTS = ["png", "webp", "jpg", "jpeg", "gif", "svg"];

/** A picture already made for this prompt key: images/gen-<key>.* in the deck folder first, then the generation cache. */
export function findGenerated(key: string, deckDir: string): { file: string; inDeck: boolean } | undefined {
  for (const ext of GEN_EXTS) {
    const f = join(deckDir, "images", `gen-${key}.${ext}`);
    if (existsSync(f)) return { file: f, inDeck: true };
  }
  for (const ext of GEN_EXTS) {
    const f = join(appDir("cache", "gen"), `${key}.${ext}`);
    if (existsSync(f)) return { file: f, inDeck: false };
  }
  return undefined;
}

/** Accepts "3f2a…", "gen-3f2a…" or "images/gen-3f2a….png" and returns the 16-hex id of a picture request. */
export function requestId(s: string): string | undefined {
  const last = s.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  return /^(?:gen-)?([0-9a-f]{16})(?:\.[a-z]+)?$/i.exec(last)?.[1]?.toLowerCase();
}

/** Generates (or reuses from the cache) an image; returns the cached file. */
export async function generateCached(o: GenOptions): Promise<{ file: string; key: string; cached: boolean; provider?: GenProvider; model?: string }> {
  const key = genKey(o.prompt, o.orientation, o.transparent);
  const dir = appDir("cache", "gen");
  for (const ext of ["webp", "png", "jpg"]) {
    const f = join(dir, `${key}.${ext}`);
    if (existsSync(f)) return { file: f, key, cached: true };
  }
  const r = await generate(o);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${key}.${r.ext}`);
  await writeFile(file, r.data);
  return { file, key, cached: false, provider: r.provider, model: r.model };
}

/** Copies a file into <deckDir>/images/ (once) and returns the src to use in the deck. */
export async function placeInDeck(file: string, deckDir: string, name: string): Promise<string> {
  const ext = extname(file).toLowerCase() || ".png";
  const rel = `images/${name}${ext}`;
  const target = join(deckDir, rel);
  if (!existsSync(target)) {
    await mkdir(join(deckDir, "images"), { recursive: true });
    await copyFile(file, target);
  }
  return rel;
}

const SIG: Array<[string, number[]]> = [
  [".png", [0x89, 0x50, 0x4e, 0x47]],
  [".jpg", [0xff, 0xd8, 0xff]],
  [".gif", [0x47, 0x49, 0x46]],
  [".webp", [0x52, 0x49, 0x46, 0x46]],
];

function sniff(buf: Buffer, fallback: string): string {
  for (const [ext, bytes] of SIG) if (bytes.every((b, i) => buf[i] === b)) return ext;
  if (/^\s*<(\?xml|svg)/i.test(buf.subarray(0, 200).toString("utf8"))) return ".svg";
  return fallback;
}

export interface ImportSource {
  path?: string;
  url?: string;
  base64?: string;
  name?: string;
  /** Picture request id: the file becomes images/gen-<id>.* and replaces an earlier picture for that request. */
  slot?: string;
}

/** Brings an image the agent made or found into the deck folder. */
export async function importImage(src: ImportSource, deckDir: string): Promise<{ src: string; file: string; bytes: number; id?: string }> {
  const id = src.slot === undefined ? undefined : requestId(src.slot);
  if (src.slot !== undefined && !id) throw new Error(`"${src.slot}" is not a picture request id (16 hex characters, as listed by the build, e.g. gen-3f2a9c41b0d7e865)`);
  let buf: Buffer;
  let hint = ".png";
  if (src.path) {
    const abs = resolve(src.path);
    const info = await stat(abs).catch(() => undefined);
    if (!info?.isFile()) throw new Error(`File not found: ${abs}`);
    buf = await readFile(abs);
    hint = extname(abs).toLowerCase() || hint;
  } else if (src.url) {
    const res = await fetchWithTimeout(src.url, {}, 60000);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    hint = extname(new URL(src.url).pathname).toLowerCase() || hint;
  } else if (src.base64) {
    buf = Buffer.from(src.base64.replace(/^data:[^,]+,/, ""), "base64");
  } else throw new Error("Give one of path, url or base64");
  if (buf.length < 64) throw new Error("That does not look like an image (too small)");
  const ext = sniff(buf, hint === ".jpeg" ? ".jpg" : hint);
  const stem = slugify(src.name ?? (src.path ? basename(src.path, extname(src.path)) : "image")).slice(0, 40) || "image";
  const name = id ? `gen-${id}` : `${stem}-${hash(buf.toString("base64").slice(0, 4096) + buf.length, 6)}`;
  const rel = `images/${name}${ext}`;
  const target = join(deckDir, rel);
  await mkdir(join(deckDir, "images"), { recursive: true });
  if (id) {
    // A redo of the same request may change format: drop the old file so the new one wins.
    await Promise.all(GEN_EXTS.map((e) => join(deckDir, "images", `${name}.${e}`)).filter((f) => f !== target).map((f) => rm(f, { force: true })));
    await writeFile(target, buf);
  } else if (!existsSync(target)) await writeFile(target, buf);
  return { src: rel, file: target, bytes: buf.length, id };
}
