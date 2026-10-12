/**
 * Deck storage: a deck is a folder with deck.json (the source the agent edits)
 * and index.html (the built, self-contained presentation). Two files only, so
 * decks stay friendly to large-cluster drives.
 */
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { LESSON_THEMES, lessonKey, renderCourse, type LessonCard } from "./course.js";
import { lintDeck, outline, type OutlineRow } from "./lint.js";
import { renderDeck, type CourseNav, type RenderResult } from "./render.js";
import { SLIDE_TYPES, THEMES, validateCourse, validateDeck, type Course, type Deck } from "./schema.js";
import { notifySmartDrive } from "./smartdrive.js";
import { errMsg, slugify } from "./util.js";

export interface DeckPaths {
  dir: string;
  json: string;
  html: string;
}

/** Fires "built" with the deck folder after every successful write (the preview server listens). */
export const builds = new EventEmitter();

export function decksRoot(): string {
  return resolve(process.env.AURORA_DECKS_DIR ?? join(process.cwd(), "slides"));
}

/** Accepts a deck folder, a path to a .json deck file, or nothing (→ ./slides/<slug-of-title>). */
export function deckPaths(target?: string, title?: string): DeckPaths {
  if (target) {
    const abs = resolve(target);
    if (extname(abs).toLowerCase() === ".json") {
      const dir = dirname(abs);
      const stem = basename(abs, extname(abs));
      return { dir, json: abs, html: join(dir, stem === "deck" ? "index.html" : `${stem}.html`) };
    }
    if (extname(abs).toLowerCase() === ".html") {
      const dir = dirname(abs);
      const stem = basename(abs, ".html");
      return { dir, json: join(dir, stem === "index" ? "deck.json" : `${stem}.json`), html: abs };
    }
    return { dir: abs, json: join(abs, "deck.json"), html: join(abs, "index.html") };
  }
  const dir = join(decksRoot(), slugify(title ?? "deck"));
  return { dir, json: join(dir, "deck.json"), html: join(dir, "index.html") };
}

/** Parses deck input that may arrive as an object or as a JSON string. */
export function coerceDeck(input: unknown): { value?: unknown; error?: string } {
  if (typeof input !== "string") return { value: input };
  try {
    return { value: JSON.parse(input.replace(/^﻿/, "")) };
  } catch (e) {
    return { error: `deck is a string but not valid JSON: ${(e as Error).message}` };
  }
}

export async function readDeckFile(p: DeckPaths): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(p.json, "utf8");
  } catch {
    throw new Error(`No deck found at ${p.json}. Create one with aurora_create_deck first (or pass the right dir).`);
  }
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch (e) {
    throw new Error(`${p.json} is not valid JSON: ${(e as Error).message}`);
  }
}

export interface BuildOutcome {
  ok: boolean;
  errors: string[];
  warnings: string[];
  lint: string[];
  paths: DeckPaths;
  deck?: Deck;
  result?: RenderResult;
  outline?: OutlineRow[];
}

/** Copies the Mira trace players a deck embeds into <deck>/assets/mira/; a file is only rewritten when its content differs. */
async function copyTracePlayers(dir: string, result: RenderResult): Promise<void> {
  for (const f of result.traceFiles) {
    const target = join(dir, f.rel);
    try {
      const have = await readFile(target).catch(() => undefined);
      if (have?.equals(f.data)) continue;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, f.data);
    } catch (e) {
      result.warnings.push(`Could not copy the Mira player to ${f.rel}: ${errMsg(e)}`);
    }
  }
}

/** Validates, renders and (unless write:false) saves deck.json + the HTML. Lessons of a course also refresh the course page. */
export async function buildDeck(
  raw: unknown,
  p: DeckPaths,
  opts: { write?: boolean; embed?: boolean; saveJson?: boolean; skipHub?: boolean } = {},
): Promise<BuildOutcome> {
  const v = validateDeck(raw);
  if (!v.ok || !v.deck) return { ok: false, errors: v.errors, warnings: [], lint: [], paths: p };
  const ctx = await courseContext(p.dir);
  if (ctx) {
    const r = raw as { theme?: unknown; accent?: unknown };
    if (r.theme === undefined) v.deck.theme = ctx.theme;
    if (r.accent === undefined && ctx.lesson.accent) v.deck.accent = ctx.lesson.accent;
  }
  const result = await renderDeck(v.deck, { dir: p.dir, embed: opts.embed, course: ctx?.nav });
  if (opts.write !== false) {
    await mkdir(p.dir, { recursive: true });
    if (opts.saveJson !== false) await writeFile(p.json, JSON.stringify(raw, null, 2) + "\n", "utf8");
    await copyTracePlayers(p.dir, result);
    await writeFile(p.html, result.html, "utf8");
    builds.emit("built", p.dir);
    notifySmartDrive(p.dir);
    if (ctx && !opts.skipHub) await buildCourseHub(ctx.ref, ctx.course).catch(() => undefined);
  }
  const extra: string[] = [];
  if (ctx) {
    extra.push(`This deck is lesson ${ctx.nav.n}/${ctx.nav.total} of the course "${ctx.course.title}" (course page: ${ctx.ref.html}).`);
    const courseDir = ctx.ref.dir;
    const subjectDir = dirname(dirname(courseDir));
    const outlinePath = join(subjectDir, "polaris", "lessons", `${basename(p.dir)}.outline.md`);
    if (existsSync(outlinePath)) {
      extra.push(`Polaris outline for this lesson: ${outlinePath} — follow it and cite its sources in \`source\`.`);
    }
  }
  return { ok: true, errors: [], warnings: [...extra, ...result.warnings], lint: lintDeck(v.deck), paths: p, deck: v.deck, result, outline: outline(v.deck) };
}

