/**
 * Content lint: pedagogy and readability hints an agent can act on.
 * These never block a build; they explain how to make a deck easier to learn from.
 */
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { plain } from "./markup.js";
import { titleOf } from "./render.js";
import { detectScene, resolveDeckScene } from "./scenes.js";
import type { Course, Deck, Slide } from "./schema.js";
import { wordCount } from "./util.js";

export interface OutlineRow {
  n: number;
  id?: string;
  type: string;
  title: string;
  steps?: number;
}

/** Stations of a palace, following `from` to the palace it reuses. */
function palaceStations(deck: Deck, s: Extract<Slide, { type: "palace" }>): number {
  if (s.stations) return s.stations.length;
  const src = deck.slides.find((x) => x.type === "palace" && x.id === s.from && x !== s) as Extract<Slide, { type: "palace" }> | undefined;
  return src?.stations?.length ?? 0;
}

function stepsOf(s: Slide, deck: Deck): number {
  switch (s.type) {
    case "palace": {
      const n = palaceStations(deck, s);
      return s.mode === "recall" ? 2 * n + 1 : n + 1;
    }
    case "anchors":
      return s.items.length;
    case "analogy":
      return s.steps === false ? 0 : s.pairs.length + (s.limit ? 1 : 0);
    case "mnemonic":
      return s.steps === false ? 0 : s.items.length;
    case "bullets":
      return s.steps ? s.items.length : 0;
    case "timeline":
      return s.steps ? s.events.length : 0;
    case "steps":
    case "cycle":
      return s.steps ? s.items.length : 0;
    case "code":
      return s.steps?.length ?? 0;
    case "hotspots":
      return s.steps === false ? 0 : s.points.length;
    case "cloze":
      return (s.text.match(/\[\[[^\]]+\]\]/g) ?? []).length;
    case "notebook":
      return s.steps === false ? 0 : s.lines.length;
    case "exercise":
      return (s.hints?.length ?? 0) + (s.solution?.length ?? 0) + (s.answer ? 1 : 0);
    case "predict":
      return (s.hints?.length ?? 0) + 2;
    case "srs":
      return 1;
    case "explode":
      return (s.image ? 2 : 1) + (s.focus === false ? 0 : s.layers.length);
    case "image":
      return s.zoom?.length ?? 0;
    case "trace":
      return 0; // the Mira player holds its own steps; the slide itself has no builds
    default:
      return 0;
  }
}

export function outline(deck: Deck): OutlineRow[] {
  return deck.slides.map((s, i) => {
    const steps = stepsOf(s, deck);
    return { n: i + 1, ...(s.id ? { id: s.id } : {}), type: s.type, title: plain(titleOf(s)).slice(0, 90), ...(steps ? { steps } : {}) };
  });
}

interface PyQuote { slide: number; file: string; lines?: string; symbol?: string }

/** `Class.method` or `function` that encloses a 1-based line of Python source. */
function pySymbol(src: string, line: number): string | undefined {
  const rows = src.split(/\r?\n/);
  for (let i = Math.min(line, rows.length) - 1; i >= 0; i--) {
    const m = /^(\s*)(?:async\s+)?def\s+(\w+)/.exec(rows[i]!);
    if (!m) continue;
    const indent = m[1]!.length;
    if (indent === 0) return m[2];
    for (let j = i - 1; j >= 0; j--) {
      const c = /^(\s*)class\s+(\w+)/.exec(rows[j]!);
      if (c && c[1]!.length < indent) return `${c[2]}.${m[2]}`;
    }
    return m[2];
  }
  return undefined;
}

/** Slides that quote a Python file (code slides, predict slides, and split/exercise `code` objects with a file). */
function pythonQuotes(deck: Deck, dir?: string): PyQuote[] {
  const out: PyQuote[] = [];
  deck.slides.forEach((s, i) => {
    const spec = (s.type === "code" || s.type === "predict" ? s : (s as { code?: unknown }).code) as
      | { file?: string; lines?: string; lang?: string }
      | undefined;
    if (!spec || typeof spec !== "object" || !spec.file) return;
    if (!/\.py$/i.test(spec.file) && spec.lang !== "python") return;
    let symbol: string | undefined;
    if (dir) {
      try {
        const abs = isAbsolute(spec.file) ? spec.file : resolve(dir, spec.file);
        const first = parseInt((spec.lines ?? "").trim(), 10);
        if (first > 0 && statSync(abs).size < 1_000_000) symbol = pySymbol(readFileSync(abs, "utf8"), first);
      } catch {
        /* unreadable file: the render step already warns about it */
      }
    }
    out.push({ slide: i + 1, file: spec.file, lines: spec.lines, symbol });
  });
  return out;
}

