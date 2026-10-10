/**
 * Local preview server (127.0.0.1 only) with live reload: every rebuild of a
 * registered deck pushes a "reload" event and the page restores its slide.
 */
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, extname, join, normalize, resolve, sep } from "node:path";
import { builds } from "./store.js";
import { esc, hash } from "./util.js";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".pdf": "application/pdf",
};

interface Entry {
  id: string;
  dir: string;
  page: string;
  clients: Set<ServerResponse>;
}

const decks = new Map<string, Entry>();
let server: Server | undefined;
let port = 0;
let starting: Promise<number> | undefined;

function send(res: ServerResponse, code: number, body: string, type = "text/plain; charset=utf-8"): void {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) {
    const rows = [...decks.values()].map((d) => `<li><a href="/d/${d.id}/${encodeURIComponent(d.page)}">${esc(basename(d.dir))}</a> <small>${esc(d.dir)}</small></li>`).join("");
    return send(res, 200, `<!doctype html><meta charset="utf-8"><title>Aurora previews</title><body style="font:16px system-ui;padding:40px;background:#0b0b0d;color:#eee"><h1>Aurora Slides</h1><ul>${rows || "<li>No decks yet.</li>"}</ul>`, TYPES[".html"]);
  }
  if (parts[0] === "__live" && parts[1]) {
    const entry = decks.get(parts[1]);
    if (!entry) return send(res, 404, "unknown deck");
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write("retry: 1500\n\n");
    entry.clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => {
      clearInterval(ping);
      entry.clients.delete(res);
    });
    return;
  }
  if (parts[0] === "d" && parts[1]) {
    const entry = decks.get(parts[1]);
    if (!entry) return send(res, 404, "Unknown deck. Call aurora_preview again.");
    const rel = parts.slice(2).join("/") || entry.page;
    const file = normalize(join(entry.dir, rel));
    if (file !== entry.dir && !file.startsWith(entry.dir + sep)) return send(res, 403, "forbidden");
    let info;
    try {
      info = await stat(file);
    } catch {
      return send(res, 404, "not found");
    }
    if (info.isDirectory()) return send(res, 404, "not found");
    const ext = extname(file).toLowerCase();
    if (ext === ".html") {
      const html = await readFile(file, "utf8");
      const inject = `<script>window.AURORA_LIVE=${JSON.stringify(`/__live/${entry.id}`)}</script>`;
      return send(res, 200, html.replace(/<head>/i, `<head>${inject}`), TYPES[".html"]);
    }
    res.writeHead(200, { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Content-Length": info.size, "Cache-Control": "no-store" });
    createReadStream(file).pipe(res);
    return;
  }
  send(res, 404, "not found");
}

function listen(p: number): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer((req, res) => {
      handle(req, res).catch((e) => send(res, 500, String(e)));
    });
    s.once("error", fail);
    s.listen(p, "127.0.0.1", () => {
      server = s;
      const a = s.address();
      ok(typeof a === "object" && a ? a.port : p);
    });
  });
}

export async function ensurePreview(): Promise<number> {
  if (server) return port;
  starting ??= (async () => {
    const wanted = Number(process.env.AURORA_PORT) || 4747;
    for (const p of [wanted, wanted + 1, wanted + 2, wanted + 3, 0]) {
      try {
        port = await listen(p);
        return port;
      } catch {
        /* busy, try the next one */
      }
    }
    throw new Error("Could not start the preview server");
  })();
  return starting;
}

/** Registers a deck folder and returns its live preview URL. */
export async function previewUrl(dir: string, page = "index.html"): Promise<string> {
  const p = await ensurePreview();
  const abs = resolve(dir);
  const id = hash(abs.toLowerCase(), 8);
  if (!decks.has(id)) decks.set(id, { id, dir: abs, page, clients: new Set() });
  else decks.get(id)!.page = page;
  return `http://127.0.0.1:${p}/d/${id}/${encodeURIComponent(page)}`;
}

/** Returns the preview URL if the deck is already being previewed. */
export function existingPreview(dir: string): string | undefined {
  if (!server) return undefined;
  const id = hash(resolve(dir).toLowerCase(), 8);
  const e = decks.get(id);
  return e ? `http://127.0.0.1:${port}/d/${id}/${encodeURIComponent(e.page)}` : undefined;
}

builds.on("built", (dir: string) => {
  const id = hash(resolve(dir).toLowerCase(), 8);
  const e = decks.get(id);
  if (!e) return;
  for (const c of e.clients) c.write("event: reload\ndata: 1\n\n");
});

export function stopPreview(): void {
  for (const e of decks.values()) for (const c of e.clients) c.end();
  server?.close();
  server = undefined;
  starting = undefined;
}
