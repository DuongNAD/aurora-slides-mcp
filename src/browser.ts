/**
 * Headless Chrome/Edge over the DevTools Protocol (no Puppeteer): screenshots,
 * layout audits and PDF export of built decks. Uses the browser already
 * installed on the machine and Node's built-in WebSocket.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { appDir, errMsg } from "./util.js";

export function findBrowser(): string | undefined {
  const env = process.env.AURORA_BROWSER ?? process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && existsSync(env)) return env;
  const pf = process.env.PROGRAMFILES ?? "C:\\Program Files";
  const pf86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
  const local = process.env.LOCALAPPDATA ?? "";
  const list =
    process.platform === "win32"
      ? [
          `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
          `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
          `${local}\\Google\\Chrome\\Application\\chrome.exe`,
          `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
          `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
          `${pf}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
          `${local}\\Chromium\\Application\\chrome.exe`,
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
          ]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge", "/snap/bin/chromium"];
  return list.find((p) => existsSync(p));
}

/* ───────────────────────── Minimal CDP client ───────────────────────── */

type Msg = { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message: string }; sessionId?: string };

class Cdp {
  private seq = 0;
  private pending = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>();
  private listeners = new Set<(m: Msg) => void>();
  private constructor(private ws: WebSocket) {
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(String(ev.data)) as Msg;
      if (m.id !== undefined) {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        if (m.error) p.fail(new Error(m.error.message));
        else p.ok(m.result);
      } else this.listeners.forEach((fn) => fn(m));
    });
    ws.addEventListener("close", () => {
      for (const p of this.pending.values()) p.fail(new Error("browser connection closed"));
      this.pending.clear();
    });
  }
  static connect(url: string): Promise<Cdp> {
    return new Promise((ok, fail) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => ok(new Cdp(ws)), { once: true });
      ws.addEventListener("error", () => fail(new Error(`cannot connect to ${url}`)), { once: true });
    });
  }
  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = 60000): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((ok, fail) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        fail(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        ok: (v) => {
          clearTimeout(t);
          ok(v as T);
        },
        fail: (e) => {
          clearTimeout(t);
          fail(e);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(fn: (m: Msg) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  close(): void {
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}

interface BrowserHandle {
  proc: ChildProcess;
  cdp: Cdp;
  profile: string;
}

let current: Promise<BrowserHandle> | undefined;
let idle: NodeJS.Timeout | undefined;
let busy = 0;

async function launch(): Promise<BrowserHandle> {
  const exe = findBrowser();
  if (!exe) throw new Error("No Chrome, Edge or Chromium found. Install Google Chrome or set AURORA_BROWSER to the browser executable.");
  const profile = appDir("chrome", String(process.pid));
  await mkdir(profile, { recursive: true });
  const proc = spawn(
    exe,
    [
      "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", "--disable-sync", "--disable-background-networking", "--disable-component-update", "--mute-audio",
      "--hide-scrollbars", "--allow-file-access-from-files", "--force-color-profile=srgb", "--disable-features=Translate,MediaRouter",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );
  const url = await new Promise<string>((ok, fail) => {
    let buf = "";
    const t = setTimeout(() => fail(new Error(`Browser did not start within 25s: ${buf.slice(-300)}`)), 25000);
    proc.stderr!.on("data", (d: Buffer) => {
      buf += d.toString();
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) {
        clearTimeout(t);
        ok(m[1]!);
      }
    });
    proc.once("exit", (code) => {
      clearTimeout(t);
      fail(new Error(`Browser exited early (code ${code}). ${buf.slice(-300)}`));
    });
  });
  const cdp = await Cdp.connect(url);
  proc.once("exit", () => {
    current = undefined;
  });
  return { proc, cdp, profile };
}

async function getBrowser(): Promise<BrowserHandle> {
  if (idle) clearTimeout(idle);
  current ??= launch().catch((e) => {
    current = undefined;
    throw e;
  });
  return current;
}

export async function closeBrowser(): Promise<void> {
  const b = current ? await current.catch(() => undefined) : undefined;
  current = undefined;
  if (!b) return;
  try {
    await b.cdp.send("Browser.close", {}, undefined, 3000);
  } catch {
    b.proc.kill();
  }
  b.cdp.close();
  await new Promise((r) => setTimeout(r, 300));
  await rm(b.profile, { recursive: true, force: true }).catch(() => {});
}

function scheduleIdleClose(): void {
  if (idle) clearTimeout(idle);
  if (busy > 0) return;
  idle = setTimeout(() => void closeBrowser(), 120000);
  idle.unref();
}

process.once("exit", () => {
  void current?.then((b) => b.proc.kill()).catch(() => {});
});

/* ───────────────────────── Pages ───────────────────────── */

export class Page {
  readonly logs: string[] = [];
  constructor(
    private cdp: Cdp,
    readonly sessionId: string,
  ) {}
  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
    return this.cdp.send<T>(method, params, this.sessionId, timeoutMs);
  }
  async eval<T = unknown>(expression: string, timeoutMs = 30000): Promise<T> {
    const r = await this.send<{ result: { value?: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      timeoutMs,
    );
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value as T;
  }
  async viewport(width: number, height: number, scale = 1): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
  }
  async frames(n = 2): Promise<void> {
    await this.eval(`new Promise(r => { let k = ${n}; const f = () => (--k <= 0 ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
  }
}

export async function withPage<T>(
  url: string,
  size: { width: number; height: number; scale?: number },
  fn: (p: Page) => Promise<T>,
  runtime = true,
): Promise<T> {
  busy++;
  const b = await getBrowser();
  const { targetId } = await b.cdp.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await b.cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  const page = new Page(b.cdp, sessionId);
  const off = b.cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    const p = m.params ?? {};
    if (m.method === "Runtime.exceptionThrown") {
      const d = p.exceptionDetails as { text?: string; exception?: { description?: string } };
      page.logs.push(`exception: ${(d.exception?.description ?? d.text ?? "").split("\n")[0]}`);
    } else if (m.method === "Runtime.consoleAPICalled" && (p.type === "error" || p.type === "assert")) {
      const args = (p.args as Array<{ value?: unknown; description?: string }>) ?? [];
      page.logs.push(`console.error: ${args.map((a) => String(a.value ?? a.description ?? "")).join(" ").slice(0, 300)}`);
    } else if (m.method === "Log.entryAdded") {
      const e = p.entry as { level?: string; text?: string; url?: string };
      if (e.level === "error") page.logs.push(`${e.text ?? ""}${e.url ? ` (${e.url.slice(0, 160)})` : ""}`);
    }
  });
  try {
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Log.enable");
    await page.viewport(size.width, size.height, size.scale ?? 1);
    const loaded = new Promise<void>((ok) => {
      const stop = b.cdp.on((m) => {
        if (m.sessionId === sessionId && m.method === "Page.loadEventFired") {
          stop();
          ok();
        }
      });
      setTimeout(() => {
        stop();
        ok();
      }, 30000);
    });
    const nav = await page.send<{ errorText?: string }>("Page.navigate", { url });
    if (nav.errorText) throw new Error(`Cannot open ${url}: ${nav.errorText}`);
    await loaded;
    if (runtime) {
      const hasRuntime = await page.eval<boolean>("!!window.__aurora");
      if (!hasRuntime) throw new Error("The page has no Aurora runtime (is this a deck built by Aurora Slides?)");
      await page.eval("window.__aurora.whenReady()", 20000);
    } else {
      await page.eval("document.fonts ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]).then(() => true) : true");
    }
    return await fn(page);
  } finally {
    off();
    await b.cdp.send("Target.closeTarget", { targetId }).catch(() => {});
    busy--;
    scheduleIdleClose();
  }
}

const fileUrl = (p: string): string => (/^https?:/i.test(p) ? p : pathToFileURL(p).href);

/* ───────────────────────── Screenshots ───────────────────────── */

export interface ShotOptions {
  slides?: number[];
  width?: number;
  format?: "png" | "jpeg";
  quality?: number;
  state?: "final" | "start";
  /** Capture at a specific build step with live (non-static) rendering, e.g. explode stages or camera zooms. */
  step?: number;
  sheet?: boolean;
  cols?: number;
}

export interface Shot {
  slide: number | "sheet";
  data: Buffer;
  mime: string;
  issues?: string[];
}

export async function screenshotDeck(html: string, o: ShotOptions = {}): Promise<{ shots: Shot[]; total: number; logs: string[] }> {
  const width = Math.max(480, Math.min(2560, o.width ?? (o.sheet ? 1500 : 1280)));
  const format = o.format ?? "jpeg";
  const quality = o.quality ?? 82;
  return withPage(fileUrl(html), { width, height: Math.round((width * 9) / 16) }, async (page) => {
    const total = await page.eval<number>("window.__aurora.total");
    const shots: Shot[] = [];
    if (o.sheet) {
      const from = o.slides?.length ? Math.min(...o.slides) : 1;
      const to = o.slides?.length ? Math.max(...o.slides) : total;
      const { height } = await page.eval<{ height: number }>(`window.__aurora.sheet(${JSON.stringify({ from, to, cols: o.cols ?? 3 })})`);
      await page.viewport(width, Math.min(16000, Math.max(200, Math.ceil(height))));
      await page.eval("window.__aurora.whenReady()");
      await page.frames(3);
      const { data } = await page.send<{ data: string }>("Page.captureScreenshot", { format, ...(format === "jpeg" ? { quality } : {}) });
      shots.push({ slide: "sheet", data: Buffer.from(data, "base64"), mime: `image/${format}` });
      return { shots, total, logs: page.logs };
    }
    const list = (o.slides?.length ? o.slides : Array.from({ length: total }, (_, i) => i + 1)).filter((n) => n >= 1 && n <= total);
    const live = o.step !== undefined;
    await page.eval(`window.__aurora.setStatic(${live ? "false" : "true"})`);
    const stepArg = live ? String(o.step) : o.state === "start" ? "0" : '"last"';
    for (const n of list) {
      await page.eval(`window.__aurora.go(${n - 1}, { instant: true, step: ${stepArg} }); window.__aurora.settle(); true`);
      await page.frames(3);
      if (live) {
        await page.eval("window.__aurora.settle(); true");
        await page.frames(2);
      }
      const { data } = await page.send<{ data: string }>("Page.captureScreenshot", { format, ...(format === "jpeg" ? { quality } : {}) });
      shots.push({ slide: n, data: Buffer.from(data, "base64"), mime: `image/${format}` });
    }
    return { shots, total, logs: page.logs };
  });
}

/** Full-page capture of an ordinary page, e.g. a course home page. */
export async function screenshotPage(html: string, width = 1440, format: "png" | "jpeg" = "jpeg"): Promise<{ shot: Shot; logs: string[] }> {
  return withPage(
    fileUrl(html),
    { width, height: 900 },
    async (page) => {
      const h = await page.eval<number>("Math.ceil(document.documentElement.scrollHeight)");
      await page.viewport(width, Math.min(8000, Math.max(600, h)));
      await page.frames(3);
      const { data } = await page.send<{ data: string }>("Page.captureScreenshot", { format, ...(format === "jpeg" ? { quality: 84 } : {}) });
      return { shot: { slide: "sheet", data: Buffer.from(data, "base64"), mime: `image/${format}` }, logs: page.logs };
    },
    false,
  );
}

/* ───────────────────────── Audit ───────────────────────── */

export interface SlideAudit {
  slide: number;
  id?: string;
  type: string;
  title?: string;
  kt: number;
  words: number;
  issues: Array<{ level: "error" | "warn" | "info"; msg: string }>;
}

export async function auditDeck(html: string): Promise<{ slides: SlideAudit[]; logs: string[] }> {
  return withPage(fileUrl(html), { width: 1920, height: 1080 }, async (page) => {
    await page.eval("window.__aurora.setStatic(true)");
    const slides = await page.eval<SlideAudit[]>("window.__aurora.audit()");
    return { slides, logs: page.logs };
  });
}

/* ───────────────────────── PDF ───────────────────────── */

export async function pdfDeck(html: string, out: string): Promise<{ path: string; bytes: number }> {
  return withPage(fileUrl(html), { width: 1920, height: 1080 }, async (page) => {
    await page.eval("window.__aurora.setStatic(true); window.__aurora.preparePrint(); true");
    await page.frames(2);
    const { data } = await page.send<{ data: string }>(
      "Page.printToPDF",
      { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
      180000,
    );
    const buf = Buffer.from(data, "base64");
    await writeFile(out, buf);
    return { path: out, bytes: buf.length };
  });
}

export function browserError(e: unknown): string {
  const m = errMsg(e);
  return /No Chrome/.test(m) ? m : `Browser step failed: ${m}`;
}
