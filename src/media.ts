/**
 * Media services: Iconify icons (cached in one JSON file) and image search
 * across Unsplash / Pexels (with API keys) and Openverse / Wikimedia Commons
 * (keyless). Results are normalized so agents can drop them straight into slides.
 */
import { appDir, errMsg, esc, fetchWithTimeout, readJson, writeJson } from "./util.js";

/* ───────────────────────────── Icons ───────────────────────────── */

export interface IconRecord {
  body: string;
  width: number;
  height: number;
  mono: boolean;
}
type IconCache = Record<string, IconRecord | null>;
interface IconifyIcon {
  body: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}
interface IconifyJSON {
  prefix?: string;
  icons?: Record<string, IconifyIcon>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
  not_found?: string[];
}

const ICON_FILE = appDir("cache", "icons.json");
const ICON_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
let iconCache: IconCache | undefined;

export const isIconId = (s: string): boolean => ICON_RE.test(s);

async function loadIconCache(): Promise<IconCache> {
  iconCache ??= (await readJson<IconCache>(ICON_FILE)) ?? {};
  return iconCache;
}

function extract(data: IconifyJSON, name: string): IconRecord | null {
  let n = name;
  for (let depth = 0; !data.icons?.[n] && data.aliases?.[n] && depth < 6; depth++) n = data.aliases[n]!.parent;
  const icon = data.icons?.[n];
  if (!icon) return null;
  const width = icon.width ?? data.width ?? 16;
  const height = icon.height ?? data.height ?? 16;
  const hasColor =
    /(fill|stroke|stop-color)\s*[=:]\s*["']?\s*(#|rgb|hsl)/i.test(icon.body) || /<(linear|radial)Gradient/i.test(icon.body);
  return { body: icon.body, width, height, mono: !hasColor };
}

/** Fetches unknown icons from the Iconify API (batched per prefix) and caches them. */
export async function resolveIcons(ids: Iterable<string>): Promise<{ icons: Map<string, IconRecord>; missing: string[]; offline: string[] }> {
  const cache = await loadIconCache();
  const wanted = [...new Set(ids)].filter(isIconId);
  const byPrefix = new Map<string, string[]>();
  for (const id of wanted) {
    if (id in cache) continue;
    const [prefix, name] = id.split(":") as [string, string];
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
  }
  const offline: string[] = [];
  let dirty = false;
  await Promise.all(
    [...byPrefix].map(async ([prefix, names]) => {
      for (let i = 0; i < names.length; i += 40) {
        const chunk = names.slice(i, i + 40);
        try {
          const res = await fetchWithTimeout(`https://api.iconify.design/${prefix}.json?icons=${chunk.join(",")}`, {}, 9000);
          if (res.status === 404) {
            chunk.forEach((n) => (cache[`${prefix}:${n}`] = null));
            dirty = true;
            continue;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as IconifyJSON | 404;
          for (const n of chunk) cache[`${prefix}:${n}`] = typeof data === "object" ? extract(data, n) : null;
          dirty = true;
        } catch {
          offline.push(...chunk.map((n) => `${prefix}:${n}`));
        }
      }
    }),
  );
  if (dirty) await writeJson(ICON_FILE, cache);
  const icons = new Map<string, IconRecord>();
  const missing: string[] = [];
  for (const id of wanted) {
    const rec = cache[id];
    if (rec) icons.set(id, rec);
    else if (!offline.includes(id)) missing.push(id);
  }
  return { icons, missing, offline };
}

export function iconSvg(rec: IconRecord): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rec.width} ${rec.height}">${rec.body}</svg>`;
}

/**
 * Mono icons are painted through a CSS mask so they can take gradient fills
 * (SF-Symbols-like hierarchical look); color icons are isolated in <img> so
 * their internal gradient ids never collide.
 */
export function iconHtml(rec: IconRecord | undefined, id: string, cls = "", attrs = ""): string {
  if (!rec) {
    if (!isIconId(id) && /[^\x00-\x7F]/.test(id)) return `<span class="ic emoji ${cls}"${attrs} aria-hidden="true">${esc(id)}</span>`;
    return `<i class="ic missing ${cls}"${attrs} aria-hidden="true"></i>`;
  }
  const uri = `data:image/svg+xml,${encodeURIComponent(iconSvg(rec))}`;
  if (rec.mono) return `<i class="ic mono ${cls}" style="--ic:url(&quot;${uri}&quot;)"${attrs} aria-hidden="true"></i>`;
  return `<img class="ic color ${cls}" src="${uri}" alt=""${attrs} aria-hidden="true" draggable="false">`;
}

