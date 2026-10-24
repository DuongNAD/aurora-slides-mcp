#!/usr/bin/env node
/**
 * End-to-end test over real MCP stdio: starts dist/aurora.mjs as a server, connects the official SDK
 * client (from the C: toolchain) and exercises every tool. Test decks are written outside the project.
 *   node scripts/e2e.mjs
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base =
  process.platform === "win32"
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "aurora-slides")
    : join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "aurora-slides");
const TOOL = resolve(process.env.AURORA_TOOLCHAIN ?? join(base, "toolchain"));
const req = createRequire(join(TOOL, "package.json"));
const { Client } = req("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = req("@modelcontextprotocol/sdk/client/stdio.js");

const DIR = join(base, "e2e", "deck");
rmSync(join(base, "e2e"), { recursive: true, force: true });
mkdirSync(join(base, "e2e"), { recursive: true });

// Setup fake SmartDrive command for testing
const fakeSdLog = join(base, "e2e", "smartdrive.log");
const fakeSdScript = join(base, "e2e", "fake-smartdrive.mjs");
writeFileSync(
  fakeSdScript,
  `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(fakeSdLog)}, process.argv.slice(2).join(" ") + "\\n", "utf8");\n`,
  "utf8",
);
process.env.AURORA_SMARTDRIVE_CMD = `"${process.execPath}" "${fakeSdScript}"`;

let failed = 0;
const ok = (name, cond, detail = "") => {
  if (!cond) failed++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};
const textOf = (r) => (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");

/* ───────── Trace slide (Mira, mira-embed.v1): fixtures and a tiny DevTools client ─────────
   Fixtures and decks of these tests live under %TEMP%, never in the project. */
const TRACE_DIR = join(tmpdir(), "aurora-e2e-trace");
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const waitFor = async (fn, ms = 15000, step = 150) => {
  const t0 = Date.now();
  for (;;) {
    let v;
    try {
      v = await fn();
    } catch {
      v = undefined;
    }
    if (v) return v;
    if (Date.now() - t0 > ms) return undefined;
    await sleep(step);
  }
};
const readEvents = (file) => {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return []; // a line that is still being written
      }
    });
};