export function lintDeck(deck: Deck, dir?: string): string[] {
  const out: string[] = [];
  const ids = new Map<string, number>();
  const at = (i: number, s: Slide) => `slide ${i + 1} (${s.type})`;
  const words = (t: string | undefined) => wordCount(t);

  deck.slides.forEach((s, i) => {
    const where = at(i, s);
    if (s.id) {
      if (ids.has(s.id)) out.push(`${where}: duplicate id "${s.id}" (also slide ${ids.get(s.id)! + 1}); deep links will be ambiguous.`);
      else ids.set(s.id, i);
    }
    const title = (s as { title?: string }).title;
    const tw = words(title);
    if ((s.type === "title" || s.type === "section") && tw > 8) out.push(`${where}: headline has ${tw} words; hero titles read best at ≤ 7.`);
    else if (tw > 12) out.push(`${where}: title has ${tw} words; aim for ≤ 10 and move the rest into subtitle or notes.`);

    switch (s.type) {
      case "statement":
        if (words(s.text) > 24) out.push(`${where}: statement has ${words(s.text)} words; one idea in ≤ 20 words lands harder.`);
        if (s.kicker && s.eyebrow) {
          out.push(`${where}: both "kicker" and "eyebrow" given; "kicker" wins.`);
        }
        break;
      case "bullets":
        if (s.items.length > 6) out.push(`${where}: ${s.items.length} bullets is a wall of text; split the slide or use bento/steps.`);
        s.items.forEach((it, k) => {
          const n = words(typeof it === "string" ? it : it.text);
          if (n > 14) out.push(`${where}: bullet ${k + 1} has ${n} words; keep the main line ≤ 12 and put the rest in "detail".`);
        });
        break;
      case "split":
        if (s.code?.filename && !s.code?.file) {
          out.push(`Slide ${i + 1} shows "${s.code.filename}" but the code is typed in; use "file" + "lines" so the slide quotes the real file verbatim.`);
        }
        if (words(s.text) > 60) out.push(`${where}: paragraph has ${words(s.text)} words; ≤ 45 keeps the slide airy (move depth into notes).`);
        break;
      case "quote":
        if (words(s.quote) > 35) out.push(`${where}: quote has ${words(s.quote)} words; trim to the memorable part.`);
        break;
      case "code": {
        if (s.filename && !s.file) {
          out.push(`Slide ${i + 1} shows "${s.filename}" but the code is typed in; use "file" + "lines" so the slide quotes the real file verbatim.`);
        }
        if (s.code) {
          const lines = s.code.replace(/\s+$/, "").split("\n");
          const longest = Math.max(...lines.map((l) => [...l].length));
          if (lines.length > 18) out.push(`${where}: ${lines.length} lines of code; ≤ 18 stays readable. Show the essential part and link the rest.`);
          if (longest > 72) out.push(`${where}: longest code line is ${longest} chars; wrap to ≤ 60 so the font stays large.`);
        }
        break;
      }
      case "bento":
        s.cards.forEach((c, k) => {
          if (words(c.text) > 22) out.push(`${where}: card ${k + 1} text has ${words(c.text)} words; cards want one short sentence.`);
        });
        break;
      case "definition":
        if (words(s.definition) > 35) out.push(`${where}: definition has ${words(s.definition)} words; ≤ 30 is easier to memorise.`);
        break;
      case "quiz":
        s.options.forEach((o, k) => {
          const n = words(typeof o === "string" ? o : o.text);
          if (n > 16) out.push(`${where}: option ${String.fromCharCode(65 + k)} has ${n} words; shorter options are fairer.`);
        });
        if (!s.explanation && !s.options.some((o) => typeof o !== "string" && o.explain))
          out.push(`${where}: add an "explanation" so a wrong answer still teaches something.`);
        break;
      case "flashcards":
        s.cards.forEach((c, k) => {
          if (words(c.back) > 30) out.push(`${where}: card ${k + 1} answer has ${words(c.back)} words; keep backs ≤ 25.`);
        });
        break;
      case "srs":
        if (words(s.back) > 40) out.push(`${where}: card answer has ${words(s.back)} words; keep backs concise (≤ 30).`);
        if (s.hook && words(s.hook) > 20) out.push(`${where}: hook has ${words(s.hook)} words; one vivid line (≤ 16) sticks better.`);
        break;
      case "cycle":
        s.items.forEach((it, k) => {
          if (words(it.title) > 5 || words(it.text) > 12) out.push(`${where}: item ${k + 1} is long; cycle labels may collide (title ≤ 4 words, text ≤ 10).`);
        });
        break;
      case "chart":
        if (!s.subtitle) out.push(`${where}: add a subtitle that states what the chart proves.`);
        break;
      case "table":
        if (s.rows.length > 6 && s.headers.length > 4) out.push(`${where}: ${s.rows.length}×${s.headers.length} table is dense; highlight one column or split it.`);
        break;
      case "image":
        if (typeof s.image !== "string" && s.image.query && !s.image.alt && !s.title) out.push(`${where}: give the image an alt text or a title for context.`);
        break;
      case "notebook":
        if (s.lines.length > 8) out.push(`${where}: ${s.lines.length} lines is a lot to copy at once; split into two notebook pages.`);
        s.lines.forEach((l, k) => {
          const n = typeof l === "string" ? words(l) : words(l.term) + words(l.def);
          if (n > 22) out.push(`${where}: line ${k + 1} has ${n} words; notebook lines should be short enough to copy in one go (≤ 18).`);
        });
        break;
      case "exercise":
        if (s.code?.filename && !s.code?.file) {
          out.push(`Slide ${i + 1} shows "${s.code.filename}" but the code is typed in; use "file" + "lines" so the slide quotes the real file verbatim.`);
        }
        if (!s.solution?.length && !s.answer) out.push(`${where}: add "solution" steps or an "answer" so the learner can check their work.`);
        if (words(s.problem) > 60) out.push(`${where}: problem statement has ${words(s.problem)} words; keep it ≤ 45 or move data into code/table.`);
        break;
      case "predict":
        if (s.filename && !s.file && !/^(terminal|console|shell|output|stdout)$/i.test(s.filename)) {
          out.push(`Slide ${i + 1} shows "${s.filename}" but the code is typed in; use "file" + "lines" so the slide quotes the real file verbatim.`);
        }
        if (s.command && /\.py\b/.test(s.command) && !deck.slides.some((x) => x.type === "trace")) {
          out.push(`${where}: the output is typed in by hand, so it is a simulation. Record the real run with Mira (mira_record { file, script: true } → mira_build → "trace" slide) or paste real stdout and say so in "source".`);
        }
        if (words(s.question) > 60) out.push(`${where}: question has ${words(s.question)} words; keep it ≤ 45 or move data into code.`);
        if (words(s.explain) > 80) out.push(`${where}: explanation has ${words(s.explain)} words; keep it concise and focused on the core mechanism.`);
        break;
      case "order":
        s.items.forEach((it, k) => {
          if (words(it) > 10) out.push(`${where}: item ${k + 1} has ${words(it)} words; sequence tiles read best at ≤ 8 words.`);
        });
        if (!s.explanation) out.push(`${where}: add an "explanation" so the sequence rationale is clear after checking.`);
        break;
      case "match":
        s.pairs.forEach((p, k) => {
          if (words(p.left) > 12) out.push(`${where}: pair ${k + 1} left has ${words(p.left)} words; keep terms concise.`);
          if (words(p.right) > 16) out.push(`${where}: pair ${k + 1} right has ${words(p.right)} words; keep matches concise.`);
        });
        if (!s.explanation) out.push(`${where}: add an "explanation" so learners understand why pairs match.`);
        break;
      case "sort":
        s.groups.forEach((g, k) => {
          if (words(g.label) > 6) out.push(`${where}: group ${k + 1} label has ${words(g.label)} words; keep category labels short.`);
          g.items.forEach((it, j) => {
            if (words(it) > 10) out.push(`${where}: group ${k + 1} item ${j + 1} has ${words(it)} words; chips read best at ≤ 8 words.`);
          });
        });
        if (!s.explanation) out.push(`${where}: add an "explanation" to explain the classification criteria.`);
        break;
      case "palace": {
        if (s.from) {
          const src = deck.slides.find((x) => x.type === "palace" && x.id === s.from && x !== s);
          if (!src) out.push(`${where}: "from": "${s.from}" does not match the id of another palace slide; give the learn palace that id.`);
        }
        const st = s.stations ?? [];
        if (st.length > 9) out.push(`${where}: ${st.length} stops is more than a learner holds in one walk; split it into two routes (≤ 9 stops each).`);
        st.forEach((x, k) => {
          if (words(x.item) > 8) out.push(`${where}: stop ${k + 1} idea has ${words(x.item)} words; a stop holds one short idea (≤ 6 words), the detail goes in "hook" or notes.`);
          if (!x.hook && s.mode !== "recall") out.push(`${where}: stop ${k + 1} has no "hook"; the vivid scene linking idea and place is what makes it stick.`);
        });
        if (s.image && st.some((x) => x.x === undefined || x.y === undefined))
          out.push(`${where}: with an image, set x/y for every stop (look at the picture, then check with aurora_screenshot {"slides": [${i + 1}], "step": 1}).`);
        break;
      }
      case "anchors":
        s.items.forEach((it, k) => {
          if (!it.hook && !s.recall) out.push(`${where}: anchor ${k + 1} has no "hook"; describe the picture in a concrete, exaggerated sentence.`);
          if (words(it.hook) > 20) out.push(`${where}: anchor ${k + 1} hook has ${words(it.hook)} words; one vivid line (≤ 16) sticks better.`);
        });
        break;
      case "analogy":
        if (!s.limit) out.push(`${where}: add a "limit" saying where the analogy breaks, so the anchor does not mislead.`);
        break;
      case "mnemonic":
        if (!s.items.some((it) => /\*\*[^*]+\*\*/.test(it.cue))) out.push(`${where}: bold the letters that carry the meaning in each cue (e.g. "Sin **đ**i **h**ọc").`);
        break;
      case "diagram": {
        const lines = s.code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("%%")).length;
        if (lines > 30) out.push(`${where}: the diagram has ${lines} lines of Mermaid; one slide reads well up to about 12 boxes. Split it or show the overview first.`);
        if ((s.text || s.items?.length) && /^\s*flowchart\s+(LR|RL)\b/.test(s.code)) out.push(`${where}: a wide LR flowchart beside a text column gets small; use flowchart TD there, or drop the text.`);
        break;
      }
      case "trace":
        // A trace shows an algorithm running; it works best once the learner has met the idea (and the code) before stepping through it.
        if (!s.caption && !deck.slides.slice(0, i).some((x) => x.type === "code" || x.type === "predict"))
          out.push(`${where}: add a "caption" saying what to predict, or teach the idea first with a "code" or "predict" slide before this trace, so the learner meets the algorithm before stepping through it.`);
        break;
      default:
        break;
    }
  });

  // Rhythm: the same layout three times in a row feels like a document, not a keynote.
  let run = 1;
  for (let i = 1; i < deck.slides.length; i++) {
    const t = deck.slides[i]!.type;
    if (t === deck.slides[i - 1]!.type && !["quiz", "image", "section", "html", "exercise", "predict", "srs", "order", "match", "sort"].includes(t)) {
      run++;
      if (run === 3) out.push(`slides ${i - 1}–${i + 1}: three "${t}" slides in a row; vary layouts (statement, bento, split, image) for rhythm.`);
    } else run = 1;
  }

  const pyQ = pythonQuotes(deck, dir);
  if (pyQ.length && !deck.slides.some((s) => s.type === "trace")) {
    const list = pyQ
      .slice(0, 4)
      .map((q) => `slide ${q.slide}${q.lines ? ` lines ${q.lines}` : ""}${q.symbol ? ` (${q.symbol})` : ""}`)
      .join("; ");
    const sym = pyQ.find((q) => q.symbol)?.symbol;
    const callEx = sym ? `${sym}(<sample input>)` : "function(<sample input>)";
    out.push(
      `Python code is quoted (${list}) but nothing runs it. Run the real file with Mira instead of leaving it as static text: ` +
        `mira_record { file, call: "<expression, e.g. ${callEx}>", focus: ["<function>"] } → ` +
        `write 3-6 stops → mira_check → mira_build, then insert the trace slide it prints right after the code slide (aurora_guide type "trace"). ` +
        `The learner predicts real values; output typed in by hand is only a simulation.`,
    );
  }

  const n = deck.slides.length;
  const srsCount = deck.slides.filter((s) => s.type === "srs").length;
  if (n > 0 && srsCount / n >= 0.8) return out;

  const types = new Set(deck.slides.map((s) => s.type));
  if (n >= 12 && !types.has("section")) out.push(`The deck has ${n} slides but no "section" dividers; add chapters every 4–7 slides.`);
  if (n >= 8 && !types.has("quiz") && !types.has("flashcards") && !types.has("cloze") && !types.has("exercise") && !types.has("predict") && !types.has("order") && !types.has("match") && !types.has("sort"))
    out.push("No active-recall slides yet; add a quiz, flashcards, cloze or exercise every 5–7 slides so the learning sticks.");
  if (n >= 10 && !types.has("notebook"))
    out.push('No "notebook" slides: after each theory block, add one page with the lines worth copying by hand (learners write theory into a notebook).');
  if (n >= 10 && !types.has("exercise") && !types.has("predict") && !types.has("order") && !types.has("match") && !types.has("sort")) out.push('No "exercise" slides: follow the theory with a practice section (easy → hard, with hints and worked solutions).');
  const anchorTypes = ["palace", "anchors", "analogy", "mnemonic"];
  if (n >= 10 && !deck.slides.some((s) => anchorTypes.includes(s.type)))
    out.push('No memory anchors: after the theory, tie the key ideas to something familiar with "palace" (a route through a known place), "anchors" (one vivid picture per idea), "analogy" or "mnemonic" (topic "memory").');
  if (n >= 12 && !types.has("palace"))
    out.push('No memory palace: turn the lesson\'s key ordered list (4-9 ideas) into a "palace" walk through a place the learner knows (aurora_guide topic "memory").');
  const learnPalaces = deck.slides.filter((s) => s.type === "palace" && s.mode !== "recall");
  if (learnPalaces.length && !deck.slides.some((s) => s.type === "palace" && s.mode === "recall"))
    out.push(`Add a recall walk near the end: {"type": "palace", "from": "${(learnPalaces[0] as { id?: string }).id ?? "<id of the palace>"}", "mode": "recall"} (give the palace an id). Retrieval after a delay is what makes the anchors last.`);
  if (n >= 12 && !types.has("palace") && !deck.slides.some((s) => s.type === "anchors" && (s as { recall?: boolean }).recall))
    out.push('No recall: end the practice with a recall walk (palace mode "recall") or anchors with recall: true.');
  const navCount = deck.slides.filter((s) => s.type === "title" || s.type === "agenda" || s.type === "section").length;
  if (n >= 10 && navCount / n > 0.25)
    out.push(`${navCount} of ${n} slides are navigation (title, agenda, section); merge sections or drop the agenda so the content gets the room.`);
  const practiceCount = deck.slides.filter((s) => s.type === "exercise" || s.type === "predict" || s.type === "order" || s.type === "match" || s.type === "sort").length;
  if (n >= 12 && practiceCount < 2)
    out.push(`Only ${practiceCount} practice slide(s): add exercises or predict slides from easy to hard (2-4 per lesson).`);
  const hasCode = deck.slides.some((s) => s.type === "code" || (s as { code?: unknown }).code || (s as { file?: unknown }).file);
  if (hasCode && !types.has("predict") && !types.has("trace") && pyQ.length === 0)
    out.push('Turn a code walk-through into a "predict" slide: the learner predicts the output, runs it, then compares (predict-then-run).');
  if (n >= 10 && !deck.slides.some((s) => !!s.source))
    out.push('No slide says where its facts come from: add "source" (e.g. "Khóa học · transcript 02:13", "Mở rộng · <source>").');
  if (n >= 8 && deck.slides[n - 1]!.type !== "summary") out.push('End with a "summary" slide: takeaways plus the learner\'s quiz score.');
  if (n >= 3 && deck.slides[0]!.type !== "title") out.push('Start with a "title" slide so the deck has a clear opening.');

  const resolved = resolveDeckScene(deck);
  if (resolved.scene === "none") {
    out.push('No scene chosen: pick a scene that matches the subject ("leaves", "quantum", "circuit"…).');
  }

  return out;
}

export function lintCourse(course: Course): string[] {
  const out: string[] = [];
  for (let i = 1; i < course.lessons.length; i++) {
    const prev = course.lessons[i - 1]!;
    const curr = course.lessons[i]!;
    const s1 = prev.scene ?? detectScene([prev.title, prev.summary].filter(Boolean).join(" "))?.scene;
    const s2 = curr.scene ?? detectScene([curr.title, curr.summary].filter(Boolean).join(" "))?.scene;
    if (s1 && s2 && s1 !== "none" && s2 !== "none" && s1 === s2) {
      out.push(`Lessons ${i} and ${i + 1} both use the "${s1}" scene; vary scenes between neighbouring lessons for visual rhythm.`);
    }
  }
  return out;
}