export interface IconSearchResult {
  id: string;
  set: string;
}

export const ICON_STYLES: Record<string, string[]> = {
  all: ["ph", "solar", "fluent-emoji", "lucide", "tabler", "mdi", "logos", "streamline-plump-color"],
  line: ["ph", "lucide", "tabler", "iconoir", "solar"],
  duotone: ["ph", "solar"],
  color: ["fluent-emoji", "fluent-emoji-flat", "streamline-plump-color", "flat-color-icons", "noto"],
  logos: ["logos", "skill-icons", "devicon", "simple-icons"],
  /** Every Iconify set (last resort for rare subjects such as electronics or anatomy). */
  any: [],
};

export async function searchIcons(query: string, style: keyof typeof ICON_STYLES = "all", limit = 32): Promise<IconSearchResult[]> {
  const prefixes = ICON_STYLES[style] ?? ICON_STYLES.all!;
  const url = `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${Math.max(32, limit)}${prefixes.length ? `&prefixes=${prefixes.join(",")}` : ""}`;
  const res = await fetchWithTimeout(url, {}, 9000);
  if (!res.ok) throw new Error(`Iconify search failed (HTTP ${res.status})`);
  const data = (await res.json()) as { icons?: string[] };
  const ids = data.icons ?? [];
  // Prefer duotone/bold-duotone variants when the line style is ambiguous: they read better on big slides.
  const rank = (id: string) => (/-duotone$/.test(id) ? 0 : /-bold$|-fill$/.test(id) ? 2 : 1);
  return ids
    .sort((a, b) => prefixes.indexOf(a.split(":")[0]!) - prefixes.indexOf(b.split(":")[0]!) || rank(a) - rank(b))
    .slice(0, limit)
    .map((id) => ({ id, set: id.split(":")[0]! }));
}

/* ───────────────────────────── Images ───────────────────────────── */

export type ImageProvider = "unsplash" | "pexels" | "openverse" | "wikimedia";
export type Orientation = "landscape" | "portrait" | "square" | "any";

export interface ImageResult {
  url: string;
  thumb: string;
  width?: number;
  height?: number;
  title?: string;
  author?: string;
  license?: string;
  source: ImageProvider;
  page?: string;
  credit: string;
}

export interface ImageSearchOptions {
  query: string;
  count?: number;
  orientation?: Orientation;
  provider?: ImageProvider | "auto";
  kind?: "photo" | "illustration" | "diagram" | "any";
}

const stripHtml = (s: string | undefined): string =>
  (s ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

/** Keyless APIs rate-limit bursts: retry 429/5xx twice with a growing pause (honours Retry-After). */
async function fetchRetry(url: string): Promise<Response> {
  let res = await fetchWithTimeout(url);
  for (let attempt = 1; attempt <= 2 && (res.status === 429 || res.status >= 500); attempt++) {
    const after = Number(res.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, Math.min(6000, Number.isFinite(after) && after > 0 ? after * 1000 : 1200 * attempt)));
    res = await fetchWithTimeout(url);
  }
  return res;
}

/** Big images first; smaller ones only fill the gaps. */
const bySize = (a: ImageResult, b: ImageResult): number => Number((b.width ?? 1600) >= 1200) - Number((a.width ?? 1600) >= 1200);

function ratioOk(o: Orientation, w?: number, h?: number): boolean {
  if (!w || !h || o === "any") return true;
  const r = w / h;
  return o === "landscape" ? r >= 1.2 : o === "portrait" ? r <= 0.85 : r > 0.85 && r < 1.2;
}

async function unsplash(o: Required<ImageSearchOptions>, key: string): Promise<ImageResult[]> {
  const u = new URL("https://api.unsplash.com/search/photos");
  u.searchParams.set("query", o.query);
  u.searchParams.set("per_page", String(Math.min(30, o.count)));
  u.searchParams.set("content_filter", "high");
  if (o.orientation !== "any") u.searchParams.set("orientation", o.orientation === "square" ? "squarish" : o.orientation);
  const res = await fetchWithTimeout(u.href, { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } });
  if (!res.ok) throw new Error(`Unsplash HTTP ${res.status}`);
  type P = { width: number; height: number; alt_description?: string; description?: string; urls: { raw: string; small: string }; user?: { name?: string }; links?: { html?: string } };
  const data = (await res.json()) as { results?: P[] };
  return (data.results ?? []).map((p) => ({
    url: `${p.urls.raw}&w=2400&q=80&auto=format&fit=max`,
    thumb: p.urls.small,
    width: p.width,
    height: p.height,
    title: p.alt_description ?? p.description ?? undefined,
    author: p.user?.name,
    license: "Unsplash License",
    source: "unsplash",
    page: p.links?.html,
    credit: `${p.user?.name ?? "Unknown"} / Unsplash`,
  }));
}