/* ───────────────────────── Courses ───────────────────────── */

export interface CoursePaths {
  dir: string;
  json: string;
  html: string;
}

export function coursePaths(target?: string, title?: string): CoursePaths {
  let dir: string;
  if (target) {
    const abs = resolve(target);
    dir = basename(abs).toLowerCase() === "course.json" ? dirname(abs) : abs;
  } else dir = join(decksRoot(), slugify(title ?? "course"));
  return { dir, json: join(dir, "course.json"), html: join(dir, "index.html") };
}

export const isCourseDir = (dir: string): boolean => existsSync(join(resolve(dir), "course.json"));

export function lessonDirs(course: Course): string[] {
  return course.lessons.map((l, i) => l.dir ?? `${String(i + 1).padStart(2, "0")}-${slugify(l.title)}`);
}

const lessonTheme = (course: Course, i: number) => course.lessons[i]?.theme ?? LESSON_THEMES[i % LESSON_THEMES.length]!;

async function readCourseFile(ref: CoursePaths): Promise<unknown | undefined> {
  try {
    return JSON.parse((await readFile(ref.json, "utf8")).replace(/^﻿/, ""));
  } catch {
    return undefined;
  }
}

/** When a deck folder sits inside a course folder and is listed in its course.json, returns the lesson context. */
async function courseContext(deckDir: string) {
  const ref = coursePaths(dirname(resolve(deckDir)));
  const raw = await readCourseFile(ref);
  if (!raw) return undefined;
  const v = validateCourse(raw);
  if (!v.ok || !v.course) return undefined;
  const course = v.course;
  const dirs = lessonDirs(course);
  const i = dirs.indexOf(basename(resolve(deckDir)));
  if (i < 0) return undefined;
  const nav: CourseNav = {
    key: lessonKey(course.title, dirs[i]!),
    title: course.title,
    hub: "../index.html",
    n: i + 1,
    total: course.lessons.length,
    next: course.lessons[i + 1] ? { title: course.lessons[i + 1]!.title, href: `../${dirs[i + 1]}/index.html` } : undefined,
    lesson: dirs[i]!,
  };
  return { ref, course, lesson: course.lessons[i]!, theme: lessonTheme(course, i), nav };
}

/** Renders the course home page from course.json plus whatever lesson decks exist. */
export async function buildCourseHub(ref: CoursePaths, course: Course): Promise<{ warnings: string[]; cards: LessonCard[] }> {
  const dirs = lessonDirs(course);
  const cards = await Promise.all(
    course.lessons.map(async (l, i): Promise<LessonCard> => {
      const dir = join(ref.dir, dirs[i]!);
      let slides: number | undefined;
      let theme = lessonTheme(course, i);
      try {
        const d = JSON.parse((await readFile(join(dir, "deck.json"), "utf8")).replace(/^﻿/, "")) as { slides?: unknown[]; theme?: string };
        slides = Array.isArray(d.slides) ? d.slides.length : undefined;
        if (d.theme && (THEMES as readonly string[]).includes(d.theme)) theme = d.theme as LessonCard["theme"];
      } catch {
        /* lesson not written yet */
      }
      const built = existsSync(join(dir, "index.html"));
      return { n: i + 1, title: l.title, summary: l.summary, icon: l.icon, theme, minutes: l.minutes, when: l.when, dir: dirs[i]!, href: built ? `${dirs[i]}/index.html` : undefined, slides, key: lessonKey(course.title, dirs[i]!) };
    }),
  );
  const { html, warnings } = await renderCourse(course, cards);
  await mkdir(ref.dir, { recursive: true });
  await writeFile(ref.html, html, "utf8");
  builds.emit("built", ref.dir);
  notifySmartDrive(ref.dir);
  return { warnings, cards };
}