/** A minimal Mira player: both meta tags, the embed-protocol messages on load, a hello listener and helpers the test calls. */
const MIRA_FIXTURE = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="mira-player" content="1">
<meta name="generator" content="mira-mcp fixture (aurora e2e)">
<title>Fixture Mira player</title></head>
<body style="margin:0;background:#0f1218;color:#e8ecf4;font:16px system-ui"><p style="padding:24px">fixture</p>
<script>
(function () {
  var root = document.documentElement;
  root.dataset.embed = window.parent !== window || /[?&]embed=1(?:&|$)/.test(location.search) ? "1" : "0";
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (m && m.source === "aurora" && m.v === 1 && m.kind === "hello") root.dataset.hello = JSON.stringify(m);
  });
  function send(m) { window.parent.postMessage(Object.assign({ source: "mira", v: 1 }, m), "*"); }
  window.__sendBlur = function () { send({ kind: "blur" }); };
  window.__sendPredict = function (k, rating) {
    send({ kind: "event", event: { type: "predict", title: "Điểm dừng " + k, prediction: "dự đoán " + k, rating: rating || "different", output: "kết quả " + k, slideId: "mira-stop-" + k } });
  };
  send({ kind: "ready", title: "Fixture", steps: 12, stops: 3 });
  send({ kind: "event", event: { type: "predict", title: "Dự đoán giá trị của mid", prediction: "mid = 3", rating: "right", output: "mid = 3", slideId: "mira-stop-1" } });
  send({ kind: "event", event: { type: "predict", title: "Đánh giá lạ", prediction: "x", rating: "maybe", output: "y", slideId: "mira-stop-2" } });
  send({ kind: "event", event: { type: "complete", slides: 1 } });
  send({ kind: "unknown" });
})();
</script></body></html>
`;

function findBrowser() {
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
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge", "/snap/bin/chromium"];
  return list.find((p) => existsSync(p));
}

/** Starts a headless Chrome/Edge and returns a minimal DevTools client, or {skipped} when the machine has no browser. */
async function startBrowser() {
  const exe = findBrowser();
  if (!exe) return { skipped: "no Chrome, Edge or Chromium found; set AURORA_BROWSER" };
  const profile = join(TRACE_DIR, "chrome-profile");
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* a stale profile is harmless */
  }
  mkdirSync(profile, { recursive: true });
  const proc = spawn(
    exe,
    [
      "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      "--disable-sync", "--disable-background-networking", "--disable-component-update", "--mute-audio", "--hide-scrollbars", "--force-color-profile=srgb",
      "--disable-features=Translate,MediaRouter", "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );
  const wsUrl = await new Promise((res, rej) => {
    let buf = "";
    const t = setTimeout(() => rej(new Error(`browser did not start within 25s: ${buf.slice(-200)}`)), 25000);
    proc.stderr.on("data", (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) {
        clearTimeout(t);
        res(m[1]);
      }
    });
    proc.once("exit", (code) => {
      clearTimeout(t);
      rej(new Error(`browser exited early (code ${code}) ${buf.slice(-200)}`));
    });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("cannot connect to the browser")), { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const exceptions = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id !== undefined) {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message));
      else p.res(m.result);
    } else if (m.method === "Runtime.exceptionThrown") {
      const d = m.params?.exceptionDetails;
      exceptions.push(d?.exception?.description ?? d?.text ?? "exception");
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const id = ++seq;
      const t = setTimeout(() => {
        pending.delete(id);
        rej(new Error(`${method} timed out`));
      }, 60000);
      pending.set(id, { res: (v) => (clearTimeout(t), res(v)), rej: (e) => (clearTimeout(t), rej(e)) });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return {
    exceptions,
    /** Opens a deck URL (served by aurora_preview) and waits for the Aurora runtime. */
    async page(url) {
      const { targetId } = await send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      const cmd = (method, params) => send(method, params, sessionId);
      await cmd("Page.enable");
      await cmd("Runtime.enable");
      await cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
      await cmd("Emulation.setFocusEmulationEnabled", { enabled: true });
      await cmd("Page.navigate", { url });
      const evaluate = async (expression) => {
        const r = await cmd("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result.value;
      };
      const up = await waitFor(async () => evaluate("!!window.__aurora"), 30000, 200);
      if (!up) throw new Error("the Aurora runtime did not start in the browser");
      await evaluate("window.__aurora.whenReady().then(() => true)");
      return { cmd, evaluate };
    },
    async close() {
      send("Browser.close").catch(() => {});
      await sleep(500);
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      proc.kill();
      await sleep(300);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* Windows may still hold a lock for a moment */
      }
    },
  };
}

const client = new Client({ name: "aurora-e2e", version: "1.0.0" });
const transport = new StdioClientTransport({ command: process.execPath, args: [join(ROOT, "dist", "aurora.mjs")], env: { ...process.env }, stderr: "inherit" });
await client.connect(transport);
const call = (name, args = {}) => client.callTool({ name, arguments: args }, undefined, { timeout: 180000 });

try {
  const info = client.getServerVersion();
  ok("server identifies itself", info?.name === "aurora-slides", `${info?.name} ${info?.version}`);
  ok("server sends instructions", (client.getInstructions() ?? "").includes("aurora_guide"));

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  ok("15 tools listed", names.length === 15, names.join(", "));
  const toolJson = JSON.stringify(tools).length;
  ok("tool definitions stay compact", toolJson < 20000, `${toolJson} chars`);
  const { prompts } = await client.listPrompts();
  ok("lesson prompt listed", prompts.some((p) => p.name === "lesson"));
  const pr = await client.getPrompt({ name: "lesson", arguments: { topic: "Định luật Ôm" } });
  ok("lesson prompt mentions notebook + exercise", /notebook/.test(pr.messages[0].content.text) && /exercise/.test(pr.messages[0].content.text));

  let r = await call("aurora_guide");
  ok("guide overview", !r.isError && textOf(r).length > 2000 && textOf(r).includes("notebook"), `${textOf(r).length} chars`);
  r = await call("aurora_guide", { type: "exercise" });
  ok("guide for one type", textOf(r).includes("Fields") && textOf(r).includes('"type": "exercise"'));
  r = await call("aurora_guide", { type: "predict" });
  ok("guide for predict type", !r.isError && textOf(r).includes('"type": "predict"') && textOf(r).includes("question") && textOf(r).includes("output"));
  r = await call("aurora_guide", { topic: "pedagogy" });
  ok("guide pedagogy section", textOf(r).includes("notebook") && textOf(r).includes("Thực hành"));
  r = await call("aurora_guide", { topic: "accuracy" });
  ok("guide accuracy section", !r.isError && textOf(r).includes("source of truth") && textOf(r).includes("Quote, never retype"));
  r = await call("aurora_guide", { topic: "progress" });
  ok("guide progress section", !r.isError && textOf(r).includes("quiz") && textOf(r).includes("Polaris"));

  r = await call("aurora_create_deck", { deck: { title: "Bad", slides: [{ type: "bulets", items: ["x"] }, { type: "quiz", question: "Q?", options: ["a"], answr: 0 }] }, dir: DIR });
  const bad = textOf(r);
  ok(
    "invalid deck is rejected with precise, corrective errors",
    r.isError && /Unknown slide type "bulets"\. Did you mean "bullets"\?/.test(bad) && /did you mean "answer" for "answr"/.test(bad),
    bad.split("\n").slice(1, 4).join(" | ").slice(0, 300),
  );

  // Scene schema validation
  r = await call("aurora_create_deck", {
    deck: {
      title: "Bad Scene",
      scene: "forest_glow",
      slides: [{ type: "title", title: "Bad Scene" }],
    },
    dryRun: true,
  });
  const badScn = textOf(r);
  ok(
    "schema rejects unknown scene with helpful message",
    r.isError && /scene/i.test(badScn),
    badScn.split("\n").slice(0, 3).join(" | ").slice(0, 300),
  );

  r = await call("aurora_create_deck", {
    deck: {
      title: "Valid Scenes",
      scene: "circuit",
      slides: [
        { type: "title", title: "Valid Scenes", motion: "spin" },
        { type: "section", title: "Section", scene: "none" },
        { type: "statement", text: "Statement", scene: "quantum" },
      ],
    },
    dryRun: true,
  });
  ok("schema accepts deck and slide scene", !r.isError && /Valid deck/.test(textOf(r)));

  // Auto-detect scene for Quang hợp
  const AUTO_DIR = join(base, "e2e", "scene_auto");
  r = await call("aurora_create_deck", {
    deck: {
      title: "Quang hợp ở thực vật",
      slides: [{ type: "title", title: "Quang hợp ở thực vật" }],
    },
    dir: AUTO_DIR,
  });
  const autoTxt = textOf(r);
  const autoHtml = existsSync(join(AUTO_DIR, "index.html")) ? readFileSync(join(AUTO_DIR, "index.html"), "utf8") : "";
  ok(
    "auto picks leaves for 'Quang hợp'",
    !r.isError && /Scene:\s*leaves\s*\(auto/i.test(autoTxt) && autoHtml.includes("scn-leaves"),
    autoTxt.split("\n").find((l) => /Scene:/i.test(l)) || autoTxt.slice(0, 160),
  );

  // Scene picker diacritics and ambiguity checks
  const pickerCases = [
    { title: "Quang hợp: bếp ăn của lá cây", expected: "leaves" },
    { title: "Python là gì?", expected: "code" },
    { title: "An toàn thông tin", expected: "none" },
    { title: "Ai phát minh ra điện thoại?", expected: "none" },
    { title: "Hệ tuần hoàn và mạch máu", expected: "none" },
    { title: "Mạch điện xoay chiều", expected: "circuit" },
    { title: "Toán rời rạc", expected: "geometry" },
    { title: "Song song và đồng bộ", expected: "none" },
    { title: "Machine learning cơ bản", expected: "network" },
    { title: "Lịch sử Việt Nam", expected: "ink" },
  ];
  for (const [i, tc] of pickerCases.entries()) {
    // A real build: the dry run only validates and never resolves the scene.
    r = await call("aurora_create_deck", {
      deck: { title: tc.title, slides: [{ type: "title", title: tc.title }] },
      dir: join(base, "e2e", `scene_pick_${i}`),
    });
    const txt = textOf(r);
    const sceneMatch = txt.match(/Scene:\s*([a-z]+)/i);
    const resolvedScene = sceneMatch ? sceneMatch[1].toLowerCase() : "unknown";
    ok(
      `picker: '${tc.title}' -> ${tc.expected}`,
      !r.isError && resolvedScene === tc.expected,
      `got ${resolvedScene}`,
    );
  }

  const deck = {
    title: "Định luật Ôm",
    lang: "vi",
    theme: "titanium",
    slides: [
      { type: "title", title: "Định luật ++Ôm++", subtitle: "Dòng điện, hiệu điện thế và điện trở", icon: "ph:lightning-duotone" },
      { type: "formula", title: "Công thức", formula: "I = \\frac{U}{R}", legend: [{ symbol: "I", meaning: "Cường độ (A)" }, { symbol: "U", meaning: "Hiệu điện thế (V)" }, { symbol: "R", meaning: "Điện trở (Ω)" }] },
      { type: "notebook", title: "Định luật Ôm", lines: ["= I = \\frac{U}{R}", "! I tỉ lệ thuận với U, tỉ lệ nghịch với R"] },
    ],
  };
  r = await call("aurora_create_deck", { deck: JSON.stringify(deck), dir: DIR });
  ok("create deck from a JSON string", !r.isError && textOf(r).includes("Built") && existsSync(join(DIR, "index.html")), textOf(r).split("\n")[0]);

  // Assert SmartDrive notification ran and was coalesced for DIR
  await new Promise((res) => setTimeout(res, 300));
  const sdLines = existsSync(fakeSdLog) ? readFileSync(fakeSdLog, "utf8").trim().split("\n").filter(Boolean) : [];
  const dirExpected = resolve(DIR);
  const matchedLines = sdLines.filter((l) => l.includes(dirExpected) || l.includes(DIR));
  ok(
    "SmartDrive notification ran for created deck (coalesced: one line for one build)",
    matchedLines.length === 1 && matchedLines[0] === `update ${dirExpected} --quiet`,
    matchedLines.join(" | ") || "(none)",
  );

  // Test AURORA_SMARTDRIVE=off disables notifications
  const OFF_DIR = join(base, "e2e", "off_deck");
  mkdirSync(OFF_DIR, { recursive: true });
  writeFileSync(join(OFF_DIR, "deck.json"), JSON.stringify(deck), "utf8");
  const logLenBefore = existsSync(fakeSdLog) ? readFileSync(fakeSdLog, "utf8").length : 0;
  execFileSync(process.execPath, [join(ROOT, "dist", "aurora.mjs"), "build", OFF_DIR], {
    env: { ...process.env, AURORA_SMARTDRIVE: "off", AURORA_SMARTDRIVE_CMD: `"${process.execPath}" "${fakeSdScript}"` },
    stdio: "pipe",
  });
  await new Promise((res) => setTimeout(res, 300));
  const logAfter = existsSync(fakeSdLog) ? readFileSync(fakeSdLog, "utf8") : "";
  ok(
    "with AURORA_SMARTDRIVE=off nothing is logged",
    !logAfter.includes(resolve(OFF_DIR)) && !logAfter.includes(OFF_DIR) && logAfter.length === logLenBefore,
  );

  r = await call("aurora_create_deck", { deck, dryRun: true });
  ok("dryRun validates only", !r.isError && /Valid deck with 3 slides/.test(textOf(r)));

  const DG = join(base, "e2e", "diagram");
  r = await call("aurora_create_deck", {
    deck: {
      title: "Mạch điện",
      lang: "vi",
      slides: [
        { type: "diagram", title: "Mạch nối tiếp", code: "flowchart LR\n  A([Nguồn]) --> B[Điện trở]\n  B --> C[Bóng đèn]\n  C --> A", steps: true },
        { type: "diagram", title: "Sai cú pháp", code: "flowchart LR\n  A --> [" },
      ],
    },
    dir: DG,
  });
  const dgHtml = existsSync(join(DG, "index.html")) ? readFileSync(join(DG, "index.html"), "utf8") : "";
  ok("Mermaid diagram drawn at build time", !r.isError && /class="dg-svg[^"]*"[^>]*><svg/.test(dgHtml) && dgHtml.includes("Bóng đèn"));
  ok("diagram syntax error is reported, not fatal", /Diagram on slide 2 was not drawn: Parse error/.test(textOf(r)) && dgHtml.includes("dg-failed"));

  r = await call("aurora_preview", { dir: DIR });
  const url = /Preview: (\S+)/.exec(textOf(r))?.[1];
  ok("preview server starts", !!url, url);
  let reloadSeen = false;
  let sse;
  if (url) {
    const page = await fetch(url).then((x) => x.text());
    ok("preview injects live reload", page.includes("AURORA_LIVE"));
    const live = new URL(/AURORA_LIVE="([^"]+)"/.exec(page)?.[1] ?? "/", url).href;
    const ctl = new AbortController();
    sse = fetch(live, { signal: ctl.signal }).then(async (res) => {
      const rd = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        buf += dec.decode(value);
        if (buf.includes("event: reload")) {
          reloadSeen = true;
          ctl.abort();
          break;
        }
      }
    }).catch(() => {});
    sse.abort = () => ctl.abort();
    await new Promise((res) => setTimeout(res, 300));
  }

  r = await call("aurora_edit_deck", {
    dir: DIR,
    ops: [
      { op: "insert", at: 3, slides: [{ type: "quiz", question: "R tăng gấp đôi, U giữ nguyên thì I?", options: ["Tăng gấp đôi", "Giảm một nửa", "Không đổi"], answer: 1, explanation: "I = U/R nên I giảm một nửa." }] },
      { op: "update", at: 1, set: { subtitle: "Bài 1 · Vật lý 11" } },
      { op: "deck", set: { accent: "orange" } },
    ],
  });
  ok("edit deck (insert, update, deck)", !r.isError && /Applied 3 edit/.test(textOf(r)) && /4 slides/.test(textOf(r)), textOf(r).split("\n")[1]);
  await new Promise((res) => setTimeout(res, 800));
  ok("live reload event after edit", reloadSeen);
  sse?.abort?.();

  r = await call("aurora_edit_deck", { dir: DIR, ops: [{ op: "delete", at: 9 }] });
  ok("bad edit is rejected without saving", r.isError && /does not exist/.test(textOf(r)));

  r = await call("aurora_get_deck", { dir: DIR, slide: 3 });
  ok("get one slide", textOf(r).includes('"type": "quiz"'));

  r = await call("aurora_search_icons", { queries: ["resistor", "battery"], style: "duotone", limit: 4 });
  ok("icon search", !r.isError && /resistor: .*:/.test(textOf(r)), textOf(r).split("\n")[0]);
  r = await call("aurora_search_images", { query: "electric circuit board", count: 3 });
  ok("image search", !r.isError && /"src":/.test(textOf(r)), textOf(r).split("\n")[0]);

  r = await call("aurora_screenshot", { dir: DIR });
  const imgs = (r.content ?? []).filter((c) => c.type === "image");
  ok("contact sheet screenshot", !r.isError && imgs.length === 1 && imgs[0].data.length > 10000, `${imgs.length} image(s)`);
  r = await call("aurora_screenshot", { dir: DIR, slides: [2, 4], width: 960 });
  ok("individual slide screenshots", (r.content ?? []).filter((c) => c.type === "image").length === 2);

  r = await call("aurora_audit", { dir: DIR });
  ok("audit runs", !r.isError && /Layout audit: 4 slides/.test(textOf(r)), textOf(r).split("\n")[0]);

  r = await call("aurora_build", { dir: DIR });
  ok("rebuild from deck.json", !r.isError && /Built/.test(textOf(r)));

  // Images the agent brings: from a URL (an SVG here) and from base64 (a screenshot we just received).
  r = await call("aurora_add_image", { dir: DIR, url: "https://api.iconify.design/ph/lightning-duotone.svg", name: "lightning" });
  ok("add image from URL", !r.isError && /images\/lightning-[0-9a-f]+\.svg/.test(textOf(r)), textOf(r).split("\n")[1]);
  r = await call("aurora_add_image", { dir: DIR, base64: imgs[0]?.data ?? "", name: "sheet" });
  const added = /"src": "([^"]+)"/.exec(textOf(r))?.[1];
  ok("add image from base64 (shown back)", !r.isError && !!added && (r.content ?? []).some((c) => c.type === "image"), added);
  r = await call("aurora_edit_deck", { dir: DIR, ops: [{ op: "insert", slides: [{ type: "split", title: "Ảnh của agent", text: "Ảnh do agent tự đưa vào.", image: { src: added, alt: "ảnh" } }] }] });
  ok("deck uses the imported image", !r.isError && /5 slides/.test(textOf(r)));

  // A `generate` prompt becomes a picture request for the agent (no image API call); aurora_add_image {for} fills it.
  const PD = join(base, "e2e", "pictures");
  const prompt = `minimal 3D render of a glowing qubit, dark navy background, soft studio light, no text (e2e ${Date.now()})`;
  r = await call("aurora_create_deck", {
    deck: { title: "Ảnh chờ tạo", slides: [{ type: "title", title: "Qubit" }, { type: "split", title: "Qubit", text: "Một bit lượng tử.", image: { generate: prompt } }] },
    dir: PD,
  });
  const reqId = /for "([0-9a-f]{16})"\s+slide 2/.exec(textOf(r))?.[1];
  ok("generate prompt becomes a picture request", !r.isError && !!reqId && /Pictures for you to make \(1\)/.test(textOf(r)) && !/Could not generate/.test(textOf(r)), reqId);
  r = await call("aurora_add_image", { dir: PD, base64: imgs[0]?.data ?? "", for: reqId ?? "" });
  const pdHtml = existsSync(join(PD, "index.html")) ? readFileSync(join(PD, "index.html"), "utf8") : "";
  ok(
    "add image {for} fills the request and rebuilds",
    !r.isError && /Filled picture request/.test(textOf(r)) && /All requested pictures are in/.test(textOf(r)) && pdHtml.includes(`images/gen-${reqId}.`),
    textOf(r).split("\n")[1],
  );
  r = await call("aurora_add_image", { dir: PD, base64: imgs[0]?.data ?? "", for: "not-an-id" });
  ok("add image {for} rejects a bad id", r.isError && /not a picture request id/.test(textOf(r)));

  if (process.env.AURORA_E2E_GENERATE) {
    r = await call("aurora_generate_image", { prompt: "minimal 3D render of a glowing qubit, dark navy background, soft studio light, no text", dir: DIR });
    ok("generate image", !r.isError && (r.content ?? []).some((c) => c.type === "image"), textOf(r).split("\n")[0]);
  } else console.log("skip generate image (set AURORA_E2E_GENERATE=1 to spend an image generation)");

  // A course with two small lessons, each with its own theme.
  const COURSE = join(base, "e2e", "course");
  r = await call("aurora_create_course", {
    course: {
      title: "Điện học cơ bản",
      lessons: [
        { title: "Dòng điện", summary: "Electron chuyển động có hướng", icon: "ph:lightning-duotone", when: "Tuần 1 · Thứ Hai", scene: "circuit" },
        { title: "Định luật Ôm", summary: "I = U / R", theme: "ocean", when: "Tuần 1 · Thứ Tư", scene: "waves" },
      ],
    },
    dir: COURSE,
  });
  const lessonDir = /dir: (.*01-dong-dien)/.exec(textOf(r))?.[1]?.trim();
  ok("create course", !r.isError && existsSync(join(COURSE, "index.html")) && !!lessonDir, textOf(r).split("\n")[0]);
  const courseHtml = existsSync(join(COURSE, "index.html")) ? readFileSync(join(COURSE, "index.html"), "utf8") : "";
  ok("course page shows lesson 'when' label", courseHtml.includes("c-when") && courseHtml.includes("Tuần 1 · Thứ Hai"));
  ok("course page previews lesson scene", courseHtml.includes("c-scn") && courseHtml.includes("scn-circuit"));
  r = await call("aurora_create_deck", { deck: { title: "Dòng điện", slides: [{ type: "title", title: "Dòng điện" }, { type: "summary", title: "Ghi nhớ", items: ["Dòng điện là dòng electron"] }] }, dir: lessonDir });
  const lessonHtml = existsSync(join(lessonDir ?? "", "index.html")) ? await import("node:fs").then((m) => m.readFileSync(join(lessonDir, "index.html"), "utf8")) : "";
  ok("lesson joins the course (theme, breadcrumb, next lesson, scene inheritance)", /lesson 1\/2/.test(textOf(r)) && lessonHtml.includes('class="crumb"') && lessonHtml.includes("Định luật Ôm") && /data-theme="aurora"/.test(lessonHtml) && lessonHtml.includes("scn-circuit"));
  r = await call("aurora_screenshot", { dir: COURSE });
  ok("course page screenshot", !r.isError && (r.content ?? []).some((c) => c.type === "image"));

  const pdf = join(base, "e2e", "deck.pdf");
  r = await call("aurora_export_pdf", { dir: DIR, out: pdf });
  ok("PDF export", !r.isError && existsSync(pdf) && statSync(pdf).size > 20000, textOf(r));

  // Predict slide + per-slide source
  const PRED_DIR = join(base, "e2e", "predict");
  r = await call("aurora_create_deck", {
    deck: {
      title: "Predict test",
      slides: [
        {
          type: "predict",
          title: "Predict sorted",
          question: "What does this print?",
          code: "xs = [3, 1, 2]\nprint(sorted(xs), xs)",
          lang: "py",
          command: "python test.py",
          output: "[1, 2, 3] [3, 1, 2]",
          explain: "sorted() returns a new sorted list.",
          source: "Python docs · sorted()",
        },
      ],
    },
    dir: PRED_DIR,
  });
  const predHtml = existsSync(join(PRED_DIR, "index.html")) ? readFileSync(join(PRED_DIR, "index.html"), "utf8") : "";
  ok(
    "predict slide with source builds HTML with output and source text",
    !r.isError &&
      predHtml.includes("[1, 2, 3] [3, 1, 2]") &&
      predHtml.includes("sl-source") &&
      predHtml.includes("Python docs · sorted()"),
  );

  // Verbatim code quote from a file + missing file warning
  const CODE_DIR = join(base, "e2e", "code");
  mkdirSync(CODE_DIR, { recursive: true });
  const pyCode = [
    "def line_1_header():",
    "    line_2_calc = 10",
    "    line_3_step = line_2_calc * 2",
    "    return line_3_step",
    "def line_5_footer():",
    "    pass",
  ].join("\n");
  writeFileSync(join(CODE_DIR, "algo.py"), pyCode, "utf8");

  r = await call("aurora_create_deck", {
    deck: {
      title: "Verbatim code",
      slides: [
        {
          type: "code",
          title: "Quoted python",
          file: "algo.py",
          lines: "2-4",
          steps: [{ lines: "3", text: "Multiply by 2" }],
        },
        {
          type: "code",
          title: "Missing file",
          file: "missing_file.py",
          lines: "1-5",
        },
      ],
    },
    dir: CODE_DIR,
  });

  const codeHtml = existsSync(join(CODE_DIR, "index.html")) ? readFileSync(join(CODE_DIR, "index.html"), "utf8") : "";
  const codeWarn = textOf(r);

  const codeText = codeHtml.replace(/<[^>]+>/g, "");
  ok(
    "code quote slide quotes real file lines 2-4 without line 1",
    !r.isError &&
      codeText.includes("line_2_calc = 10") &&
      codeText.includes("line_3_step = line_2_calc * 2") &&
      codeText.includes("return line_3_step") &&
      !codeHtml.includes("line_1_header"),
  );
  ok(
    "code quote slide shows gutter numbers 2, 3, 4",
    codeHtml.includes('data-l="2"') &&
      codeHtml.includes('data-l="3"') &&
      codeHtml.includes('data-l="4"') &&
      !codeHtml.includes('data-l="1"'),
  );
  ok(
    "missing code file produces warning and error card but deck builds",
    /Slide 2: cannot quote missing_file\.py/.test(codeWarn) &&
      codeHtml.includes("code-err"),
  );

  // Progress tracking & aurora_progress e2e tests
  const PROG_COURSE = join(base, "e2e", "prog_course");
  r = await call("aurora_create_course", {
    course: {
      title: "Khoá học tiến độ",
      lessons: [{ title: "Bài 1", summary: "Bài học thử nghiệm" }],
    },
    dir: PROG_COURSE,
  });
  const progLessonDir = /dir: (.*01-bai-1)/.exec(textOf(r))?.[1]?.trim();
  await call("aurora_create_deck", {
    deck: { title: "Bài 1", slides: [{ type: "title", title: "Bài 1" }] },
    dir: progLessonDir,
  });

  r = await call("aurora_preview", { dir: PROG_COURSE });
  const progUrl = /(?:Course preview|Preview):\s*(\S+)/i.exec(textOf(r))?.[1];
  ok("progress course preview starts", !!progUrl, progUrl);

  if (progUrl) {
    const origin = new URL(progUrl).origin;
    const progEndpoint = `${origin}/__aurora/progress`;

    // 1. Oversized payload (> 16 KB)
    const bigPayload = {
      v: 1,
      t: new Date().toISOString(),
      type: "quiz",
      question: "x".repeat(20000),
    };
    const bigRes = await fetch(progEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bigPayload),
    });
    ok("oversized progress payload rejected with 413", bigRes.status === 413);
    const okEvent = JSON.stringify({ v: 1, t: "2026-10-10T10:00:00+07:00", type: "quiz", question: "q", chosen: [0], answer: [1], correct: false });
    const plainRes = await fetch(progEndpoint, { method: "POST", headers: { "Content-Type": "text/plain" }, body: okEvent });
    ok("progress post with text/plain rejected with 415", plainRes.status === 415);
    const foreignRes = await fetch(progEndpoint, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: okEvent });
    ok("progress post from a foreign origin rejected with 403", foreignRes.status === 403);

    // 2. Post two valid events: quiz wrong and predict different
    const ev1 = {
      v: 1,
      t: "2026-10-10T10:00:00+07:00",
      course: "Khoá học tiến độ",
      lesson: "01-bai-1",
      deck: "Bài 1",
      slide: 2,
      slideId: "s-2",
      type: "quiz",
      question: "1 + 1 = ?",
      chosen: [0],
      chosenText: ["1"],
      answer: [1],
      answerText: ["2"],
      explanation: "1 cộng 1 bằng 2.",
      correct: false,
    };
    const ev2 = {
      v: 1,
      t: "2026-10-10T10:05:00+07:00",
      course: "Khoá học tiến độ",
      lesson: "01-bai-1",
      deck: "Bài 1",
      slide: 3,
      slideId: null,
      type: "predict",
      title: "Dự đoán kết quả",
      prediction: "Tôi nghĩ nó in 42",
      rating: "different",
      output: "100",
    };

    const res1 = await fetch(progEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ev1),
    });
    const res2 = await fetch(progEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ev2),
    });
    ok("progress events accepted with 204", res1.status === 204 && res2.status === 204);

    const progFile = join(PROG_COURSE, "progress.jsonl");
    const progLines = existsSync(progFile)
      ? readFileSync(progFile, "utf8").trim().split("\n").filter(Boolean)
      : [];
    ok("progress.jsonl written to course folder with 2 valid lines", progLines.length === 2, `${progLines.length} lines`);

    // 3. Create a fixture .jsonl with recall missed, card event, and complete events
    const fixFile = join(base, "e2e", "extra-progress.jsonl");
    const ev3 = {
      v: 1,
      t: "2026-10-10T10:10:00+07:00",
      course: "Khoá học tiến độ",
      lesson: "01-bai-1",
      deck: "Bài 1",
      slide: 4,
      slideId: "palace-1",
      type: "recall",
      palace: "living-room",
      station: 1,
      place: "Cửa chính",
      item: "Chìa khoá vàng",
      rating: "missed",
    };
    const evCard = {
      v: 1,
      t: "2026-10-10T10:12:00+07:00",
      course: "Khoá học tiến độ",
      lesson: "01-bai-1",
      deck: "Bài 1",
      slide: 4,
      type: "card",
      card: "card-srs-001",
      rating: "good",
      ms: 2500,
    };
    const ev4 = {
      v: 1,
      t: "2026-10-10T10:15:00+07:00",
      course: "Khoá học tiến độ",
      lesson: "01-bai-1",
      deck: "Bài 1",
      slide: 5,
      slideId: null,
      type: "complete",
      slides: 5,
      quiz: "0/1",
      predictions: "0/1",
    };
    writeFileSync(fixFile, [JSON.stringify(ev3), JSON.stringify(evCard), JSON.stringify(ev4)].join("\n") + "\n", "utf8");

    // Test card event via preview server endpoint
    const postCardValid = {
      v: 1,
      t: "2026-10-10T10:20:00+07:00",
      course: "Khoá học tiến độ",
      lesson: "01-bai-1",
      deck: "Bài 1",
      slide: 5,
      type: "card",
      card: "card-srs-002",
      rating: "again",
      ms: 4100,
    };
    const cardRes = await fetch(progEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postCardValid),
    });
    ok("card progress event accepted with 204", cardRes.status === 204);

    const postCardInvalid = {
      v: 1,
      t: "2026-10-10T10:21:00+07:00",
      course: "Khoá học tiến độ",
      lesson: "01-bai-1",
      deck: "Bài 1",
      slide: 5,
      type: "card",
      card: "card-srs-002",
      rating: "super_easy",
    };
    const badCardRes = await fetch(progEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postCardInvalid),
    });
    ok("invalid card rating rejected with 400", badCardRes.status === 400);

    // 4. Test aurora_progress tool on PROG_COURSE + fixture file
    r = await call("aurora_progress", { dir: PROG_COURSE, file: fixFile });
    const progSummary = textOf(r);
    ok(
      "aurora_progress summarizes accuracy, predictions, missed stations, card reviews, and review schedule",
      !r.isError &&
        progSummary.includes("01-bai-1") &&
        progSummary.includes("0/1 (0%)") &&
        progSummary.includes("chosen \"1\"") &&
        progSummary.includes("correct \"2\"") &&
        progSummary.includes("0 right, 1 different") &&
        progSummary.includes("Tôi nghĩ nó in 42") &&
        progSummary.includes("Cửa chính -> Chìa khoá vàng") &&
        progSummary.includes("Spaced repetition reviews") &&
        progSummary.includes("1 again") &&
        progSummary.includes("1 good") &&
        progSummary.includes("Completed on: 2026-10-10") &&
        progSummary.includes("+1d (2026-10-11)") &&
        progSummary.includes("+35d (2026-11-14)") &&
        progSummary.includes("polaris_progress_sync"),
      progSummary.split("\n").slice(0, 6).join(" | "),
    );
  }

  // 5. Build an SRS review deck (Vega style)
  const SRS_DIR = join(base, "e2e", "srs_deck");
  r = await call("aurora_create_deck", {
    deck: {
      title: "Phiên ôn tập FSRS",
      slides: [
        {
          type: "srs",
          card: "card-srs-001",
          eyebrow: "Ôn tập hàng ngày",
          front: "Ohm's law formula?",
          back: "**I = U / R**",
          hint: "Liên hệ giữa cường độ dòng điện, hiệu điện thế và điện trở.",
          hook: "Dòng điện I chảy qua chiếc cầu U bị cản bởi R.",
          origin: {
            label: "Điện học · Bài 1 · slide 3",
            href: "01-dong-dien/index.html#/3",
          },
        },
        {
          type: "summary",
          title: "Hoàn thành ôn tập",
          items: ["Đã hoàn thành phiên ôn tập FSRS."],
        },
      ],
    },
    dir: SRS_DIR,
  });
  const srsHtml = existsSync(join(SRS_DIR, "index.html")) ? readFileSync(join(SRS_DIR, "index.html"), "utf8") : "";
  ok(
    "create srs review deck",
    !r.isError &&
      srsHtml.includes("srs-card") &&
      srsHtml.includes("card-srs-001") &&
      srsHtml.includes("srs-rate-row") &&
      srsHtml.includes("Quên") &&
      srsHtml.includes("Nhớ"),
    textOf(r).split("\n")[0],
  );

  // 8. Trace slide (Mira, mira-embed.v1): schema, build and asset copy, fallbacks, relay validation, a real browser, progress, lint, guide.
  try {
    rmSync(TRACE_DIR, { recursive: true, force: true });
  } catch {
    /* leftovers of an earlier run are overwritten below */
  }
  mkdirSync(TRACE_DIR, { recursive: true });
  const playerFile = join(TRACE_DIR, "fixture", "mira", "tim-kiem-nhi-phan", "index.html");
  mkdirSync(dirname(playerFile), { recursive: true });
  writeFileSync(playerFile, MIRA_FIXTURE, "utf8");
  const J = JSON.stringify;
  const CAPTION = "Đoán giá trị của mid ở mỗi điểm dừng. Nhấn Esc để quay lại điều hướng slide.";
  const traceSlide = (extra = {}) => ({ type: "trace", id: "dolo", eyebrow: "Chạy từng dòng", title: "Tìm kiếm nhị phân qua từng bước", player: playerFile, caption: CAPTION, ...extra });
  const htmlOf = (dir) => (existsSync(join(dir, "index.html")) ? readFileSync(join(dir, "index.html"), "utf8") : "");
  // Where the copy of a player goes: assets/mira/<ascii slug of its folder>-<first 6 hex of sha1(absolute path)>.html
  const traceRel = (file) => {
    const abs = resolve(file);
    const key = abs.replace(/\\/g, "/").replace(/^[a-z]:/, (m) => m.toUpperCase());
    const folder = basename(dirname(abs)).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return `assets/mira/${folder}-${createHash("sha1").update(key).digest("hex").slice(0, 6)}.html`;
  };

  // (a) schema
  r = await call("aurora_create_deck", { deck: { title: "Trace", slides: [traceSlide()] }, dryRun: true });
  ok("trace: schema accepts a trace slide", !r.isError && /Valid deck with 1 slides/.test(textOf(r)), textOf(r).split("\n")[0]);
  const noPlayer = traceSlide();
  delete noPlayer.player;
  r = await call("aurora_create_deck", { deck: { title: "Trace", slides: [noPlayer] }, dryRun: true });
  ok("trace: schema rejects a trace slide without player", r.isError && /slides\[0\] \(trace\)/.test(textOf(r)) && /player/.test(textOf(r)), textOf(r).split("\n")[1]);
  r = await call("aurora_create_deck", { deck: { title: "Trace", slides: [traceSlide({ player: "" })] }, dryRun: true });
  ok("trace: schema rejects an empty player path", r.isError && /player/.test(textOf(r)));
  r = await call("aurora_create_deck", { deck: { title: "Trace", slides: [traceSlide({ plyer: "x" })] }, dryRun: true });
  ok("trace: a typo in a trace field gets a corrective error", r.isError && /did you mean "player" for "plyer"/.test(textOf(r)), textOf(r).split("\n")[1]?.slice(0, 160));

  // (b) build with a fixture player: the asset is copied, the iframe is lazy, nothing warns
  const TD = join(TRACE_DIR, "deck");
  const rel = traceRel(playerFile);
  const copy = join(TD, rel);
  r = await call("aurora_create_deck", { deck: { title: "Trace", lang: "vi", slides: [{ type: "title", title: "Mở đầu" }, traceSlide(), { type: "summary", title: "Tổng kết", items: ["Đã chạy thử"] }] }, dir: TD });
  const traceHtml = htmlOf(TD);
  ok(
    "trace: build copies the player to assets/mira/<slug>.html (slug = folder name + 6 hex of sha1(path))",
    !r.isError && /^assets\/mira\/tim-kiem-nhi-phan-[0-9a-f]{6}\.html$/.test(rel) && existsSync(copy) && readFileSync(copy, "utf8") === MIRA_FIXTURE,
    rel,
  );
  ok(
    "trace: slide renders a lazy iframe (data-src with ?embed=1, title, no src yet) in the tr-* frame",
    traceHtml.includes(`<iframe data-src="${rel}?embed=1" title="Tìm kiếm nhị phân qua từng bước" loading="lazy"></iframe>`) &&
      traceHtml.includes('class="trace"') && traceHtml.includes('class="tr-frame"') && traceHtml.includes('class="tr-ratio"') && traceHtml.includes('class="tr-cap"') &&
      traceHtml.includes(CAPTION),
  );
  ok("trace: a valid player gives no build warning", !/trace slide|Could not copy/.test(textOf(r)), textOf(r).split("\n").filter((l) => /trace/.test(l)).join(" | "));
  ok(
    "trace: print block names the title, the caption and the interactive version",
    traceHtml.includes('class="tr-print"') && traceHtml.includes(`Bản tương tác: ${rel}`) && /<b class="tr-print-t">Tìm kiếm nhị phân qua từng bước<\/b><p class="tr-print-c">/.test(traceHtml),
  );
  const m1 = statSync(copy).mtimeMs;
  await sleep(80);
  await call("aurora_build", { dir: TD });
  ok("trace: rebuilding with an unchanged player does not rewrite the copy", statSync(copy).mtimeMs === m1);
  writeFileSync(playerFile, `${MIRA_FIXTURE}<!-- v2 -->\n`, "utf8");
  await call("aurora_build", { dir: TD });
  ok("trace: a changed player is copied again", readFileSync(copy, "utf8").endsWith("<!-- v2 -->\n"));
  writeFileSync(playerFile, MIRA_FIXTURE, "utf8");
  await call("aurora_build", { dir: TD });

  // The same file by a relative path (backslashes too) lands in the same asset; folder names are slugged to ASCII.
  const TR = join(TRACE_DIR, "deck-rel");
  r = await call("aurora_create_deck", { deck: { title: "Trace rel", slides: [traceSlide({ player: "..\\fixture\\mira\\tim-kiem-nhi-phan\\index.html" })] }, dir: TR });
  ok("trace: a relative player path (even with backslashes) resolves from the deck folder to the same asset", !r.isError && existsSync(join(TR, rel)) && !/trace slide/.test(textOf(r)), textOf(r).split("\n")[0]);
  const accented = join(TRACE_DIR, "fixture", "mira", "Đệ quy (Fibonacci)", "index.html");
  mkdirSync(dirname(accented), { recursive: true });
  writeFileSync(accented, MIRA_FIXTURE, "utf8");
  const TA = join(TRACE_DIR, "deck-accent");
  r = await call("aurora_create_deck", { deck: { title: "Trace accent", slides: [traceSlide({ player: accented })] }, dir: TA });
  const accentCopies = existsSync(join(TA, "assets", "mira")) ? readdirSync(join(TA, "assets", "mira")) : [];
  ok("trace: the copy is named with an ASCII slug of the folder (legal file name on every system)", accentCopies.length === 1 && /^de-quy-fibonacci-[0-9a-f]{6}\.html$/.test(accentCopies[0]), accentCopies.join(", "));
  const loose = join(TRACE_DIR, "fixture", "mira", "loose", "index.html");
  mkdirSync(dirname(loose), { recursive: true });
  writeFileSync(loose, "<!doctype html><META CONTENT='1' NAME='mira-player'><title>loose</title>\n", "utf8");
  r = await call("aurora_create_deck", { deck: { title: "Trace loose", slides: [traceSlide({ player: loose })] }, dir: join(TRACE_DIR, "deck-loose") });
  ok("trace: the mira-player meta is found whatever the attribute order, quotes and case", !r.isError && !/trace slide/.test(textOf(r)));

  // (c) missing player: warning, calm fallback card, the build still succeeds (Vietnamese and English decks)
  const TM = join(TRACE_DIR, "deck-missing");
  r = await call("aurora_create_deck", { deck: { title: "Thiếu", lang: "vi", slides: [traceSlide({ player: "mira/khong-co/index.html", id: undefined })] }, dir: TM });
  const missingHtml = htmlOf(TM);
  ok(
    "trace: missing player gives a build warning with the path and a Vietnamese fallback card; the build succeeds",
    !r.isError &&
      textOf(r).includes("trace slide 1: player not found / not a Mira player: mira/khong-co/index.html") &&
      missingHtml.includes('class="tr-missing"') &&
      missingHtml.includes("Chưa có trình dò Mira tại mira/khong-co/index.html. Tạo bằng mira_build rồi build lại deck.") &&
      !missingHtml.includes("<iframe data-src="),
    textOf(r).split("\n").find((l) => /trace slide/.test(l)),
  );
  const TME = join(TRACE_DIR, "deck-missing-en");
  r = await call("aurora_create_deck", { deck: { title: "Missing", lang: "en", slides: [traceSlide({ player: "mira/none/index.html", caption: undefined })] }, dir: TME });
  const missingEn = htmlOf(TME);
  ok(
    "trace: English deck gets the English fallback card and the English default hint",
    !r.isError && missingEn.includes("No Mira trace player at mira/none/index.html. Build one with mira_build, then rebuild the deck.") && missingEn.includes("Predict at every stop. Press Esc to return to slide navigation."),
  );
  r = await call("aurora_audit", { dir: TM });
  ok("trace: audit reports a missing player as a warning, not an error", /1 warning/.test(textOf(r)) && /Mira player/.test(textOf(r)) && /0 error/.test(textOf(r)), textOf(r).split("\n")[0]);

  // (d) a page without the mira-player meta is not a Mira player
  const notMira = join(TRACE_DIR, "fixture", "not-mira", "index.html");
  mkdirSync(dirname(notMira), { recursive: true });
  writeFileSync(notMira, "<!doctype html><title>Not Mira</title><p>Just a page</p>\n", "utf8");
  const TN = join(TRACE_DIR, "deck-nometa");
  r = await call("aurora_create_deck", { deck: { title: "Không phải Mira", slides: [traceSlide({ player: notMira })] }, dir: TN });
  ok(
    "trace: a player without the mira-player meta warns, shows the fallback card and is not copied",
    !r.isError && textOf(r).includes(`trace slide 1: player not found / not a Mira player: ${notMira}`) && htmlOf(TN).includes("tr-missing") && !existsSync(join(TN, "assets", "mira")),
  );

  // (e) the message validation of the runtime, run on its own: the pure block of runtime/aurora.js
  const runtimeSrc = readFileSync(join(ROOT, "runtime", "aurora.js"), "utf8");
  const pureBlock = /\/\/ <pure:miraEventPayload>([\s\S]*?)\/\/ <\/pure:miraEventPayload>/.exec(runtimeSrc)?.[1];
  const miraPayload = pureBlock ? new Function(`${pureBlock}\nreturn miraEventPayload;`)() : undefined;
  ok("trace: runtime has the pure miraEventPayload block and a single message listener", typeof miraPayload === "function" && (runtimeSrc.match(/window\.addEventListener\(\s*["']message["']/g) ?? []).length === 1);
  if (typeof miraPayload === "function") {
    const predict = (over = {}, top = {}) => ({ source: "mira", v: 1, kind: "event", ...top, event: { type: "predict", title: "Giá trị của mid", prediction: "mid = 3", rating: "right", output: "3", slideId: "mira-stop-1", ...over } });
    ok("trace validation: a valid predict becomes the payload (slideId = slide id + ':' + stop id)", J(miraPayload(predict(), "dolo", 2)) === J({ title: "Giá trị của mid", prediction: "mid = 3", rating: "right", output: "3", slideId: "dolo:mira-stop-1" }));
    ok("trace validation: without a slide id the slideId uses trace-<slide number>", miraPayload(predict(), null, 7)?.slideId === "trace-7:mira-stop-1" && miraPayload(predict(), undefined, 3)?.slideId === "trace-3:mira-stop-1");
    ok("trace validation: wrong source or version or kind is dropped", miraPayload(predict({}, { source: "aurora" }), "d", 1) === null && miraPayload(predict({}, { source: "Mira" }), "d", 1) === null && miraPayload(predict({}, { v: 2 }), "d", 1) === null && miraPayload(predict({}, { v: "1" }), "d", 1) === null && miraPayload(predict({}, { kind: "ready" }), "d", 1) === null && miraPayload(predict({}, { kind: "blur" }), "d", 1) === null);
    ok("trace validation: a bad rating is dropped", ["maybe", "got", "missed", "", 1, null, undefined].every((rating) => miraPayload(predict({ rating }), "d", 1) === null) && miraPayload(predict({ rating: "different" }), "d", 1)?.rating === "different");
    ok("trace validation: a bad slideId is dropped", ["stop-1", "mira-stop-", "mira-stop-x", "mira-stop-1x", "mira-stop--1", "mira-stop-1\n", " mira-stop-1", "", 1, null, undefined].every((slideId) => miraPayload(predict({ slideId }), "d", 1) === null) && miraPayload(predict({ slideId: "mira-stop-12" }), "d", 1)?.slideId === "d:mira-stop-12");
    const longOut = miraPayload(predict({ title: "t".repeat(250), prediction: "p".repeat(2500), output: "o".repeat(400) }), "d", 1);
    ok("trace validation: over-long strings are truncated to 200 / 2000 / 300", longOut?.title.length === 200 && longOut?.prediction.length === 2000 && longOut?.output.length === 300);
    // U+1D49C is outside the BMP (two UTF-16 units): cutting at 200 would leave half of it, so the whole character must go
    const astral = miraPayload(predict({ title: `${"a".repeat(199)}\u{1D49C}` }), "d", 1);
    ok("trace validation: a cut never splits a surrogate pair", astral?.title === "a".repeat(199));
    ok("trace validation: the player's own 'complete' (and any other event type) is ignored", ["complete", "quiz", "recall", "card", undefined].every((type) => miraPayload(predict({ type }), "d", 1) === null));
    ok("trace validation: non-string fields are dropped, absent optional ones become empty strings", miraPayload(predict({ prediction: 5 }), "d", 1) === null && miraPayload(predict({ title: {} }), "d", 1) === null && miraPayload(predict({ output: [] }), "d", 1) === null && miraPayload(predict({ prediction: undefined }), "d", 1) === null && J(miraPayload(predict({ title: undefined, output: undefined }), "d", 1)) === J({ title: "", prediction: "mid = 3", rating: "right", output: "", slideId: "d:mira-stop-1" }));
    ok("trace validation: garbage messages are dropped", [null, undefined, 5, "mira", [], {}, { source: "mira", v: 1, kind: "event" }, { source: "mira", v: 1, kind: "event", event: null }].every((d) => miraPayload(d, "d", 1) === null));
  }

  // Progress summary: predictions made in a Mira player are listed under their own sub-heading.
  const PROGD = join(TRACE_DIR, "progress");
  mkdirSync(PROGD, { recursive: true });
  const progEv = (o) => J(Object.assign({ v: 1, t: "2026-10-12T09:00:00+07:00", deck: "Tìm kiếm", slide: 2 }, o));
  writeFileSync(
    join(PROGD, "progress.jsonl"),
    [
      progEv({ t: "2026-10-12T09:00:01+07:00", type: "predict", slideId: "dolo:mira-stop-1", title: "Giá trị của mid", prediction: "mid = 3", rating: "right", output: "3" }),
      progEv({ t: "2026-10-12T09:00:02+07:00", type: "predict", slideId: "dolo:mira-stop-2", title: "Nhánh nào chạy", prediction: "nhánh else", rating: "different", output: "lo = mid + 1" }),
      progEv({ t: "2026-10-12T09:00:03+07:00", type: "predict", slideId: "s-3", slide: 3, title: "Dự đoán thường", prediction: "42", rating: "different", output: "100" }),
    ].join("\n") + "\n",
    "utf8",
  );
  r = await call("aurora_progress", { dir: PROGD });
  const [beforeMira = "", afterMira = ""] = textOf(r).split("#### Dò code (Mira)");
  ok(
    "trace: aurora_progress lists Mira predictions under 'Dò code (Mira)' with right/different counts; the rest is unchanged",
    !r.isError && afterMira.includes("- Predictions: 1 right, 1 different") && afterMira.includes("Nhánh nào chạy (mira-stop-2)") && afterMira.includes("nhánh else") &&
      beforeMira.includes("- Predictions: 0 right, 1 different") && beforeMira.includes("Dự đoán thường") && !beforeMira.includes("nhánh else"),
    textOf(r).split("\n").slice(0, 3).join(" | "),
  );

  // Lint: hints only, never blocking.
  const lintHint = (slides) => call("aurora_create_deck", { deck: { title: "Lint", slides }, dryRun: true }).then((x) => ({ valid: !x.isError, hint: /add a "caption" saying what to predict/.test(textOf(x)) }));
  const bare = { type: "trace", title: "Không chú thích", player: "x/index.html" };
  let hint = await lintHint([bare]);
  ok("trace lint: no caption and no code or predict slide before it gives a pedagogy hint (the deck stays valid)", hint.valid && hint.hint);
  hint = await lintHint([{ type: "predict", title: "Đoán", question: "In ra gì?", code: "print(1)", output: "1", explain: "In 1." }, bare]);
  ok("trace lint: a predict slide before the trace removes the hint", hint.valid && !hint.hint);
  hint = await lintHint([{ type: "code", title: "Mã", code: "x = 1", lang: "python" }, bare]);
  ok("trace lint: a code slide before the trace removes the hint", hint.valid && !hint.hint);
  hint = await lintHint([{ ...bare, caption: "Đoán giá trị của x." }]);
  ok("trace lint: a caption removes the hint", hint.valid && !hint.hint);

  // Guide and server instructions
  r = await call("aurora_guide", { type: "trace" });
  ok(
    "trace guide: fields, Vietnamese example, when to use, 3-8 stops, mira_build, Esc",
    !r.isError && ["- player:", "- caption?", '"type": "trace"', "Chạy từng dòng", "3-8 stops", "mira_build", "Esc", "mira-stop-"].every((s) => textOf(r).includes(s)),
  );
  r = await call("aurora_guide");
  ok("trace guide: the overview lists trace among the slide types", textOf(r).includes("- **trace**:"));
  r = await call("aurora_guide", { topic: "progress" });
  ok("trace guide: topic progress documents the Mira relay and the ecosystem (Mira, Sirius, Orion, SmartDrive, Constellation)", ["Mira", "mira-stop-", "Sirius: execution loop - deadlines, triage, today router, session timer, weekly review", "Orion", "SmartDrive", "Constellation", "Polaris", "Vega"].every((s) => textOf(r).includes(s)));
  ok("trace guide: server instructions mention the trace slide", (client.getInstructions() ?? "").includes('"trace"') && (client.getInstructions() ?? "").includes("mira_build"));

  // Look, audit and PDF of a deck with a trace slide
  r = await call("aurora_screenshot", { dir: TD, slides: [2], width: 960 });
  ok("trace: screenshot of the trace slide", !r.isError && (r.content ?? []).filter((c) => c.type === "image").length === 1);
  r = await call("aurora_audit", { dir: TD });
  ok("trace: audit of a deck with a working player reports no error", !r.isError && /0 error/.test(textOf(r)), textOf(r).split("\n")[0]);
  r = await call("aurora_export_pdf", { dir: TD, out: join(TRACE_DIR, "trace.pdf") });
  ok("trace: PDF export works (the player is replaced by the static block)", !r.isError && existsSync(join(TRACE_DIR, "trace.pdf")) && statSync(join(TRACE_DIR, "trace.pdf")).size > 20000, textOf(r));

  // Version 0.8.0 is declared consistently
  const declared = {
    "package.json": /"version":\s*"([\d.]+)"/.exec(readFileSync(join(ROOT, "package.json"), "utf8"))?.[1],
    "src/util.ts": /export const VERSION = "([\d.]+)"/.exec(readFileSync(join(ROOT, "src", "util.ts"), "utf8"))?.[1],
    "README.md": /Current version: \*\*([\d.]+)\*\*/.exec(readFileSync(join(ROOT, "README.md"), "utf8"))?.[1],
    "README.vi.md": /Phiên bản hiện tại: \*\*([\d.]+)\*\*/.exec(readFileSync(join(ROOT, "README.vi.md"), "utf8"))?.[1],
    "PLAN.md": /^## Status \([\d-]+\): v([\d.]+)/m.exec(readFileSync(join(ROOT, "PLAN.md"), "utf8"))?.[1],
    "server": client.getServerVersion()?.version,
    "deck html": /<meta name="generator" content="Aurora Slides ([\d.]+)">/.exec(traceHtml)?.[1],
  };
  ok("version: 0.8.0 everywhere it is declared (package.json, VERSION, both READMEs, PLAN.md, server, built decks)", Object.values(declared).every((v) => v === "0.8.0"), JSON.stringify(declared));

  // (f) a real browser: the deck under the preview server, the fixture player talks to it, the event reaches progress.jsonl
  const TB = join(TRACE_DIR, "deck-browser");
  r = await call("aurora_create_deck", {
    deck: { title: "Trace trong trình duyệt", lang: "vi", slides: [{ type: "title", title: "Mở đầu" }, traceSlide(), { type: "trace", title: "Thiếu trình dò", player: "mira/khong-co/index.html" }, { type: "summary", title: "Tổng kết", items: ["Đã chạy thử"] }] },
    dir: TB,
  });
  const browser = !r.isError ? await startBrowser().catch((e) => ({ failed: e })) : { failed: new Error(textOf(r)) };
  if (browser.skipped) console.log(`skip trace relay in a real browser (${browser.skipped})`);
  else if (browser.failed) ok("trace relay in a real browser: browser starts", false, String(browser.failed?.message ?? browser.failed).slice(0, 200));
  else {
    try {
      r = await call("aurora_preview", { dir: TB });
      const traceUrl = /Preview: (\S+)/.exec(textOf(r))?.[1];
      const pg = await browser.page(traceUrl);
      const progFile = join(TB, "progress.jsonl");
      const frameJs = "document.querySelector('.trace iframe')";
      await pg.evaluate("window.__aurora.go(1, { instant: true }), true"); // slide 2: the iframe loads lazily when the slide opens
      const first = await waitFor(() => readEvents(progFile).find((e) => e.type === "predict"), 20000);
      ok(
        "trace relay (real browser): the player's predict event reaches progress.jsonl as <id>:mira-stop-1",
        !!first && first.slideId === "dolo:mira-stop-1" && first.rating === "right" && first.prediction === "mid = 3" && first.title === "Dự đoán giá trị của mid" && first.output === "mid = 3" && first.v === 1 && first.slide === 2 && first.deck === "Trace trong trình duyệt",
        JSON.stringify(first)?.slice(0, 220),
      );
      await sleep(800);
      const lines = readEvents(progFile);
      ok("trace relay (real browser): an invalid rating and the player's own 'complete' are dropped (exactly one event)", lines.length === 1 && lines[0].type === "predict", `${lines.length} event(s): ${lines.map((e) => e.type).join(", ")}`);
      const helloRaw = await waitFor(() => pg.evaluate(`(() => { try { return ${frameJs}.contentDocument.documentElement.dataset.hello || ""; } catch (e) { return ""; } })()`), 10000);
      const hello = helloRaw ? JSON.parse(helloRaw) : null;
      ok("trace relay (real browser): after ready the deck says hello with theme and #RRGGBB accent", hello?.source === "aurora" && hello?.v === 1 && hello?.kind === "hello" && hello?.theme === "dark" && /^#[0-9a-f]{6}$/i.test(hello?.accent ?? ""), helloRaw);
      const embed = await pg.evaluate(`JSON.stringify({ embed: ${frameJs}.contentDocument.documentElement.dataset.embed, src: ${frameJs}.getAttribute("src") })`);
      ok("trace relay (real browser): the iframe src is the copied player with ?embed=1 and the player sees it", /\?embed=1"/.test(embed) && embed.includes('"embed":"1"') && embed.includes(rel), embed);
      await pg.evaluate("window.__aurora.go(0, { instant: true }), true");
      ok("trace relay (real browser): the player stays loaded after the slide is left", await pg.evaluate(`!!${frameJs}.getAttribute("src")`));
      await pg.evaluate("window.__aurora.go(1, { instant: true }), true");
      const arrowRight = async () => {
        for (const type of ["keyDown", "keyUp"]) await pg.cmd("Input.dispatchKeyEvent", { type, key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
        await sleep(500);
        return pg.evaluate("window.__aurora.state().slide");
      };
      const gotFocus = await pg.evaluate(`${frameJs}.contentWindow.focus(), document.activeElement === ${frameJs}`);
      const at = await pg.evaluate("window.__aurora.state().slide");
      const whileInPlayer = await arrowRight(); // the player holds the keyboard: the deck must not move
      await pg.evaluate("window.__aurora.go(1, { instant: true }), true");
      await pg.evaluate(`${frameJs}.contentWindow.__sendBlur(), true`); // what the player sends when Esc is pressed inside it
      const gaveBack = await waitFor(() => pg.evaluate(`document.activeElement !== ${frameJs}`), 3000, 100);
      const afterBlur = await arrowRight();
      if (!gotFocus || whileInPlayer !== at) console.log(`skip blur check: this browser does not route key events to a focused iframe (iframe focused: ${gotFocus}; slide ${at} -> ${whileInPlayer} while it had focus)`);
      else ok("trace relay (real browser): → is swallowed by the player until it sends blur, then moves to the next slide again", !!gaveBack && afterBlur === at + 1, `slide ${at}: ${whileInPlayer} while in the player, ${afterBlur} after blur`);
      await pg.evaluate("window.__aurora.go(1, { instant: true }), true");
      await pg.evaluate("window.__aurora.setStatic(true), true");
      await pg.evaluate(`${frameJs}.contentWindow.__sendPredict(5), true`);
      await sleep(700);
      ok("trace relay (real browser): nothing is relayed while STATIC is set", readEvents(progFile).length === 1);
      await pg.evaluate("window.__aurora.setStatic(false), true");
      await pg.evaluate(`${frameJs}.contentWindow.__sendPredict(3, "different"), true`);
      const third = await waitFor(() => readEvents(progFile).find((e) => e.slideId === "dolo:mira-stop-3"), 10000);
      ok("trace relay (real browser): later predictions keep flowing (stop 3, different)", !!third && third.rating === "different" && third.prediction === "dự đoán 3" && third.output === "kết quả 3" && third.type === "predict");
      await pg.evaluate(`window.postMessage({ source: "mira", v: 1, kind: "event", event: { type: "predict", title: "x", prediction: "x", rating: "right", output: "x", slideId: "mira-stop-9" } }, "*"), true`);
      await sleep(600);
      ok("trace relay (real browser): a message that does not come from a trace iframe is ignored", !readEvents(progFile).some((e) => e.slideId === "dolo:mira-stop-9"));
      const shipped = await pg.evaluate(
        `JSON.stringify([window.__aurora.miraEventPayload({ source: "mira", v: 1, kind: "event", event: { type: "predict", title: "t", prediction: "p", rating: "right", output: "o", slideId: "mira-stop-1" } }, null, 4), window.__aurora.miraEventPayload({ source: "mira", v: 1, kind: "event", event: { type: "complete" } }, null, 4)])`,
      );
      ok("trace relay (real browser): the shipped runtime (assets/aurora.min.js) validates like the source", shipped === J([{ title: "t", prediction: "p", rating: "right", output: "o", slideId: "trace-4:mira-stop-1" }, null]), shipped);
      await pg.cmd("Emulation.setEmulatedMedia", { media: "print" });
      const printed = JSON.parse(
        await pg.evaluate(`(() => { const s = document.querySelector('.slide.t-trace'); const d = (sel) => { const el = s.querySelector(sel); return el ? getComputedStyle(el).display : 'none'; }; const p = s.querySelector('.tr-print'); return JSON.stringify({ print: d('.tr-print'), frame: d('.tr-frame'), cap: d('.tr-cap'), text: p ? p.textContent : '' }); })()`),
      );
      await pg.cmd("Emulation.setEmulatedMedia", { media: "" });
      ok(
        "trace (real browser): under @media print the player is hidden and a static block shows title, caption and the interactive path",
        printed.print !== "none" && printed.frame === "none" && printed.cap === "none" && printed.text.includes("Tìm kiếm nhị phân qua từng bước") && printed.text.includes(CAPTION) && printed.text.includes(`Bản tương tác: ${rel}`),
        JSON.stringify(printed).slice(0, 200),
      );
      await pg.evaluate("window.__aurora.setStatic(true), true");
      const audit = await pg.evaluate("JSON.stringify(window.__aurora.audit().map((a) => a.issues))");
      ok("trace (real browser): audit warns about the missing player and finds no error on the working one", /Mira player/.test(audit) && !/"level":"error"/.test(audit), audit.slice(0, 200));
      // A light theme with a named accent: hello says light and the accent is resolved to #RRGGBB; opened from file:// (no preview server)
      // the event waits in the localStorage buffer that the export button downloads.
      const TL = join(TRACE_DIR, "deck-light");
      r = await call("aurora_create_deck", {
        deck: { title: "Trace sáng", lang: "vi", theme: "daylight", accent: "orange", slides: [{ type: "title", title: "Mở đầu" }, traceSlide({ id: "sang" }), { type: "summary", title: "Tổng kết", items: ["Xong"] }] },
        dir: TL,
      });
      r = await call("aurora_preview", { dir: TL });
      const pgLight = await browser.page(/Preview: (\S+)/.exec(textOf(r))?.[1]);
      // Reach the trace slide the way a learner does: → from the title slide (an animated transition), not go(…, {instant})
      for (const type of ["keyDown", "keyUp"]) await pgLight.cmd("Input.dispatchKeyEvent", { type, key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
      const helloLight = await waitFor(() => pgLight.evaluate(`(() => { try { return ${frameJs}.contentDocument.documentElement.dataset.hello || ""; } catch (e) { return ""; } })()`), 10000);
      const hl = helloLight ? JSON.parse(helloLight) : null;
      ok(
        "trace (real browser): → from the previous slide (animated transition) loads the lazy iframe and hides the placeholder",
        (await pgLight.evaluate("window.__aurora.state().slide")) === 2 && (await pgLight.evaluate(`document.querySelector('.tr-frame').classList.contains('live') && getComputedStyle(document.querySelector('.tr-ph')).display === 'none'`)),
      );
      ok("trace relay (real browser): a light theme and a named accent give hello {theme: light, accent: #RRGGBB of that accent}", hl?.theme === "light" && /^#[0-9a-f]{6}$/i.test(hl?.accent ?? "") && hl.accent.toLowerCase() !== "#0071e3", helloLight);
      const pgFile = await browser.page(pathToFileURL(join(TL, "index.html")).href);
      await pgFile.evaluate("window.__aurora.go(1, { instant: true }), true");
      const buffered = await waitFor(
        async () => {
          const t = await pgFile.evaluate(`JSON.stringify(Object.keys(localStorage).filter((k) => k.endsWith(":events")).flatMap((k) => JSON.parse(localStorage.getItem(k))))`);
          return t.includes("sang:mira-stop-1") ? t : "";
        },
        15000,
      );
      const bufEvents = buffered ? JSON.parse(buffered) : [];
      ok(
        "trace relay (real browser, file://): without a preview server the event waits in the localStorage buffer (exported by the button)",
        bufEvents.some((e) => e.type === "predict" && e.slideId === "sang:mira-stop-1" && e.rating === "right" && e.v === 1) && !bufEvents.some((e) => e.type === "complete"),
        buffered?.slice(0, 200),
      );
      ok("trace relay (real browser): no uncaught JavaScript exception in the deck or the player", browser.exceptions.length === 0, browser.exceptions.join(" | ").slice(0, 200));
    } catch (e) {
      ok("trace relay in a real browser: ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | ").slice(0, 300));
    } finally {
      await browser.close();
    }
  }

  // 6. Statement slide accepts eyebrow as kicker alias
  const STMT_DIR = join(base, "e2e", "statement_deck");
  r = await call("aurora_create_deck", {
    deck: {
      title: "Statement Slide Alias",
      slides: [
        {
          type: "statement",
          eyebrow: "Ý chính",
          text: "Mọi slide đều dùng ++eyebrow++ đồng nhất.",
        },
      ],
    },
    dir: STMT_DIR,
  });
  const stmtHtml = existsSync(join(STMT_DIR, "index.html")) ? readFileSync(join(STMT_DIR, "index.html"), "utf8") : "";
  ok(
    "statement slide with eyebrow builds and HTML shows it",
    !r.isError && stmtHtml.includes('<div class="kicker"') && stmtHtml.includes("Ý chính"),
    textOf(r).split("\n")[0],
  );

  // When both kicker and eyebrow are given, kicker wins and content note says so
  r = await call("aurora_create_deck", {
    deck: {
      title: "Statement Both Kicker and Eyebrow",
      slides: [
        {
          type: "statement",
          kicker: "Kicker chính",
          eyebrow: "Eyebrow phụ",
          text: "Khi có cả hai thì ++kicker thắng++.",
        },
      ],
    },
    dryRun: true,
  });
  const bothNote = textOf(r);
  ok(
    "statement slide with both kicker and eyebrow: kicker wins and content note is emitted",
    !r.isError && bothNote.includes('both "kicker" and "eyebrow" given; "kicker" wins'),
    bothNote.split("\n").find((l) => l.includes("wins")) || "(no note)",
  );

  // Real typo on statement slide still produces corrective validation error
  r = await call("aurora_create_deck", {
    deck: {
      title: "Statement Typo",
      slides: [
        {
          type: "statement",
          eybro: "Typo field",
          text: "Lỗi chính tả trường.",
        },
      ],
    },
    dryRun: true,
  });
  const typoErr = textOf(r);
  ok(
    "statement slide typo produces corrective validation error",
    r.isError && /did you mean "eyebrow" for "eybro"/.test(typoErr),
    typoErr.split("\n").slice(1, 3).join(" | "),
  );

  // 7. Practice slides: order, match, sort, and typed cloze e2e
  r = await call("aurora_guide", { topic: "practice" });
  ok("guide practice section", !r.isError && textOf(r).includes("order") && textOf(r).includes("match") && textOf(r).includes("sort"));
  r = await call("aurora_guide", { type: "order" });
  ok("guide order type", !r.isError && textOf(r).includes('"type": "order"') && textOf(r).includes("items"));
  r = await call("aurora_guide", { type: "match" });
  ok("guide match type", !r.isError && textOf(r).includes('"type": "match"') && textOf(r).includes("pairs"));
  r = await call("aurora_guide", { type: "sort" });
  ok("guide sort type", !r.isError && textOf(r).includes('"type": "sort"') && textOf(r).includes("groups"));

  const PRACTICE_DIR = join(base, "e2e", "practice_deck");
  r = await call("aurora_create_deck", {
    deck: {
      title: "Luyện tập Quang hợp",
      lang: "vi",
      slides: [
        {
          type: "order",
          title: "Thứ tự pha sáng",
          items: [
            "Hấp thụ photon ánh sáng",
            "Quang phân li nước",
            "Vận chuyển electron",
            "Tổng hợp ATP và NADPH",
          ],
          explanation: "Ánh sáng kích thích diệp lục -> phân li nước -> truyền e -> tổng hợp ATP/NADPH.",
        },
        {
          type: "match",
          title: "Nối thành phần",
          pairs: [
            { left: "Màng thylakoid", right: "Nơi diễn ra pha sáng" },
            { left: "Chất nền stroma", right: "Nơi diễn ra chu trình Calvin" },
            { left: "Diệp lục a", right: "Trung tâm phản ứng quang hợp" },
          ],
          explanation: "Pha sáng ở thylakoid, pha tối ở stroma.",
        },
        {
          type: "sort",
          title: "Phân loại pha sáng và tối",
          groups: [
            { label: "Pha sáng", items: ["Quang phân li nước", "Giải phóng O₂"] },
            { label: "Pha tối", items: ["Cố định CO₂", "Tiêu thụ NADPH"] },
          ],
          explanation: "Pha sáng tạo ATP/NADPH, pha tối tiêu thụ chúng.",
        },
        {
          type: "cloze",
          title: "Điền từ quang hợp",
          input: true,
          text: "Pha sáng xảy ra tại [[màng thylakoid|thylakoid]], còn pha tối diễn ra ở [[chất nền stroma|stroma]].",
          explanation: "Thylakoid chứa sắc tố, stroma chứa enzyme chu trình Calvin.",
        },
        {
          type: "summary",
          title: "Tổng kết",
          items: ["Đã hoàn thành các bài luyện tập."],
        },
      ],
    },
    dir: PRACTICE_DIR,
  });
  const practiceHtml = existsSync(join(PRACTICE_DIR, "index.html")) ? readFileSync(join(PRACTICE_DIR, "index.html"), "utf8") : "";
  ok(
    "practice deck with order, match, sort, typed cloze builds HTML with all interaction elements",
    !r.isError &&
      practiceHtml.includes("od-tile") &&
      practiceHtml.includes("mt-item") &&
      practiceHtml.includes("mt-lines") &&
      practiceHtml.includes("st-chip") &&
      practiceHtml.includes("st-bin") &&
      practiceHtml.includes("cz-in") &&
      practiceHtml.includes("qz-actions"),
    textOf(r).split("\n")[0],
  );

  // Validation: sort total items < 4 is rejected
  r = await call("aurora_create_deck", {
    deck: {
      title: "Sort too few",
      slides: [
        {
          type: "sort",
          title: "Ít mục",
          groups: [
            { label: "Nhóm 1", items: ["A"] },
            { label: "Nhóm 2", items: ["B"] },
          ],
        },
      ],
    },
    dryRun: true,
  });
  ok("sort with total items < 4 is rejected with actionable error", r.isError && /at least 4 items/i.test(textOf(r)));

  // 8. LaTeX repair & Python trace lint
  // Check 1: Doubled backslashes repair in notebook formula and bullets
  const LATEX_DIR = join(base, "e2e", "deck_latex_repair");
  r = await call("aurora_create_deck", {
    deck: {
      title: "LaTeX Repair Test",
      slides: [
        {
          type: "notebook",
          title: "Công thức toán",
          lines: [
            "= \\\\text{Q} \\\\to (\\\\text{T} \\\\to \\\\text{A})^* \\\\to \\\\text{F}",
          ],
        },
        {
          type: "bullets",
          title: "Ý chính",
          items: [
            "Ký hiệu $\\\\alpha$ trong biểu thức",
          ],
        },
      ],
    },
    dir: LATEX_DIR,
  });
  const latexJson = existsSync(join(LATEX_DIR, "deck.json")) ? readFileSync(join(LATEX_DIR, "deck.json"), "utf8") : "";
  const latexHtml = existsSync(join(LATEX_DIR, "index.html")) ? readFileSync(join(LATEX_DIR, "index.html"), "utf8") : "";
  ok(
    "latex repair: build warnings contain doubled backslash",
    !r.isError && /doubled backslash/i.test(textOf(r)),
    textOf(r).split("\n").find((l) => /doubled backslash/i.test(l)),
  );
  ok(
    "latex repair: saved deck.json contains \\text{Q} as two backslashes in JSON text and no four",
    latexJson.includes("\\\\text{Q}") && !latexJson.includes("\\\\\\\\text{Q}"),
  );
  ok(
    "latex repair: built HTML has no KaTeX line-break element",
    !latexHtml.includes("mspace katex-newline"),
  );

  const BREAK_DIR = join(base, "e2e", "deck_latex_break");
  r = await call("aurora_create_deck", {
    deck: {
      title: "LaTeX Break Test",
      slides: [
        {
          type: "notebook",
          title: "Công thức",
          lines: [
            "= a \\\\ b",
          ],
        },
      ],
    },
    dir: BREAK_DIR,
  });
  const breakJson = existsSync(join(BREAK_DIR, "deck.json")) ? readFileSync(join(BREAK_DIR, "deck.json"), "utf8") : "";
  const breakHtml = existsSync(join(BREAK_DIR, "index.html")) ? readFileSync(join(BREAK_DIR, "index.html"), "utf8") : "";
  ok(
    "latex repair: a real line break (backslashes followed by a space) is kept and renders as a KaTeX newline",
    breakJson.includes("= a \\\\\\\\ b") && breakHtml.includes("mspace katex-newline"),
  );

  // Check 2: Direct assertions on repairTex
  const esbuild = req("esbuild");
  const utilTs = readFileSync(join(ROOT, "src", "util.ts"), "utf8");
  const repairBlock = utilTs.slice(utilTs.indexOf("/* ───────────── LaTeX repair ─────────────"));
  const repairJs = esbuild.transformSync(repairBlock.replace(/export\s+/g, ""), { loader: "ts" }).code;
  const { repairTex, repairDeckTex } = new Function(repairJs + "; return { repairTex, repairDeckTex };")();

  ok(
    "repairTex: leaves legitimate matrix and aligned breaks unchanged",
    repairTex("\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}").text === "\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}" &&
      repairTex("a \\\\[2pt] b").text === "a \\\\[2pt] b" &&
      repairTex("1&0\\\\0&1").text === "1&0\\\\0&1",
  );
  ok(
    "repairTex: leaves odd run (3 backslashes) unchanged",
    repairTex("\\\\\\text{a}").text === "\\\\\\text{a}",
  );
  ok(
    "repairTex: turns quadrupled and doubled backslash into single backslash",
    repairTex("\\\\\\\\text{a}").text === "\\text{a}" &&
      repairTex("\\\\text{a}").text === "\\text{a}",
  );
  ok(
    "repairTex: leaves unknown command without brace unchanged",
    repairTex("a\\\\bc").text === "a\\\\bc",
  );

  // Check 3: Code slide with code '$x = "\\\\text"' is not touched
  const codeSlideDeck = {
    title: "Code slide untouched",
    slides: [
      {
        type: "code",
        title: "Mã nguồn",
        code: '$x = "\\\\text"',
      },
    ],
  };
  const repCode = repairDeckTex(codeSlideDeck);
  ok(
    "repairDeckTex: code slide with $x = \"\\\\text\" is not touched",
    repCode.fixes.length === 0 && codeSlideDeck.slides[0].code === '$x = "\\\\text"',
  );

  // Check 4: Lint on Python quoted files without/with trace, and predict terminal label
  const PY_LINT_DIR = join(base, "e2e", "py_lint_deck");
  mkdirSync(PY_LINT_DIR, { recursive: true });
  writeFileSync(join(PY_LINT_DIR, "agent.py"), "def solve(problem):\n    return problem * 2\n", "utf8");
  writeFileSync(join(PY_LINT_DIR, "player.html"), '<!doctype html><meta name="mira-player" content="1">', "utf8");

  r = await call("aurora_create_deck", {
    deck: {
      title: "Python Quoted",
      slides: [
        {
          type: "code",
          title: "Quoted Python",
          file: "agent.py",
          lines: "1-2",
        },
      ],
    },
    dir: PY_LINT_DIR,
    dryRun: true,
  });
  ok(
    "lint: code quoting python without trace yields mira_record note with function name",
    !r.isError && textOf(r).includes("mira_record") && textOf(r).includes("solve"),
    textOf(r).split("\n").find((l) => l.includes("mira_record")),
  );

  r = await call("aurora_create_deck", {
    deck: {
      title: "Python Quoted with Trace",
      slides: [
        {
          type: "code",
          title: "Quoted Python",
          file: "agent.py",
          lines: "1-2",
        },
        {
          type: "trace",
          title: "Trace solve",
          player: "player.html",
        },
      ],
    },
    dir: PY_LINT_DIR,
    dryRun: true,
  });
  ok(
    "lint: adding trace slide removes the mira_record note",
    !r.isError && !textOf(r).includes("mira_record"),
  );

  r = await call("aurora_create_deck", {
    deck: {
      title: "Terminal Predict",
      slides: [
        {
          type: "predict",
          title: "Chạy thử lệnh",
          filename: "terminal",
          question: "Kết quả là gì?",
          code: "python agent.py",
          output: "42",
          explain: "Chương trình in 42.",
        },
      ],
    },
    dryRun: true,
  });
  ok(
    "lint: predict slide with filename terminal does not get 'code is typed in' note",
    !r.isError && !textOf(r).includes("code is typed in"),
  );
} catch (e) {
  failed++;
  console.log(`FAIL unexpected: ${e?.stack ?? e}`);
} finally {
  await client.close();
}
console.log(failed ? `\n${failed} check(s) failed.` : "\nAll end-to-end checks passed.");
process.exit(failed ? 1 : 0);