async function pexels(o: Required<ImageSearchOptions>, key: string): Promise<ImageResult[]> {
  const u = new URL("https://api.pexels.com/v1/search");
  u.searchParams.set("query", o.query);
  u.searchParams.set("per_page", String(Math.min(40, o.count)));
  if (o.orientation !== "any") u.searchParams.set("orientation", o.orientation);
  const res = await fetchWithTimeout(u.href, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
  type P = { width: number; height: number; alt?: string; url?: string; photographer?: string; src: { original: string; medium: string } };
  const data = (await res.json()) as { photos?: P[] };
  return (data.photos ?? []).map((p) => ({
    url: `${p.src.original}?auto=compress&cs=tinysrgb&w=2400`,
    thumb: p.src.medium,
    width: p.width,
    height: p.height,
    title: p.alt,
    author: p.photographer,
    license: "Pexels License",
    source: "pexels",
    page: p.url,
    credit: `${p.photographer ?? "Unknown"} / Pexels`,
  }));
}

async function openverse(o: Required<ImageSearchOptions>): Promise<ImageResult[]> {
  const u = new URL("https://api.openverse.org/v1/images/");
  u.searchParams.set("q", o.query);
  u.searchParams.set("page_size", String(Math.min(20, o.count * 2)));
  u.searchParams.set("mature", "false");
  if (o.kind === "photo") u.searchParams.set("category", "photograph");
  if (o.kind === "illustration" || o.kind === "diagram") u.searchParams.set("category", "illustration");
  if (o.orientation === "landscape") u.searchParams.set("aspect_ratio", "wide");
  if (o.orientation === "portrait") u.searchParams.set("aspect_ratio", "tall");
  if (o.orientation === "square") u.searchParams.set("aspect_ratio", "square");
  const res = await fetchRetry(u.href);
  if (!res.ok) throw new Error(`Openverse HTTP ${res.status}`);
  type R = { url: string; thumbnail?: string; width?: number; height?: number; title?: string; creator?: string; license?: string; license_version?: string; foreign_landing_url?: string; provider?: string };
  const data = (await res.json()) as { results?: R[] };
  return (data.results ?? [])
    .filter((r) => (r.width ?? 9999) >= 640)
    .map((r) => {
      const lic = r.license ? `${r.license === "cc0" || r.license === "pdm" ? r.license.toUpperCase() : `CC ${r.license.toUpperCase()}`} ${r.license_version ?? ""}`.trim() : undefined;
      return {
        url: r.url,
        thumb: r.thumbnail ?? r.url,
        width: r.width,
        height: r.height,
        title: r.title,
        author: r.creator,
        license: lic,
        source: "openverse" as const,
        page: r.foreign_landing_url,
        credit: `${r.creator ?? "Unknown"}${r.provider ? ` / ${r.provider}` : ""}${lic ? `, ${lic}` : ""}`,
      };
    });
}

async function wikimedia(o: Required<ImageSearchOptions>): Promise<ImageResult[]> {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  const filter = o.kind === "diagram" || o.kind === "illustration" ? " filetype:drawing" : o.kind === "photo" ? " filetype:bitmap" : "";
  const params: Record<string, string> = {
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: o.query + filter,
    gsrnamespace: "6",
    gsrlimit: String(Math.min(30, o.count * 3)),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "2000",
    iiextmetadatafilter: "Artist|LicenseShortName|ObjectName",
    origin: "*",
  };
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetchRetry(u.href);
  if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
  type II = { thumburl?: string; url: string; width: number; height: number; mime: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> };
  const data = (await res.json()) as { query?: { pages?: Array<{ title: string; index?: number; imageinfo?: II[] }> } };
  return (data.query?.pages ?? [])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii || !/^image\/(jpeg|png|webp|svg\+xml)$/.test(ii.mime)) return [];
      if (ii.mime !== "image/svg+xml" && ii.width < 640) return [];
      const author = stripHtml(ii.extmetadata?.Artist?.value) || undefined;
      const lic = stripHtml(ii.extmetadata?.LicenseShortName?.value) || undefined;
      const title = stripHtml(ii.extmetadata?.ObjectName?.value) || p.title.replace(/^File:/, "").replace(/\.\w+$/, "");
      return [
        {
          url: ii.thumburl ?? ii.url,
          thumb: ii.thumburl ?? ii.url,
          width: ii.width,
          height: ii.height,
          title,
          author,
          license: lic,
          source: "wikimedia" as const,
          page: ii.descriptionurl,
          credit: `${author ? author.slice(0, 60) : "Wikimedia Commons"} / Wikimedia Commons${lic ? `, ${lic}` : ""}`,
        },
      ];
    });
}