export interface CourseOutcome {
  ok: boolean;
  errors: string[];
  warnings: string[];
  ref: CoursePaths;
  course?: Course;
  cards?: LessonCard[];
  rebuilt?: number;
}

/** Saves course.json (lesson folders and themes made explicit), optionally rebuilds lesson decks, then the course page. */
export async function buildCourse(raw: unknown, ref: CoursePaths, opts: { rebuildLessons?: boolean; saveJson?: boolean } = {}): Promise<CourseOutcome> {
  const first = validateCourse(raw);
  if (!first.ok || !first.course) return { ok: false, errors: first.errors, warnings: [], ref };
  const dirs = lessonDirs(first.course);
  const dup = dirs.find((d, i) => dirs.indexOf(d) !== i);
  if (dup) return { ok: false, errors: [`Two lessons use the folder "${dup}"; give them different titles or set "dir".`], warnings: [], ref };
  const normalized = structuredClone(raw) as { lessons: Array<Record<string, unknown>> };
  normalized.lessons.forEach((l, i) => {
    l.dir ??= dirs[i];
    l.theme ??= lessonTheme(first.course!, i);
  });
  const course = validateCourse(normalized).course!;
  await mkdir(ref.dir, { recursive: true });
  if (opts.saveJson !== false) await writeFile(ref.json, JSON.stringify(normalized, null, 2) + "\n", "utf8");
  const warnings: string[] = [];
  let rebuilt = 0;
  if (opts.rebuildLessons) {
    for (const d of dirs) {
      const p = deckPaths(join(ref.dir, d));
      if (!existsSync(p.json)) continue;
      const b = await buildDeck(await readDeckFile(p), p, { saveJson: false, skipHub: true });
      if (b.ok) rebuilt++;
      const waiting = b.result?.imageRequests.length ?? 0;
      if (waiting) warnings.push(`Lesson ${d}: ${waiting} picture(s) waiting for you to make; aurora_build that lesson folder lists them.`);
      if (!b.ok) warnings.push(`Lesson ${d}: ${b.errors.slice(0, 3).join("; ")}`);
    }
  }
  const hub = await buildCourseHub(ref, course);
  notifySmartDrive(ref.dir);
  return { ok: true, errors: [], warnings: [...warnings, ...hub.warnings], ref, course, cards: hub.cards, rebuilt };
}

export function summarizeCourse(o: CourseOutcome): string {
  if (!o.ok) return `Course is invalid:\n${o.errors.map((e) => `  - ${e}`).join("\n")}`;
  const c = o.course!;
  const lines = [`Course "${c.title}": ${c.lessons.length} lessons. Course page: ${o.ref.html}`, ""];
  for (const card of o.cards ?? []) {
    lines.push(
      `  ${String(card.n).padStart(2, "0")} ${card.title}  [theme ${card.theme}]${card.href ? `  built (${card.slides ?? "?"} slides)` : "  not built yet"}`,
      `     dir: ${join(o.ref.dir, card.dir)}`,
    );
  }
  if (o.rebuilt) lines.push("", `Rebuilt ${o.rebuilt} lesson deck(s).`);
  if (o.warnings.length) lines.push("", ...o.warnings.map((w) => `  - ${w}`));
  const todo = (o.cards ?? []).filter((x) => !x.href);
  if (todo.length)
    lines.push(
      "",
      `Next: build each lesson with aurora_create_deck {"deck": …, "dir": "<the lesson dir above>"} in order. Lessons inherit their theme and get` +
        " a breadcrumb, shared progress and a next-lesson button automatically.",
    );
  return lines.join("\n");
}

/* ───────────────────────── Edit operations ───────────────────────── */

export type SlideRef = number | string;
export type EditOp =
  | { op: "replace"; at: SlideRef; slide: Record<string, unknown> }
  | { op: "insert"; at?: SlideRef; slides: Array<Record<string, unknown>> }
  | { op: "delete"; at: SlideRef }
  | { op: "move"; from: SlideRef; to: number }
  | { op: "update"; at: SlideRef; set: Record<string, unknown> }
  | { op: "deck"; set: Record<string, unknown> };

type RawDeck = { slides?: Array<Record<string, unknown>>; [k: string]: unknown };

function locate(slides: Array<Record<string, unknown>>, ref: SlideRef): number {
  if (typeof ref === "number" || /^\d+$/.test(String(ref))) {
    const n = Number(ref);
    if (n < 1 || n > slides.length) throw new Error(`slide ${n} does not exist (deck has ${slides.length} slides; numbers are 1-based)`);
    return n - 1;
  }
  const i = slides.findIndex((s) => s.id === ref);
  if (i < 0) throw new Error(`no slide with id "${ref}"`);
  return i;
}

