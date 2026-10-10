/**
 * Local preview server (127.0.0.1 only) with live reload: every rebuild of a
 * registered deck pushes a "reload" event and the page restores its slide.
 */
import { createReadStream, existsSync } from "node:fs";
import { appendFile, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";
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
  if (parts[0] === "__aurora" && parts[1] === "progress" && req.method === "POST") {
    const ip = req.socket.remoteAddress || "";
    const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    if (!isLocal) return send(res, 403, "forbidden");
    // Only the preview page itself may write progress: a JSON content type forces a CORS preflight for other sites,
    // and a present Origin must be this server (another page could otherwise plant text that agents later read).
    const ctype = String(req.headers["content-type"] ?? "").toLowerCase();
    if (!ctype.startsWith("application/json")) return send(res, 415, "expected application/json");
    const origin = req.headers.origin;
    if (origin) {
      let own = false;
      try {
        own = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname);
      } catch {
        own = false;
      }
      if (!own) return send(res, 403, "forbidden origin");
    }

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > 16384) {
        res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        res.end("payload too large");
        return;
      }
      chunks.push(buf);
    }
    const bodyStr = Buffer.concat(chunks).toString("utf8");
    let obj: any;
    try {
      obj = JSON.parse(bodyStr);
    } catch {
      return send(res, 400, "invalid json");
    }
    const KNOWN_TYPES = new Set(["quiz", "predict", "recall", "complete"]);
    if (!obj || typeof obj !== "object" || obj.v !== 1 || !KNOWN_TYPES.has(obj.type) || typeof obj.t !== "string" || !obj.t) {
      return send(res, 400, "invalid event payload");
    }

    const deckId = url.searchParams.get("deck") || url.searchParams.get("id") || (req.headers["x-aurora-deck"] as string) || (req.headers["x-deck"] as string);
    let entry = deckId ? decks.get(deckId) : undefined;
    if (!entry && deckId) {
      entry = [...decks.values()].find((d) => d.id === deckId || d.dir.toLowerCase().includes(deckId.toLowerCase()));
    }
    if (!entry && obj.lesson) {
      entry = [...decks.values()].find((d) => d.dir.toLowerCase().includes(String(obj.lesson).toLowerCase()));
    }
    if (!entry && obj.course) {
      entry = [...decks.values()].find((d) => basename(d.dir) === obj.course || d.dir.toLowerCase().includes(String(obj.course).toLowerCase()));
    }
    if (!entry && decks.size > 0) {
      entry = [...decks.values()][decks.size - 1];
    }
    if (!entry) return send(res, 404, "unknown deck");

    // Keep only contract fields, with bounded lengths.
    const cap = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : v);
    for (const [k, n] of [["question", 200], ["explanation", 300], ["prediction", 2000], ["output", 300], ["title", 200], ["place", 200], ["item", 200], ["palace", 100], ["deck", 200], ["lesson", 200], ["course", 200], ["slideId", 100], ["t", 40], ["quiz", 20], ["predictions", 20], ["rating", 20]] as const) {
      if (obj[k] !== undefined) obj[k] = cap(obj[k], n);
    }
    const capArr = (v: unknown, maxItems: number, maxLen: number) =>
      Array.isArray(v) ? v.slice(0, maxItems).map((s) => (typeof s === "string" ? s.slice(0, maxLen) : String(s ?? "").slice(0, maxLen))) : undefined;
    if (obj.chosenText !== undefined) {
      const ct = capArr(obj.chosenText, 6, 160);
      if (ct) obj.chosenText = ct;
      else delete obj.chosenText;
    }
    if (obj.answerText !== undefined) {
      const at = capArr(obj.answerText, 6, 160);
      if (at) obj.answerText = at;
      else delete obj.answerText;
    }
    const parentCourseJson = join(dirname(entry.dir), "course.json");
    const targetDir = existsSync(parentCourseJson) ? dirname(entry.dir) : entry.dir;
    const progressFile = join(targetDir, "progress.jsonl");

    await appendFile(progressFile, JSON.stringify(obj) + "\n", "utf8");
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
    return;
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