export function availableImageProviders(): ImageProvider[] {
  const list: ImageProvider[] = [];
  if (process.env.UNSPLASH_ACCESS_KEY) list.push("unsplash");
  if (process.env.PEXELS_API_KEY) list.push("pexels");
  list.push("openverse", "wikimedia");
  return list;
}

export async function searchImages(opts: ImageSearchOptions): Promise<{ results: ImageResult[]; providers: ImageProvider[]; errors: string[] }> {
  const o: Required<ImageSearchOptions> = { count: 8, orientation: "landscape", provider: "auto", kind: "photo", ...opts };
  const avail = availableImageProviders();
  let order: ImageProvider[];
  if (o.provider !== "auto") order = [o.provider];
  else if (o.kind === "diagram") order = ["wikimedia", "openverse"];
  else order = avail.includes("unsplash") || avail.includes("pexels") ? avail.filter((p) => p === "unsplash" || p === "pexels") : ["openverse", "wikimedia"];
  const errors: string[] = [];
  const lists = await Promise.all(
    order.map(async (p) => {
      try {
        if (p === "unsplash") {
          if (!process.env.UNSPLASH_ACCESS_KEY) throw new Error("UNSPLASH_ACCESS_KEY is not set");
          return await unsplash(o, process.env.UNSPLASH_ACCESS_KEY);
        }
        if (p === "pexels") {
          if (!process.env.PEXELS_API_KEY) throw new Error("PEXELS_API_KEY is not set");
          return await pexels(o, process.env.PEXELS_API_KEY);
        }
        return p === "openverse" ? await openverse(o) : await wikimedia(o);
      } catch (e) {
        errors.push(`${p}: ${errMsg(e)}`);
        return [] as ImageResult[];
      }
    }),
  );
  // Interleave providers so one weak source doesn't dominate, then filter by shape.
  const merged: ImageResult[] = [];
  const seen = new Set<string>();
  for (let i = 0; merged.length < o.count * 3 && lists.some((l) => l[i]); i++) {
    for (const l of lists) {
      const r = l[i];
      if (r && !seen.has(r.url) && ratioOk(o.orientation, r.width, r.height)) {
        seen.add(r.url);
        merged.push(r);
      }
    }
  }
  merged.sort(bySize);
  return { results: merged.slice(0, o.count), providers: order, errors };
}

/* Build-time `image: {query}` resolution, cached so rebuilds stay instant and stable. */
const IMAGE_FILE = appDir("cache", "images.json");
let imageCache: Record<string, ImageResult | null> | undefined;

export async function resolveImageQueries(
  queries: Array<{ query: string; orientation: Orientation }>,
): Promise<{ found: Map<string, ImageResult>; failed: string[] }> {
  imageCache ??= (await readJson<Record<string, ImageResult | null>>(IMAGE_FILE)) ?? {};
  const found = new Map<string, ImageResult>();
  const failed: string[] = [];
  let dirty = false;
  await Promise.all(
    queries.map(async ({ query, orientation }) => {
      const key = `${query.trim().toLowerCase()}|${orientation}`;
      let hit = imageCache![key];
      if (hit === undefined) {
        const { results } = await searchImages({ query, orientation, count: 4 });
        hit = results[0] ?? null;
        if (hit) {
          imageCache![key] = hit;
          dirty = true;
        }
      }
      if (hit) found.set(key, hit);
      else failed.push(query);
    }),
  );
  if (dirty) await writeJson(IMAGE_FILE, imageCache);
  return { found, failed };
}

export const imageKey = (query: string, orientation: Orientation): string => `${query.trim().toLowerCase()}|${orientation}`;