function merge(target: Record<string, unknown>, set: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(set)) {
    if (v === null) delete target[k];
    else target[k] = v;
  }
}

/** Applies edit operations to a raw deck (1-based slide numbers or slide ids). Returns a new object. */
export function applyOps(raw: unknown, ops: EditOp[]): { deck: RawDeck; errors: string[] } {
  const deck = structuredClone(raw) as RawDeck;
  if (!deck || typeof deck !== "object" || !Array.isArray(deck.slides)) return { deck, errors: ["stored deck has no slides array"] };
  const slides = deck.slides;
  const errors: string[] = [];
  ops.forEach((o, k) => {
    try {
      switch (o.op) {
        case "replace":
          slides[locate(slides, o.at)] = o.slide;
          break;
        case "insert": {
          const pos = o.at === undefined ? slides.length : locate(slides, o.at);
          slides.splice(pos, 0, ...o.slides);
          break;
        }
        case "delete":
          slides.splice(locate(slides, o.at), 1);
          break;
        case "move": {
          const from = locate(slides, o.from);
          const [s] = slides.splice(from, 1);
          const to = Math.max(0, Math.min(slides.length, o.to - 1));
          slides.splice(to, 0, s!);
          break;
        }
        case "update":
          merge(slides[locate(slides, o.at)]!, o.set);
          break;
        case "deck":
          if ("slides" in o.set) throw new Error('use insert/replace/delete for slides, not "deck"');
          merge(deck, o.set);
          break;
        default:
          throw new Error(`unknown op "${(o as { op?: string }).op}"; use replace, insert, delete, move, update or deck`);
      }
    } catch (e) {
      errors.push(`ops[${k}] (${(o as { op?: string }).op}): ${(e as Error).message}`);
    }
  });
  return { deck, errors };
}

export function summarize(b: BuildOutcome, extra: string[] = []): string {
  const lines: string[] = [];
  if (!b.ok) {
    lines.push(`Deck is invalid (${b.errors.length} problem${b.errors.length === 1 ? "" : "s"}). Fix these and call again:`);
    b.errors.forEach((e) => lines.push(`  - ${e}`));
    lines.push(`Slide types: ${SLIDE_TYPES.join(", ")}. Call aurora_guide {"type": "<type>"} for fields and an example.`);
    return lines.join("\n");
  }
  const d = b.deck!;
  const st = b.result!.stats;
  lines.push(`Built "${d.title}": ${st.slides} slides, theme ${d.theme}, ${(st.bytes / 1024).toFixed(0)} KB.`);
  lines.push(`HTML: ${b.paths.html}`);
  lines.push(`Source: ${b.paths.json}`);
  extra.forEach((l) => lines.push(l));
  lines.push("", "Outline:");
  for (const r of b.outline ?? []) lines.push(`  ${String(r.n).padStart(2)} ${r.type.padEnd(10)} ${r.title}${r.steps ? `  [${r.steps} builds]` : ""}${r.id ? `  #${r.id}` : ""}`);
  const reqs = b.result!.imageRequests;
  if (reqs.length) {
    const shape = { landscape: "landscape 16:9", portrait: "portrait 3:4", square: "square 1:1", any: "landscape 16:9" };
    lines.push(
      "",
      `Pictures for you to make (${reqs.length}). Aurora does not call image APIs (AURORA_IMAGE_PROVIDER=agent); these slides show a placeholder until you add them:`,
    );
    reqs.forEach((q, i) =>
      lines.push(`  ${i + 1}. for "${q.id}"  slide ${q.slides.join(", ")}  ${shape[q.orientation]}${q.transparent ? ", transparent background" : ""}`, `     ${q.prompt}`),
    );
    lines.push(
      `  For each one: make the picture with your own image tool (no text inside it), then aurora_add_image {"dir": ${JSON.stringify(b.paths.dir)}, "path": "<your file>", "for": "<id>"}; the deck rebuilds itself.`,
      '  No image tool? aurora_generate_image with the same prompt, orientation, transparent and dir (free Pollinations), then aurora_build; or switch the slide to an inline "svg" or a {"query"} photo.',
    );
  }
  const warn = [...b.warnings, ...b.lint];
  if (warn.length) {
    lines.push("", `Notes (${warn.length}):`);
    warn.slice(0, 30).forEach((w) => lines.push(`  - ${w}`));
    if (warn.length > 30) lines.push(`  …and ${warn.length - 30} more`);
  }
  lines.push(
    "",
    `Next: ${reqs.length ? "add the pictures above, then " : ""}aurora_screenshot to see it, aurora_audit to catch overflow, aurora_edit_deck to refine.`,
  );
  return lines.join("\n");
}
