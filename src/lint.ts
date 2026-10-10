/**
 * Content lint: pedagogy and readability hints an agent can act on.
 * These never block a build; they explain how to make a deck easier to learn from.
 */
import { plain } from "./markup.js";
import { titleOf } from "./render.js";
import type { Deck, Slide } from "./schema.js";
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
    case "explode":
      return (s.image ? 2 : 1) + (s.focus === false ? 0 : s.layers.length);
    case "image":
      return s.zoom?.length ?? 0;
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

export function lintDeck(deck: Deck): string[] {
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
        break;
      case "bullets":
        if (s.items.length > 6) out.push(`${where}: ${s.items.length} bullets is a wall of text; split the slide or use bento/steps.`);
        s.items.forEach((it, k) => {
          const n = words(typeof it === "string" ? it : it.text);
          if (n > 14) out.push(`${where}: bullet ${k + 1} has ${n} words; keep the main line ≤ 12 and put the rest in "detail".`);
        });
        break;
      case "split":
        if (words(s.text) > 60) out.push(`${where}: paragraph has ${words(s.text)} words; ≤ 45 keeps the slide airy (move depth into notes).`);
        break;
      case "quote":
        if (words(s.quote) > 35) out.push(`${where}: quote has ${words(s.quote)} words; trim to the memorable part.`);
        break;
      case "code": {
        const lines = s.code.replace(/\s+$/, "").split("\n");
        const longest = Math.max(...lines.map((l) => [...l].length));
        if (lines.length > 18) out.push(`${where}: ${lines.length} lines of code; ≤ 18 stays readable. Show the essential part and link the rest.`);
        if (longest > 72) out.push(`${where}: longest code line is ${longest} chars; wrap to ≤ 60 so the font stays large.`);
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
        if (!s.solution?.length && !s.answer) out.push(`${where}: add "solution" steps or an "answer" so the learner can check their work.`);
        if (words(s.problem) > 60) out.push(`${where}: problem statement has ${words(s.problem)} words; keep it ≤ 45 or move data into code/table.`);
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
      default:
        break;
    }
  });

  // Rhythm: the same layout three times in a row feels like a document, not a keynote.
  let run = 1;
  for (let i = 1; i < deck.slides.length; i++) {
    const t = deck.slides[i]!.type;
    if (t === deck.slides[i - 1]!.type && !["quiz", "image", "section", "html", "exercise"].includes(t)) {
      run++;
      if (run === 3) out.push(`slides ${i - 1}–${i + 1}: three "${t}" slides in a row; vary layouts (statement, bento, split, image) for rhythm.`);
    } else run = 1;
  }

  const n = deck.slides.length;
  const types = new Set(deck.slides.map((s) => s.type));
  if (n >= 12 && !types.has("section")) out.push(`The deck has ${n} slides but no "section" dividers; add chapters every 4–7 slides.`);
  if (n >= 8 && !types.has("quiz") && !types.has("flashcards") && !types.has("cloze") && !types.has("exercise"))
    out.push("No active-recall slides yet; add a quiz, flashcards, cloze or exercise every 5–7 slides so the learning sticks.");
  if (n >= 10 && !types.has("notebook"))
    out.push('No "notebook" slides: after each theory block, add one page with the lines worth copying by hand (learners write theory into a notebook).');
  if (n >= 10 && !types.has("exercise")) out.push('No "exercise" slides: follow the theory with a practice section (easy → hard, with hints and worked solutions).');
  const anchorTypes = ["palace", "anchors", "analogy", "mnemonic"];
  if (n >= 10 && !deck.slides.some((s) => anchorTypes.includes(s.type)))
    out.push('No memory anchors: after the theory, tie the key ideas to something familiar with "palace" (a route through a known place), "anchors" (one vivid picture per idea), "analogy" or "mnemonic" (topic "memory").');
  const learnPalaces = deck.slides.filter((s) => s.type === "palace" && s.mode !== "recall");
  if (learnPalaces.length && !deck.slides.some((s) => s.type === "palace" && s.mode === "recall"))
    out.push(`Add a recall walk near the end: {"type": "palace", "from": "${(learnPalaces[0] as { id?: string }).id ?? "<id of the palace>"}", "mode": "recall"} (give the palace an id). Retrieval after a delay is what makes the anchors last.`);
  if (n >= 8 && deck.slides[n - 1]!.type !== "summary") out.push('End with a "summary" slide: takeaways plus the learner\'s quiz score.');
  if (n >= 3 && deck.slides[0]!.type !== "title") out.push('Start with a "title" slide so the deck has a clear opening.');
  return out;
}
