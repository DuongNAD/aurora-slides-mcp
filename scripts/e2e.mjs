#!/usr/bin/env node
/**
 * End-to-end test over real MCP stdio: starts dist/aurora.mjs as a server, connects the official SDK
 * client (from the C: toolchain) and exercises every tool. Test decks are written outside the project.
 *   node scripts/e2e.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

let failed = 0;
const ok = (name, cond, detail = "") => {
  if (!cond) failed++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};
const textOf = (r) => (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");

const client = new Client({ name: "aurora-e2e", version: "1.0.0" });
const transport = new StdioClientTransport({ command: process.execPath, args: [join(ROOT, "dist", "aurora.mjs")], stderr: "inherit" });
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
        { title: "Dòng điện", summary: "Electron chuyển động có hướng", icon: "ph:lightning-duotone", when: "Tuần 1 · Thứ Hai" },
        { title: "Định luật Ôm", summary: "I = U / R", theme: "ocean", when: "Tuần 1 · Thứ Tư" },
      ],
    },
    dir: COURSE,
  });
  const lessonDir = /dir: (.*01-dong-dien)/.exec(textOf(r))?.[1]?.trim();
  ok("create course", !r.isError && existsSync(join(COURSE, "index.html")) && !!lessonDir, textOf(r).split("\n")[0]);
  const courseHtml = existsSync(join(COURSE, "index.html")) ? readFileSync(join(COURSE, "index.html"), "utf8") : "";
  ok("course page shows lesson 'when' label", courseHtml.includes("c-when") && courseHtml.includes("Tuần 1 · Thứ Hai"));
  r = await call("aurora_create_deck", { deck: { title: "Dòng điện", slides: [{ type: "title", title: "Dòng điện" }, { type: "summary", title: "Ghi nhớ", items: ["Dòng điện là dòng electron"] }] }, dir: lessonDir });
  const lessonHtml = existsSync(join(lessonDir ?? "", "index.html")) ? await import("node:fs").then((m) => m.readFileSync(join(lessonDir, "index.html"), "utf8")) : "";
  ok("lesson joins the course (theme, breadcrumb, next lesson)", /lesson 1\/2/.test(textOf(r)) && lessonHtml.includes('class="crumb"') && lessonHtml.includes("Định luật Ôm") && /data-theme="aurora"/.test(lessonHtml));
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

    // 3. Create a fixture .jsonl with recall missed and complete events
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
    writeFileSync(fixFile, [JSON.stringify(ev3), JSON.stringify(ev4)].join("\n") + "\n", "utf8");

    // 4. Test aurora_progress tool on PROG_COURSE + fixture file
    r = await call("aurora_progress", { dir: PROG_COURSE, file: fixFile });
    const progSummary = textOf(r);
    ok(
      "aurora_progress summarizes accuracy, predictions, missed stations, and review schedule",
      !r.isError &&
        progSummary.includes("01-bai-1") &&
        progSummary.includes("0/1 (0%)") &&
        progSummary.includes("chosen \"1\"") &&
        progSummary.includes("correct \"2\"") &&
        progSummary.includes("0 right, 1 different") &&
        progSummary.includes("Tôi nghĩ nó in 42") &&
        progSummary.includes("Cửa chính -> Chìa khoá vàng") &&
        progSummary.includes("Completed on: 2026-10-10") &&
        progSummary.includes("+1d (2026-10-11)") &&
        progSummary.includes("+35d (2026-11-14)") &&
        progSummary.includes("polaris_progress_sync"),
      progSummary.split("\n").slice(0, 5).join(" | "),
    );
  }
} catch (e) {
  failed++;
  console.log(`FAIL unexpected: ${e?.stack ?? e}`);
} finally {
  await client.close();
}
console.log(failed ? `\n${failed} check(s) failed.` : "\nAll end-to-end checks passed.");
process.exit(failed ? 1 : 0);
