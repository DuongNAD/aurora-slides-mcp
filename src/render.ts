/**
 * Deck → one self-contained HTML document.
 *
 * Rendering runs twice: a "collect" pass records every icon, image query and
 * code block the layouts ask for; those are resolved (network, Shiki) and the
 * "render" pass then produces the final markup. One code path decides what is
 * needed, so the two can never drift apart.
 */
import { readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { PALETTE, renderChart } from "./charts.js";
import { createMath, highlightCode, langFromExt, type CodeHtml } from "./highlight.js";
import { block, inline, plain } from "./markup.js";
import { diagramKey, mermaidCss, mermaidTheme, renderDiagrams, type DiagramJob, type DiagramOut } from "./diagrams.js";
import { findGenerated, generateCached, genKey, imageMode, placeInDeck } from "./imagegen.js";
import { iconHtml, imageKey, resolveIcons, resolveImageQueries, type IconRecord, type ImageResult, type Orientation } from "./media.js";
import type { Deck, ImageInput, Slide, SlideOf, SlideType } from "./schema.js";
import { esc, hash, PKG_ROOT, VERSION } from "./util.js";

/* ───────────────────────── Theme metadata ───────────────────────── */

export type ThemeName = Deck["theme"];
export type BgKind = "aurora" | "mesh" | "spotlight" | "grid" | "dots" | "stars" | "glow" | "plain";
export const THEME_META: Record<ThemeName, { tone: "dark" | "light"; bg: BgKind; label: string }> = {
  aurora: { tone: "dark", bg: "aurora", label: "Aurora: deep night sky with slow northern-light ribbons" },
  midnight: { tone: "dark", bg: "spotlight", label: "Midnight: pure keynote black, stage spotlight, rainbow highlight" },
  daylight: { tone: "light", bg: "mesh", label: "Daylight: apple.com light gray, crisp black type, blue accent" },
  titanium: { tone: "dark", bg: "glow", label: "Titanium: graphite and brushed metal, warm orange accent" },
  ocean: { tone: "dark", bg: "aurora", label: "Ocean: abyssal blue, cyan caustics" },
  sunset: { tone: "dark", bg: "aurora", label: "Sunset: plum dusk, amber and coral light" },
  forest: { tone: "dark", bg: "aurora", label: "Forest: moss, emerald and morning-sun haze" },
  paper: { tone: "light", bg: "plain", label: "Paper: warm off-white, ink type, quiet editorial" },
  liquid: { tone: "dark", bg: "mesh", label: "Liquid Glass: vivid wallpaper behind clear refractive glass" },
};

export const STRINGS = {
  vi: {
    prev: "Trước", next: "Tiếp", overview: "Tổng quan", notes: "Ghi chú", fullscreen: "Toàn màn hình", help: "Phím tắt",
    correct: "Chính xác!", wrong: "Chưa đúng rồi", answerIs: "Đáp án đúng", check: "Kiểm tra", flip: "Nhấn để lật",
    resume: "Tiếp tục từ slide", resumeYes: "Tiếp tục", restart: "Từ đầu", question: "Câu hỏi nhanh", agenda: "Nội dung",
    score: "Điểm của bạn", great: "Xuất sắc! Bạn nắm rất chắc.", good: "Làm tốt lắm, còn chút nữa thôi!",
    review: "Hãy ôn lại các phần chưa chắc nhé.", none: "Chưa trả lời câu hỏi nào.", photo: "Ảnh", hint: "Gợi ý",
    noNotes: "Slide này chưa có ghi chú.", line: "Dòng", output: "Kết quả", controls: "Điều khiển", open: "Mở video",
    notebook: "Ghi vào vở", practice: "Thực hành", exercise: "Bài tập", problem: "Đề bài", tryFirst: "Thử tự làm trước nhé",
    tryNext: "Nhấn → để xem gợi ý và lời giải", solution: "Lời giải", answer: "Đáp án", start: "Bắt đầu", pause: "Tạm dừng",
    timeUp: "Hết giờ", levels: ["Dễ", "Vừa", "Khó"],
    cannotQuote: "Không thể trích dẫn", lines: "dòng", all: "tất cả",
    predictPlaceholder: "Ghi dự đoán của bạn trước khi chạy…", pressToRun: "Nhấn → để chạy",
    asPredicted: "Đúng như dự đoán", different: "Lệch",
    gapLesson: "Chỗ lệch là chỗ đáng học: chép nó vào Sổ lỗi.",
    predictionsRight: "Dự đoán đúng",
    courseHome: "Trang khoá học", lesson: "Bài", nextLesson: "Bài tiếp theo", courseDone: "Bạn đã học xong khoá",
    course: "Khoá học", lessonsUnit: "bài", minutesUnit: "phút", slidesUnit: "slide", startLearning: "Bắt đầu học",
    continueAt: "Học tiếp: Bài", reviewAll: "Ôn lại từ đầu", statusDone: "Đã xong", statusDoing: "Đang học", statusNew: "Chưa học",
    statusSoon: "Sắp có", learned: "đã học", statusDue: "Đến hạn ôn", reviewToday: "Nên ôn hôm nay:",
    palace: "Cung điện ký ức", palaceRecall: "Đi lại cung điện", station: "Trạm", imagine: "Hình dung",
    walkStart: "Nhấn → hoặc cuộn để bắt đầu đi", recallIntro: "Đến mỗi trạm, nhớ lại ý đã đặt ở đó rồi nhấn → để kiểm tra",
    recallAsk: "Ở đây bạn đã đặt gì?", gotIt: "Nhớ", missed: "Chưa nhớ", walkAgain: "Nhắm mắt lại, đi một vòng trong đầu:",
    recalled: "Bạn nhớ được", stopsUnit: "trạm", reviewMissed: "Ôn lại các trạm màu cam rồi đi thêm một vòng nhé.",
    allRecalled: "Tuyệt vời, không sót trạm nào!", anchors: "Neo trí nhớ", reviewTag: "Ôn lại", analogy: "Neo vào điều đã biết",
    limit: "Chỗ không giống", mnemonic: "Mẹo nhớ", diagramFailed: "Chưa vẽ được sơ đồ", exportProgress: "Xuất tiến độ",
    srsAgain: "Quên", srsHard: "Khó", srsGood: "Nhớ", srsEasy: "Dễ", srsReview: "Đã ôn", cardsUnit: "thẻ", forgotten: "Quên",
    keys: [["→ / Space", "Tiếp theo"], ["←", "Quay lại"], ["O / Esc", "Tổng quan"], ["N", "Ghi chú"], ["F", "Toàn màn hình"], ["1–6", "Chọn đáp án"], ["1 / 2", "Đúng / Lệch (dự đoán), Nhớ / Chưa nhớ"], ["1–4", "Đánh giá thẻ (Quên / Khó / Nhớ / Dễ)"], ["T", "Bấm giờ bài tập"], ["Home / End", "Đầu / cuối"]],
  },
  en: {
    prev: "Previous", next: "Next", overview: "Overview", notes: "Notes", fullscreen: "Fullscreen", help: "Shortcuts",
    correct: "Correct!", wrong: "Not quite", answerIs: "Correct answer", check: "Check", flip: "Tap to flip",
    resume: "Resume from slide", resumeYes: "Resume", restart: "Start over", question: "Quick check", agenda: "Agenda",
    score: "Your score", great: "Excellent! You nailed it.", good: "Nice work, almost there!",
    review: "Worth reviewing the shaky parts.", none: "No questions answered yet.", photo: "Photo", hint: "Hint",
    noNotes: "No notes for this slide.", line: "Line", output: "Output", controls: "Controls", open: "Open video",
    notebook: "Write it down", practice: "Practice", exercise: "Exercise", problem: "Problem", tryFirst: "Try it yourself first",
    tryNext: "Press → for hints and the solution", solution: "Solution", answer: "Answer", start: "Start", pause: "Pause",
    timeUp: "Time's up", levels: ["Easy", "Medium", "Hard"],
    cannotQuote: "Cannot quote", lines: "lines", all: "all",
    predictPlaceholder: "Write your prediction before running…", pressToRun: "Press → to run",
    asPredicted: "As predicted", different: "Different",
    gapLesson: "The gap is the lesson: copy it into your error log.",
    predictionsRight: "Predictions right",
    courseHome: "Course home", lesson: "Lesson", nextLesson: "Next lesson", courseDone: "You finished the course",
    course: "Course", lessonsUnit: "lessons", minutesUnit: "min", slidesUnit: "slides", startLearning: "Start learning",
    continueAt: "Continue: Lesson", reviewAll: "Review from the start", statusDone: "Done", statusDoing: "In progress", statusNew: "Not started",
    statusSoon: "Coming soon", learned: "done", statusDue: "Due for review", reviewToday: "Review today:",
    palace: "Memory palace", palaceRecall: "Walk the palace again", station: "Stop", imagine: "Picture this",
    walkStart: "Press → or scroll to start walking", recallIntro: "At each stop, recall what you left there, then press → to check",
    recallAsk: "What did you leave here?", gotIt: "Got it", missed: "Missed", walkAgain: "Close your eyes and walk it once in your head:",
    recalled: "You recalled", stopsUnit: "stops", reviewMissed: "Review the orange stops, then walk it once more.",
    allRecalled: "Perfect, not a single stop missed!", anchors: "Memory anchors", reviewTag: "Review", analogy: "Anchor it to what you know",
    limit: "Where it breaks", mnemonic: "Mnemonic", diagramFailed: "Could not draw the diagram", exportProgress: "Export progress",
    srsAgain: "Again", srsHard: "Hard", srsGood: "Good", srsEasy: "Easy", srsReview: "Reviewed", cardsUnit: "cards", forgotten: "Again",
    keys: [["→ / Space", "Next"], ["←", "Back"], ["O / Esc", "Overview"], ["N", "Notes"], ["F", "Fullscreen"], ["1–6", "Answer"], ["1 / 2", "As predicted / Different, Got it / Missed"], ["1–4", "Card rating (Again / Hard / Good / Easy)"], ["T", "Exercise timer"], ["Home / End", "First / last"]],
  },
};
type Strings = (typeof STRINGS)["vi"];

/** Small stroke icons used by the chrome (HUD, marks); styled by CSS, no network needed. */
export const SVG = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/></svg>',
  notes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h8l3 3v12h-11z"/><path d="M9.5 11.5h5M9.5 15h5"/></svg>',
  full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.5a2.4 2.4 0 1 1 3.3 2.2c-.7.3-1 .8-1 1.5v.3"/><path d="M12 16.6v.1"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4 4L18.5 7.5"/></svg>',
  cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/></svg>',
  dot: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="fill" cx="12" cy="12" r="3.6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 17.5h5.6M10.2 20.5h3.6M12 3.5a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2v1.2h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3.5z"/></svg>',
  flip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 0 1 13-5.1M19.5 12a7.5 7.5 0 0 1-13 5.1"/><path d="M17.8 3.4v3.8H14M6.2 20.6v-3.8H10"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M8.5 6.2v11.6c0 .7.8 1.1 1.4.7l8.6-5.8a.85.85 0 0 0 0-1.4L9.9 5.5c-.6-.4-1.4 0-1.4.7z"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8.5 18.5z"/><path d="M13.5 7.5l3 3M4.5 19.5h6"/></svg>',
  anchor: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.2" r="2.2"/><path d="M12 7.4v13.1M8 11h8"/><path d="M4.6 13.8c.5 3.9 3.6 6.7 7.4 6.7s6.9-2.8 7.4-6.7"/><path d="M3 15.3l1.6-1.5 1.5 1.6M21 15.3l-1.6-1.5-1.5 1.6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
};

/* ───────────────────────── Context ───────────────────────── */

interface Img {
  src: string;
  alt: string;
  credit?: string;
  fit?: string;
  position?: string;
  frame?: string;
  missing?: boolean;
  key: string;
}

interface CodeFileJob {
  slideNo: number;
  file: string;
  absPath: string;
  lines?: string;
  dedent?: boolean;
  lang?: string;
  filename?: string;
}

interface CodeError {
  slideNo: number;
  file: string;
  lines?: string;
  reason: string;
  filename: string;
}

interface Ctx {
  mode: "collect" | "render";
  deck: Deck;
  dir: string;
  embed: boolean;
  t: Strings;
  magic: boolean;
  math: ReturnType<typeof createMath>;
  icons: Map<string, IconRecord>;
  images: Map<string, ImageResult>;
  code: Map<string, CodeHtml>;
  codeErrors: Map<string, CodeError>;
  codeWarnings: Map<string, string>;
  local: Map<string, string>;
  missingLocal: Set<string>;
  needIcons: Set<string>;
  needImages: Map<string, { query: string; orientation: Orientation }>;
  needCode: Map<string, { code: string; lang: string }>;
  needCodeFiles: Map<string, CodeFileJob>;
  needLocal: Map<string, boolean>;
  needGen: Map<string, { prompt: string; orientation: Orientation; transparent: boolean; slides: number[] }>;
  gen: Map<string, string>;
  genErrors: Map<string, string>;
  genWait: Set<string>;
  needDiagrams: Map<string, DiagramJob>;
  diagrams: Map<string, DiagramOut>;
  warnings: string[];
  sections: Array<{ index: number; title: string; number: string }>;
  quizTotal: number;
  predictTotal: number;
  srsTotal: number;
  quizNo: number;
  slideIndex: number;
  domId: string;
  backdrops: Map<string, string>;
  css: string[];
}

const A = (a: string, d: number, extra = ""): string => ` data-a="${a}" data-d="${Math.max(0, Math.round(d))}"${extra}`;
const wordsDur = (text: string | undefined, per = 55): number => Math.min(900, plain(text).split(/\s+/).filter(Boolean).length * per);
const inl = (c: Ctx, s: string | undefined, words = false): string => inline(s, { words, math: c.math.render });
const blk = (c: Ctx, s: string | undefined): string => block(s, { math: c.math.render });
const morph = (c: Ctx, kind: string, key: string | undefined): string =>
  c.magic && key ? ` data-m="${kind}-${hash(kind === "t" || kind === "e" ? plain(key).toLowerCase() : key, 10)}"` : "";
const slideNo = (c: Ctx): number => c.slideIndex + 1;

function warn(c: Ctx, msg: string): void {
  if (c.mode === "render" && !c.warnings.includes(msg)) c.warnings.push(msg);
}

function icon(c: Ctx, id: string | undefined, cls: string, d?: number, anim = "pop", morphable = false): string {
  if (!id) return "";
  if (c.mode === "collect") {
    c.needIcons.add(id);
    return "";
  }
  const rec = c.icons.get(id);
  if (!rec && id.includes(":")) warn(c, `Icon "${id}" not found (slide ${slideNo(c)}). Use aurora_search_icons to pick a valid id.`);
  const attrs = (d !== undefined ? A(anim, d) : "") + (morphable ? morph(c, "i", id) : "");
  return iconHtml(rec, id, cls, attrs);
}

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".avif": "image/avif", ".bmp": "image/bmp", ".ico": "image/x-icon",
};

function imgOf(c: Ctx, input: ImageInput | undefined, orientation: Orientation): Img | undefined {
  if (!input) return undefined;
  const o: { src?: string; query?: string; generate?: string; transparent?: boolean; svg?: string; alt?: string; credit?: string; fit?: string; position?: string; frame?: string } =
    typeof input === "string" ? { src: input } : input;
  const base = { alt: o.alt ?? "", credit: o.credit, fit: o.fit, position: o.position, frame: o.frame };
  if (o.svg) {
    const svg = o.svg.trim();
    if (!/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) warn(c, `Inline svg on slide ${slideNo(c)} must start with <svg …>.`);
    else if (!/xmlns=/.test(svg)) warn(c, `Inline svg on slide ${slideNo(c)} needs xmlns="http://www.w3.org/2000/svg" to display.`);
    return { ...base, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, key: `svg-${hash(svg, 10)}` };
  }
  if (o.generate) {
    const orient: Orientation = orientation === "any" ? "landscape" : orientation;
    const key = genKey(o.generate, orient, o.transparent);
    if (c.mode === "collect") {
      const job = c.needGen.get(key) ?? { prompt: o.generate, orientation: orient, transparent: !!o.transparent, slides: [] };
      if (!job.slides.includes(slideNo(c))) job.slides.push(slideNo(c));
      c.needGen.set(key, job);
      return { ...base, src: "", key };
    }
    const src = c.gen.get(key);
    if (!src && c.genWait.has(key)) return { ...base, src: "", missing: true, alt: o.alt ?? plain(o.generate).slice(0, 140), key };
    if (!src) {
      warn(c, `Could not generate the image "${o.generate.slice(0, 70)}" (slide ${slideNo(c)}): ${c.genErrors.get(key) ?? "unknown error"}`);
      return { ...base, src: "", missing: true, alt: o.alt ?? o.generate.slice(0, 120), key };
    }
    return { ...base, src, alt: o.alt ?? plain(o.generate).slice(0, 140), key };
  }
  if (o.src) {
    if (/^(https?:|data:|blob:)/i.test(o.src)) return { ...base, src: o.src, key: o.src };
    const abs = isAbsolute(o.src) ? o.src : resolve(c.dir, o.src);
    const embed = c.embed || isAbsolute(o.src);
    if (c.mode === "collect") c.needLocal.set(abs, embed || (c.needLocal.get(abs) ?? false));
    if (c.missingLocal.has(abs)) {
      warn(c, `Image file not found: "${o.src}" (slide ${slideNo(c)}). Paths are relative to the deck folder.`);
      return { ...base, src: "", missing: true, alt: o.alt || o.src, key: o.src };
    }
    const src = embed ? (c.local.get(abs) ?? o.src) : o.src.replace(/\\/g, "/");
    return { ...base, src, key: o.src };
  }
  const key = imageKey(o.query!, orientation);
  if (c.mode === "collect") {
    c.needImages.set(key, { query: o.query!, orientation });
    return { ...base, src: "", key };
  }
  const hit = c.images.get(key);
  if (!hit) {
    warn(c, `No image found for query "${o.query}" (slide ${slideNo(c)}). Try a simpler English query or set src.`);
    return { ...base, src: "", missing: true, alt: o.alt ?? o.query!, key };
  }
  return { ...base, src: hit.url, alt: o.alt ?? hit.title ?? o.query!, credit: o.credit ?? hit.credit, key: hit.url };
}

function imgTag(im: Img, cls = "", extra = ""): string {
  if (im.missing || !im.src) return `<div class="ph ${cls}" role="img" aria-label="${esc(im.alt)}"><span>${esc(im.alt)}</span></div>`;
  const style = [im.fit ? `object-fit:${im.fit}` : "", im.position ? `object-position:${im.position}` : ""].filter(Boolean).join(";");
  return `<img class="${cls}" src="${esc(im.src)}" alt="${esc(im.alt)}" decoding="async"${style ? ` style="${esc(style)}"` : ""}${extra} draggable="false">`;
}

function credit(c: Ctx, im: Img | undefined, cls = "credit"): string {
  return im?.credit ? `<figcaption class="${cls}">${esc(c.t.photo)}: ${esc(im.credit)}</figcaption>` : "";
}

function figure(c: Ctx, im: Img, frame: string, cls: string, d: number, anim = "zoom"): string {
  const f = im.frame ?? frame;
  const amb = f === "glow" && !im.missing ? imgTag(im, "amb", ' aria-hidden="true"') : "";
  const bar = f === "window" ? `<div class="win-bar"><i></i><i></i><i></i></div>` : "";
  return `<figure class="media f-${f} ${cls}"${A(anim, d)}${morph(c, "img", im.key)}>${amb}${bar}<div class="media-in">${imgTag(im, "main")}</div>${credit(c, im)}</figure>`;
}

function eyebrow(c: Ctx, text: string | undefined, d: number): string {
  return text ? `<div class="eyebrow"${morph(c, "e", text)}${A("rise", d)}>${inl(c, text)}</div>` : "";
}

function heading(c: Ctx, text: string | undefined, cls: string, d: number, tag = "h2"): string {
  return text ? `<${tag} class="${cls}"${morph(c, "t", text)} data-a="words" data-d="${d}">${inl(c, text, true)}</${tag}>` : "";
}

function lead(c: Ctx, text: string | undefined, d: number, cls = "lead"): string {
  return text ? `<p class="${cls}"${A("rise", d)}>${inl(c, text)}</p>` : "";
}

/** Eyebrow + title block; returns html and the time the next element should start. */
function head(c: Ctx, eb: string | undefined, title: string | undefined, sub?: string): { html: string; d: number } {
  let d = 0;
  let html = eyebrow(c, eb, d);
  if (eb) d += 60;
  html += heading(c, title, "h2", d);
  if (title) d += wordsDur(title) + 120;
  if (sub) {
    html += lead(c, sub, d);
    d += 160;
  }
  return { html: html ? `<header class="sl-head">${html}</header>` : "", d };
}

function fmtNum(c: Ctx, v: number, dec?: number): string {
  try {
    return new Intl.NumberFormat(c.deck.lang, { minimumFractionDigits: dec ?? 0, maximumFractionDigits: dec ?? 2 }).format(v);
  } catch {
    return String(v);
  }
}

function numSpan(c: Ctx, v: number | string, dec?: number): string {
  if (typeof v === "string") return `<span class="num">${inl(c, v)}</span>`;
  const d = dec ?? (Number.isInteger(v) ? 0 : Math.min(2, (String(v).split(".")[1] ?? "").length));
  return `<span class="num" data-count="${v}" data-dec="${d}">${esc(fmtNum(c, v, d))}</span>`;
}

function item(c: Ctx, it: string | { text: string; detail?: string; icon?: string }, attr: string): string {
  const o = typeof it === "string" ? { text: it } : it;
  return (
    `<li class="item"${attr}><span class="mk">${o.icon ? icon(c, o.icon, "it-ic") : `<i class="dot"></i>`}</span>` +
    `<div class="it-body"><div class="it-text">${inl(c, o.text)}</div>${o.detail ? `<div class="it-detail">${inl(c, o.detail)}</div>` : ""}</div></li>`
  );
}

/* ───────────────────────── Accents ───────────────────────── */

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

/** A hue-shifted partner color so gradients built from a custom accent stay harmonious. */
function partner(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((h + 32) % 360, Math.min(1, s * 1.05), Math.min(0.78, l + 0.08));
}

function accentParts(a: string | undefined): { attr: string; style: string } {
  if (!a) return { attr: "", style: "" };
  if (a.startsWith("#")) return { attr: ` data-accent="custom"`, style: `--accent:${a};--accent2:${partner(a)}` };
  return { attr: ` data-accent="${esc(a)}"`, style: "" };
}

function accentAttr(a: string | undefined): string {
  const p = accentParts(a);
  return p.attr + (p.style ? ` style="${p.style}"` : "");
}

/* ───────────────────────── Code windows ───────────────────────── */

export interface CodeSpec {
  code?: string;
  file?: string;
  lines?: string;
  dedent?: boolean;
  lang?: string;
  filename?: string;
  output?: string;
}

export interface LineRange {
  start: number;
  end: number;
}

export function parseLineRanges(spec?: string): LineRange[] | undefined {
  if (!spec || !spec.trim()) return undefined;
  const ranges: LineRange[] = [];
  for (const part of spec.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const pieces = trimmed.split("-").map((x) => parseInt(x.trim(), 10));
    if (pieces.length === 1) {
      if (isNaN(pieces[0]!)) throw new Error(`invalid line range "${trimmed}"`);
      ranges.push({ start: pieces[0]!, end: pieces[0]! });
    } else if (pieces.length === 2) {
      if (isNaN(pieces[0]!) || isNaN(pieces[1]!)) throw new Error(`invalid line range "${trimmed}"`);
      ranges.push({ start: Math.min(pieces[0]!, pieces[1]!), end: Math.max(pieces[0]!, pieces[1]!) });
    } else {
      throw new Error(`invalid line range "${trimmed}"`);
    }
  }
  return ranges.length ? ranges : undefined;
}

export function dedentLines(lines: string[]): string[] {
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^[ ]*/)?.[0].length ?? 0);
  if (!indents.length) return lines;
  const minIndent = Math.min(...indents);
  if (minIndent === 0) return lines;
  return lines.map((l) => (l.trim().length === 0 ? "" : l.slice(minIndent)));
}

export interface CutResult {
  code: string;
  lineEntries: Array<number | "gap">;
}

export function cutFileLines(
  fileContent: string,
  ranges?: LineRange[],
  dedent = true,
): CutResult {
  const fileLines = fileContent.replace(/\r\n/g, "\n").replace(/\t/g, "    ").split("\n");
  const total = fileLines.length;

  const actualRanges = ranges ?? [{ start: 1, end: total }];
  for (const r of actualRanges) {
    if (r.start < 1) throw new Error("line numbers must be >= 1");
    if (r.end > total || r.start > total) throw new Error(`range is outside file (file has ${total} lines)`);
  }

  const extractedLines: string[] = [];
  const lineEntries: Array<number | "gap"> = [];

  for (let i = 0; i < actualRanges.length; i++) {
    const r = actualRanges[i]!;
    if (i > 0 && r.start > actualRanges[i - 1]!.end + 1) {
      lineEntries.push("gap");
    }
    for (let k = r.start; k <= r.end; k++) {
      extractedLines.push(fileLines[k - 1] ?? "");
      lineEntries.push(k);
    }
  }

  const processedLines = dedent ? dedentLines(extractedLines) : extractedLines;
  return {
    code: processedLines.join("\n"),
    lineEntries,
  };
}

const codeKey = (lang: string, code: string): string => `${lang}::${hash(code, 16)}`;
function codeFileKey(abs: string, lines?: string, dedent?: boolean, lang?: string, filename?: string): string {
  return "cf::" + hash(JSON.stringify([abs, lines, dedent, lang, filename]), 12);
}

const LANG_LABEL: Record<string, string> = {
  javascript: "JavaScript", typescript: "TypeScript", python: "Python", java: "Java", cpp: "C++", c: "C", csharp: "C#",
  go: "Go", rust: "Rust", kotlin: "Kotlin", swift: "Swift", sql: "SQL", html: "HTML", css: "CSS", shellscript: "Terminal",
  json: "JSON", yaml: "YAML", php: "PHP", ruby: "Ruby", jsx: "JSX", tsx: "TSX", powershell: "PowerShell", markdown: "Markdown",
};

function expandLines(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const [a, b] = part.split("-").map((x) => parseInt(x.trim(), 10));
    if (!a) continue;
    for (let k = a; k <= (b ?? a); k++) out.add(k);
  }
  return [...out].sort((x, y) => x - y);
}

function codeWindow(
  c: Ctx,
  spec: CodeSpec,
  d: number,
  box: { w: number; h: number },
): string {
  if (spec.file) {
    const abs = isAbsolute(spec.file) ? spec.file : resolve(c.dir, spec.file);
    const key = codeFileKey(abs, spec.lines, spec.dedent, spec.lang, spec.filename);
    if (c.mode === "collect") {
      c.needCodeFiles.set(key, {
        slideNo: slideNo(c),
        file: spec.file,
        absPath: abs,
        lines: spec.lines,
        dedent: spec.dedent,
        lang: spec.lang,
        filename: spec.filename,
      });
      return "";
    }

    if (c.codeErrors.has(key)) {
      const err = c.codeErrors.get(key)!;
      const rangeStr = err.lines ? `${c.t.lines} ${err.lines}` : (c.t.all || "all");
      warn(c, `Slide ${slideNo(c)}: cannot quote ${err.file} ${rangeStr}: ${err.reason}`);
      const title = spec.filename ?? err.filename ?? basename(spec.file);
      return `<div class="window code code-err"${A("rise", d)}><div class="win-bar"><i></i><i></i><i></i><span class="win-title">${esc(title)}</span></div><div class="code-err-body"><b>${esc(c.t.cannotQuote)} ${esc(err.file)} (${esc(rangeStr)})</b><span>${esc(err.reason)}</span></div></div>`;
    }

    if (c.codeWarnings.has(key)) {
      warn(c, c.codeWarnings.get(key)!);
    }

    const h = c.code.get(key);
    if (!h) return "";
    const lang = spec.lang ?? langFromExt(spec.file);
    if (!h.known) warn(c, `Unknown code language "${lang}" on slide ${slideNo(c)}; rendered as plain text.`);
    const outLines = spec.output ? spec.output.replace(/\s+$/, "").split("\n").length + 1.6 : 0;
    const byW = (box.w - 150) / (h.longest * 0.61);
    const byH = (box.h - 140) / ((h.lines + outLines) * 1.62);
    const fs = Math.max(15, Math.min(32, Math.floor(Math.min(byW, byH))));
    if (fs === 15 && (byW < 15 || byH < 15))
      warn(c, `Code on slide ${slideNo(c)} is too long to fit comfortably (${h.lines} lines, ${h.longest} cols). Trim it or split the slide.`);
    const title = spec.filename ?? basename(spec.file);
    const out = spec.output
      ? `<div class="term"><div class="term-bar">${esc(c.t.output)}</div><pre>${esc(spec.output.replace(/\s+$/, ""))}</pre></div>`
      : "";
    return `<div class="window code"${A("rise", d)} style="--code-fs:${fs}px"><div class="win-bar"><i></i><i></i><i></i><span class="win-title">${esc(title)}</span></div><pre class="code-pre"><code>${h.html}</code></pre>${out}</div>`;
  }

  const code = spec.code ?? "";
  const lang = spec.lang ?? "text";
  const key = codeKey(lang, code);
  if (c.mode === "collect") {
    c.needCode.set(key, { code, lang });
    return "";
  }
  const h = c.code.get(key);
  if (!h) return "";
  if (!h.known) warn(c, `Unknown code language "${lang}" on slide ${slideNo(c)}; rendered as plain text.`);
  const outLines = spec.output ? spec.output.replace(/\s+$/, "").split("\n").length + 1.6 : 0;
  const byW = (box.w - 150) / (h.longest * 0.61);
  const byH = (box.h - 140) / ((h.lines + outLines) * 1.62);
  const fs = Math.max(15, Math.min(32, Math.floor(Math.min(byW, byH))));
  if (fs === 15 && (byW < 15 || byH < 15))
    warn(c, `Code on slide ${slideNo(c)} is too long to fit comfortably (${h.lines} lines, ${h.longest} cols). Trim it or split the slide.`);
  const title = spec.filename ?? LANG_LABEL[h.lang] ?? lang;
  const out = spec.output
    ? `<div class="term"><div class="term-bar">${esc(c.t.output)}</div><pre>${esc(spec.output.replace(/\s+$/, ""))}</pre></div>`
    : "";
  return `<div class="window code"${A("rise", d)} style="--code-fs:${fs}px"><div class="win-bar"><i></i><i></i><i></i><span class="win-title">${esc(title)}</span></div><pre class="code-pre"><code>${h.html}</code></pre>${out}</div>`;
}

/* ───────────────────────── Layouts ───────────────────────── */

type R = { html: string; under?: string; cls?: string };
type Layouts = { [K in SlideType]: (s: SlideOf<K>, c: Ctx) => R };

const BENTO_TEMPLATES: Record<number, string[]> = {
  2: ["lg", "lg"],
  3: ["lg", "wide", "wide"],
  4: ["lg", "wide", "sm", "sm"],
  5: ["lg", "sm", "sm", "sm", "sm"],
  6: ["wide", "sm", "sm", "sm", "sm", "wide"],
  7: ["lg", "wide", "sm", "sm", "sm", "sm", "wide"],
};
const AREA: Record<string, number> = { sm: 1, wide: 2, tall: 2, lg: 4 };
const MARK: Record<string, string> = { good: SVG.check, bad: SVG.cross, neutral: SVG.dot, accent: SVG.arrow };

const layouts: Layouts = {
  title(s, c) {
    const im = imgOf(c, s.image, "landscape");
    const align = s.align ?? (im ? "left" : "center");
    const t0 = s.icon && !im ? 260 : 0;
    const after = t0 + 120 + wordsDur(s.title) + 140;
    const text =
      `<div class="hero-text">${eyebrow(c, s.eyebrow, t0)}${heading(c, s.title, "display", t0 + 80, "h1")}` +
      `${lead(c, s.subtitle, after)}${s.meta ? `<div class="meta"${A("fade", after + 260)}>${inl(c, s.meta)}</div>` : ""}</div>`;
    let visual: string;
    if (im) visual = `<div class="hero-media" data-depth="0.35">${figure(c, im, "glow", "hero-fig", 240, "zoom")}</div>`;
    else if (s.icon) visual = `<div class="hero-icon" data-depth="0.8"><div class="halo"></div>${icon(c, s.icon, "hero-ic", 0, "pop", true)}</div>`;
    else visual = `<div class="orb" aria-hidden="true" data-depth="0.5"${A("blur", 0)}><i></i><i></i><i></i></div>`;
    const order = align === "center" ? visual + text : text + visual;
    return { cls: `align-${align} ${im ? "has-media" : s.icon ? "has-icon" : "has-orb"}`, html: `<div class="hero">${order}</div>` };
  },

  section(s, c) {
    const sec = c.sections.find((x) => x.index === c.slideIndex);
    const num = s.number !== undefined ? String(s.number) : (sec?.number ?? "");
    const im = imgOf(c, s.image, "portrait");
    const visual = im
      ? `<div class="sec-media">${figure(c, im, "rounded", "sec-fig", 220, "wipe")}</div>`
      : s.icon
        ? `<div class="sec-icon" data-depth="0.6">${icon(c, s.icon, "sec-ic", 240, "pop", true)}</div>`
        : "";
    const d = s.eyebrow ? 200 : 140;
    return {
      cls: visual ? "has-visual" : "",
      html:
        `<div class="sec">${num ? `<div class="sec-num" aria-hidden="true"${A("blur", 0)}>${esc(num)}</div>` : ""}` +
        `<div class="sec-text">${eyebrow(c, s.eyebrow, 120)}${heading(c, s.title, "display", d)}${lead(c, s.subtitle, d + wordsDur(s.title) + 140)}</div>${visual}</div>`,
    };
  },

  statement(s, c) {
    const effect = s.effect ?? "words";
    const a = effect === "spotlight" ? "spot" : effect === "fade" ? "blur" : "words";
    const d = s.kicker ? 200 : 60;
    return {
      cls: `size-${s.size ?? "lg"}`,
      html:
        `<div class="stmt-wrap">${s.kicker ? `<div class="kicker"${A("rise", 0)}>${inl(c, s.kicker)}</div>` : ""}` +
        `<p class="stmt"${morph(c, "t", s.text)} data-a="${a}" data-d="${d}">${inl(c, s.text, a !== "blur")}</p>` +
        `${s.by ? `<div class="by"${A("fade", d + wordsDur(s.text, a === "spot" ? 120 : 55) + 200)}>${inl(c, s.by)}</div>` : ""}</div>`,
    };
  },

  bullets(s, c) {
    const im = imgOf(c, s.image, "any");
    const media = im
      ? figure(c, im, "rounded", "bl-fig", 280, "wipe")
      : s.icon
        ? `<div class="bl-icon" data-depth="0.5">${icon(c, s.icon, "big-ic", 260, "pop", true)}</div>`
        : "";
    const h = head(c, s.eyebrow, s.title, s.subtitle);
    const cols = s.columns ?? (s.items.length > 5 && !media ? 2 : 1);
    const items = s.items.map((it, k) => item(c, it, s.steps ? ` data-step="${k + 1}"` : A("rise", h.d + k * 90))).join("");
    return {
      cls: `${media ? "with-media" : ""} cols-${cols}${s.steps ? " stepped" : ""}`,
      html: `<div class="bl"><div class="bl-text">${h.html}<ul class="items n-${s.items.length}">${items}</ul></div>${media ? `<div class="bl-media">${media}</div>` : ""}</div>`,
    };
  },

  split(s, c) {
    const im = imgOf(c, s.image, "any");
    const h = head(c, s.eyebrow, s.title);
    let d = h.d;
    let media = "";
    if (s.code) media = codeWindow(c, s.code, 300, { w: 860, h: 780 });
    else if (im) media = figure(c, im, "glow", "sp-fig", 260, "wipe");
    else if (s.icon) media = `<div class="sp-icon" data-depth="0.5">${icon(c, s.icon, "big-ic", 240, "pop", true)}</div>`;
    let body = "";
    if (s.text) {
      body += `<div class="body"${A("rise", d)}>${blk(c, s.text)}</div>`;
      d += 160;
    }
    if (s.items?.length) body += `<ul class="items mini">${s.items.map((it, k) => item(c, it, A("rise", d + k * 80))).join("")}</ul>`;
    return {
      cls: `side-${s.side ?? "right"}${s.code ? " has-code" : ""}${media ? "" : " no-media"}`,
      html: `<div class="split"><div class="sp-text">${h.html}${body}</div>${media ? `<div class="sp-media">${media}</div>` : ""}</div>`,
    };
  },

  image(s, c) {
    const im = imgOf(c, s.image, "landscape")!;
    const place = s.place ?? "bottom-left";
    const zooms = s.zoom ?? [];
    const overlay = s.overlay ?? (s.title || s.caption || zooms.length ? "dark" : "none");
    const cam = zooms.length ? ` data-zoom="${esc(JSON.stringify(zooms.map((z) => [z.x, z.y, z.scale ?? 2.4])))}"` : "";
    const under =
      `<figure class="fb${s.kenburns === false || zooms.length ? "" : " kb"}"${morph(c, "img", im.key)}><div class="fb-cam"${cam}>${imgTag(im, "fb-img")}</div></figure>` +
      `<div class="fb-shade ov-${overlay} place-${place}"></div>`;
    const d = 380;
    const caps = zooms
      .map(
        (z, k) =>
          `<div class="fb-zcap" data-step="${k + 1}" data-a="rise" data-d="700"><span class="fb-zn">${k + 1}/${zooms.length}</span>` +
          `${z.title ? `<b>${inl(c, z.title)}</b>` : ""}${z.text ? `<span class="fb-zt">${inl(c, z.text)}</span>` : ""}</div>`,
      )
      .join("");
    const html =
      `<div class="fb-text place-${place}">${eyebrow(c, s.eyebrow, d)}${heading(c, s.title, "display", d + 80)}` +
      `${lead(c, s.caption, d + 120 + wordsDur(s.title))}</div>${caps}${credit(c, im, "credit fb-credit")}`;
    return { under, html, cls: `ov-${overlay}${zooms.length ? " has-zoom" : ""}` };
  },

  bento(s, c) {
    const h = head(c, s.eyebrow, s.title, s.subtitle);
    const explicit = s.cards.some((k) => k.size);
    const sizes = explicit ? s.cards.map((k) => k.size ?? "sm") : (BENTO_TEMPLATES[s.cards.length] ?? s.cards.map(() => "sm"));
    const area = sizes.reduce((a, z) => a + (AREA[z] ?? 1), 0);
    const rows = Math.max(1, Math.min(3, Math.ceil(area / 4)));
    const cards = s.cards
      .map((card, k) => {
        const sz = sizes[k] ?? "sm";
        const im = imgOf(c, card.image, sz === "tall" ? "portrait" : "landscape");
        return (
          `<article class="card b-${sz}${im ? " has-img" : ""}${card.stat !== undefined ? " has-stat" : ""} tilt"${accentAttr(card.accent)}${A("tilt", h.d + k * 85)}>` +
          `${im ? `<div class="card-img">${imgTag(im, "")}</div>` : ""}<div class="card-in">` +
          `${card.icon ? icon(c, card.icon, "card-ic") : ""}${card.stat !== undefined ? `<div class="card-stat">${numSpan(c, card.stat)}</div>` : ""}` +
          `<h3 class="card-t">${inl(c, card.title)}</h3>${card.text ? `<p class="card-p">${inl(c, card.text)}</p>` : ""}</div><i class="spot" aria-hidden="true"></i></article>`
        );
      })
      .join("");
    return { html: `<div class="bento">${h.html}<div class="bento-grid rows-${rows}">${cards}</div></div>`, cls: h.html ? "" : "no-head" };
  },

  stats(s, c) {
    const h = head(c, s.eyebrow, s.title);
    const items = s.stats
      .map(
        (st, k) =>
          `<div class="st"${A("rise", h.d + k * 120)}>${st.icon ? icon(c, st.icon, "st-ic") : ""}` +
          `<div class="st-val">${st.prefix ? `<span class="st-fix">${esc(st.prefix)}</span>` : ""}${numSpan(c, st.value, st.decimals)}${st.suffix ? `<span class="st-fix">${esc(st.suffix)}</span>` : ""}</div>` +
          `<div class="st-label">${inl(c, st.label)}</div>${st.detail ? `<div class="st-detail">${inl(c, st.detail)}</div>` : ""}</div>`,
      )
      .join("");
    return {
      cls: `n-${s.stats.length}`,
      html: `<div class="stats">${h.html}<div class="st-row">${items}</div>${s.source ? `<div class="source"${A("fade", h.d + 600)}>${inl(c, s.source)}</div>` : ""}</div>`,
    };
  },

  quote(s, c) {
    const im = imgOf(c, s.image, "square");
    const d = 200 + wordsDur(s.quote, 45);
    return {
      html:
        `<figure class="qt"><div class="qt-mark" aria-hidden="true"${A("pop", 0)}>“</div>` +
        `<blockquote class="qt-text" data-a="words" data-d="120">${inl(c, s.quote, true)}</blockquote>` +
        (s.author
          ? `<figcaption class="qt-by"${A("rise", d)}>${im && !im.missing ? imgTag(im, "qt-av") : ""}<div><div class="qt-author">${inl(c, s.author)}</div>${s.role ? `<div class="qt-role">${inl(c, s.role)}</div>` : ""}</div></figcaption>`
          : "") +
        `</figure>`,
    };
  },

  code(s, c) {
    const h = head(c, s.eyebrow, s.title);
    const side = !!(s.text || s.steps?.length);
    const win = codeWindow(c, s, h.d, { w: side ? 1080 : 1640, h: h.html ? 720 : 860 });
    let sideHtml = "";
    if (s.steps?.length) {
      sideHtml = `<ol class="cw-steps">${s.steps
        .map(
          (st, k) =>
            `<li class="cw-step" data-step="${k + 1}" data-lines="${expandLines(st.lines).join(" ")}"><span class="cw-n">${k + 1}</span><div class="cw-t">${st.text ? inl(c, st.text) : `${esc(c.t.line)} ${esc(st.lines)}`}</div></li>`,
        )
        .join("")}</ol>`;
    } else if (s.text) sideHtml = `<div class="cw-text"${A("rise", h.d + 300)}>${blk(c, s.text)}</div>`;
    return {
      cls: side ? "with-side" : "",
      html: `<div class="codeslide">${h.html}<div class="cw-body">${win}${side ? `<div class="cw-side">${sideHtml}</div>` : ""}</div></div>`,
    };
  },

  timeline(s, c) {
    const h = head(c, s.eyebrow, s.title);
    const evs = s.events
      .map((ev, k) => {
        const attr = s.steps ? ` data-step="${k + 1}"` : A("rise", h.d + 250 + k * 130);
        return (
          `<li class="tl-ev"${attr}><div class="tl-when">${inl(c, ev.when)}</div><div class="tl-dot">${ev.icon ? icon(c, ev.icon, "tl-ic") : ""}</div>` +
          `<div class="tl-title">${inl(c, ev.title)}</div>${ev.text ? `<div class="tl-text">${inl(c, ev.text)}</div>` : ""}</li>`
        );
      })
      .join("");
    return {
      cls: `n-${s.events.length}${s.steps ? " stepped" : ""}`,
      html: `<div class="tl">${h.html}<div class="tl-track"><div class="tl-line"${A("hbar", h.d)}></div><ol class="tl-evs">${evs}</ol></div></div>`,
    };
  },

  steps(s, c) {
    const h = head(c, s.eyebrow, s.title);
    const items = s.items
      .map((it, k) => {
        const attr = s.steps ? ` data-step="${k + 1}"` : A("rise", h.d + k * 140);
        return (
          `<li class="pr-item"${attr}><div class="pr-badge">${it.icon ? icon(c, it.icon, "pr-ic") : `<span>${k + 1}</span>`}</div>` +
          `<div class="pr-title">${inl(c, it.title)}</div>${it.text ? `<div class="pr-text">${inl(c, it.text)}</div>` : ""}</li>`
        );
      })
      .join("");
    return { cls: `n-${s.items.length}${s.steps ? " stepped" : ""}`, html: `<div class="proc">${h.html}<ol class="pr-list">${items}</ol></div>` };
  },

  cycle(s, c) {
    const h = head(c, s.eyebrow, s.title);
    const n = s.items.length;
    const W = 1680;
    const H = h.html ? 740 : 860;
    const cx = W / 2;
    const cy = H / 2;
    // Leave room for 340px side labels and ~90px labels above/below the top and bottom nodes.
    const rx = n <= 4 ? 430 : 400;
    const ry = Math.min(H / 2 - 165, 290);
    const ang = (k: number) => -Math.PI / 2 + (2 * Math.PI * k) / n;
    const pt = (a: number): [number, number] => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
    const gap = 74 / ((rx + ry) / 2);
    const t0 = h.d + 120;
    let arcs = "";
    let nodes = "";
    for (let k = 0; k < n; k++) {
      const a = ang(k);
      const [x, y] = pt(a);
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const place = Math.abs(cs) < 0.35 ? (sn < 0 ? "top" : "bottom") : cs > 0 ? "right" : "left";
      const it = s.items[k]!;
      const nodeAt = s.steps ? ` data-step="${k + 1}" data-a="pop"` : A("pop", t0 + k * 150);
      nodes +=
        `<li class="cy-node p-${place}" style="left:${((x / W) * 100).toFixed(3)}%;top:${((y / H) * 100).toFixed(3)}%"${nodeAt}>` +
        `<div class="cy-badge">${it.icon ? icon(c, it.icon, "cy-ic") : `<span>${k + 1}</span>`}</div>` +
        `<div class="cy-label"><div class="cy-title">${inl(c, it.title)}</div>${it.text ? `<div class="cy-text">${inl(c, it.text)}</div>` : ""}</div></li>`;
      const a1 = a + gap;
      const a2 = ang(k + 1) - gap;
      const [x1, y1] = pt(a1);
      const [x2, y2] = pt(a2);
      const rot = (Math.atan2(ry * Math.cos(a2), -rx * Math.sin(a2)) * 180) / Math.PI;
      const arcStep = Math.min(k + 2, n);
      const drawAt = s.steps ? ` data-step="${arcStep}" data-a="draw" data-d="120"` : A("draw", t0 + k * 150 + 160);
      const headAt = s.steps ? ` data-step="${arcStep}" data-a="fade" data-d="560"` : A("fade", t0 + k * 150 + 640);
      arcs +=
        `<path class="cy-arc" d="M${x1.toFixed(1)},${y1.toFixed(1)} A${rx},${ry} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}" pathLength="1"${drawAt}/>` +
        `<path class="cy-head" d="M-10,-9 L2,0 L-10,9" transform="translate(${x2.toFixed(1)} ${y2.toFixed(1)}) rotate(${rot.toFixed(1)})"${headAt}/>`;
    }
    const center =
      s.center || s.centerIcon
        ? `<div class="cy-center"${A("scale", h.d)}>${s.centerIcon ? icon(c, s.centerIcon, "cy-cic", undefined, "pop", true) : ""}${s.center ? `<div class="cy-ctext">${inl(c, s.center)}</div>` : ""}</div>`
        : "";
    return {
      cls: `n-${n}${s.steps ? " stepped" : ""}`,
      html:
        `<div class="cyc">${h.html}<div class="cy-wrap" style="width:${W}px;height:${H}px">` +
        `<svg class="cy-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true"><ellipse class="cy-ring" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${A("fade", h.d)}/>${arcs}</svg>` +
        `${center}<ol class="cy-nodes">${nodes}</ol></div></div>`,
    };
  },

  compare(s, c) {
    const h = head(c, s.eyebrow, s.title);
    const n = s.columns.length;
    const cols = s.columns.map((col, k) => {
      const tone = col.tone ?? "neutral";
      const d = h.d + k * 160;
      const items = col.items
        .map((it, j) => `<li${A("rise", d + 200 + j * 70)}><i class="cmp-mk">${MARK[tone]}</i><span>${inl(c, it)}</span></li>`)
        .join("");
      return (
        `<article class="cmp-col tone-${tone}${col.highlight ? " hl" : ""}"${A("rise", d)}>` +
        `<div class="cmp-head">${col.icon ? icon(c, col.icon, "cmp-ic") : ""}<div class="cmp-hd"><h3 class="cmp-t">${inl(c, col.title)}</h3>${col.subtitle ? `<div class="cmp-sub">${inl(c, col.subtitle)}</div>` : ""}</div></div>` +
        `<ul class="cmp-list">${items}</ul></article>`
      );
    });
    const vs = s.vs && n === 2 ? `<div class="vs"${A("pop", h.d + 280)}><span>VS</span></div>` : "";
    if (s.vs && n !== 2) warn(c, `"vs" only applies to two columns (slide ${slideNo(c)}).`);
    return {
      cls: `n-${n}${vs ? " has-vs" : ""}`,
      html: `<div class="cmp">${h.html}<div class="cmp-cols">${vs ? cols[0]! + vs + cols[1]! : cols.join("")}</div></div>`,
    };
  },

  table(s, c) {
    const h = head(c, s.eyebrow, s.title);
    const ncol = s.headers.length;
    const numeric = (v: unknown): boolean =>
      typeof v === "number" || (typeof v === "string" && /^[\s+\-−~≈]?[\d.,\s]+\s?(%|‰|°C|°|×|x|k|K|M|B|tỷ|triệu|nghìn|ms|s|kg|g|m|km|cm)?$/.test(v));
    s.rows.forEach((r, i) => {
      if (r.length !== ncol) warn(c, `Table row ${i + 1} on slide ${slideNo(c)} has ${r.length} cells but there are ${ncol} headers.`);
    });
    const cell = (v: string | number | boolean | null | undefined, k: number): string => {
      const tag = k === 0 ? "th" : "td";
      const scope = k === 0 ? ' scope="row"' : "";
      const hl = s.highlight === k ? " hl" : "";
      if (v === true) return `<${tag}${scope} class="b yes${hl}">${SVG.check}</${tag}>`;
      if (v === false) return `<${tag}${scope} class="b no${hl}">${SVG.cross}</${tag}>`;
      if (v === null || v === undefined || v === "") return `<${tag}${scope} class="empty${hl}">–</${tag}>`;
      const cls = (numeric(v) ? "num" : "") + hl;
      return `<${tag}${scope}${cls ? ` class="${cls.trim()}"` : ""}>${typeof v === "number" ? esc(fmtNum(c, v)) : inl(c, String(v))}</${tag}>`;
    };
    const thead = `<thead><tr>${s.headers.map((x, k) => `<th scope="col"${s.highlight === k ? ' class="hl"' : ""}>${inl(c, x)}</th>`).join("")}</tr></thead>`;
    const rows = s.rows
      .map((r, i) => `<tr${A("rise", h.d + 180 + i * 70)}>${Array.from({ length: ncol }, (_, k) => cell(r[k], k)).join("")}</tr>`)
      .join("");
    return {
      cls: `cols-${ncol} rows-${s.rows.length}`,
      html: `<div class="tbl">${h.html}<div class="tb-wrap"${A("rise", h.d)}><table class="tb">${thead}<tbody>${rows}</tbody></table></div></div>`,
    };
  },

  quiz(s, c) {
    if (c.mode === "render") c.quizNo++;
    const opts = s.options.map((o) => (typeof o === "string" ? { text: o, correct: undefined, explain: undefined } : o));
    const correct = new Set<number>();
    if (s.answer !== undefined) (Array.isArray(s.answer) ? s.answer : [s.answer]).forEach((k) => correct.add(k));
    opts.forEach((o, k) => o.correct && correct.add(k));
    for (const k of correct) if (k >= opts.length) warn(c, `Quiz answer index ${k} is out of range on slide ${slideNo(c)} (options are 0-based).`);
    if (!correct.size) warn(c, `Quiz on slide ${slideNo(c)} has no correct answer; set "answer" (0-based) or mark an option with correct:true.`);
    const multi = correct.size > 1;
    const im = imgOf(c, s.image, "landscape");
    const media = im
      ? figure(c, im, "rounded", "qz-fig", 240, "zoom")
      : s.icon
        ? `<div class="qz-icon" data-depth="0.5">${icon(c, s.icon, "big-ic", 240, "pop", true)}</div>`
        : "";
    const eb = s.eyebrow ?? `${c.t.question}${c.quizTotal > 1 ? ` ${c.quizNo}/${c.quizTotal}` : ""}`;
    const qd = 60 + 120 + wordsDur(s.question);
    const list = opts
      .map(
        (o, k) =>
          `<li${A("rise", qd + k * 80)}><button class="qz-opt" type="button" data-k="${k}"${correct.has(k) ? ' data-ok="1"' : ""}>` +
          `<span class="qz-key">${String.fromCharCode(65 + k)}</span><span class="qz-text">${inl(c, o.text)}</span><span class="qz-mark" aria-hidden="true"></span></button>` +
          `${o.explain ? `<div class="qz-why">${inl(c, o.explain)}</div>` : ""}</li>`,
      )
      .join("");
    const foot =
      `<div class="qz-foot">${multi ? `<button class="qz-check" type="button" disabled>${esc(c.t.check)}</button>` : ""}` +
      `<div class="qz-result" role="status" aria-live="polite"></div></div>`;
    const expl = s.explanation ? `<div class="qz-expl">${blk(c, s.explanation)}</div>` : "";
    return {
      cls: `${media ? "with-media" : ""} n-${opts.length}${multi ? " multi" : ""}`,
      html:
        `<div class="quiz" data-quiz="${c.quizNo}"${multi ? ' data-multi="1"' : ""}${correct.size ? "" : ' data-poll="1"'}>` +
        `<div class="qz-main"><header class="sl-head">${eyebrow(c, eb, 0)}${heading(c, s.question, "h2 qz-q", 60)}</header>` +
        `<ol class="qz-opts">${list}</ol>${foot}${expl}</div>${media ? `<div class="qz-media">${media}</div>` : ""}</div>`,
    };
  },

  flashcards(s, c) {
    const h = head(c, s.eyebrow, s.title);
    const cards = s.cards
      .map(
        (card, k) =>
          `<button class="fcard" type="button" aria-pressed="false"${A("tilt", h.d + k * 110)}><span class="fc-in">` +
          `<span class="fc-face fc-front">${card.icon ? icon(c, card.icon, "fc-ic") : ""}<span class="fc-term">${inl(c, card.front)}</span>` +
          `${card.hint ? `<span class="fc-hint">${esc(c.t.hint)}: ${inl(c, card.hint)}</span>` : ""}<span class="fc-tap">${SVG.flip}${esc(c.t.flip)}</span></span>` +
          `<span class="fc-face fc-back"><span class="fc-ans">${inl(c, card.back)}</span></span></span></button>`,
      )
      .join("");
    return { cls: `n-${s.cards.length}`, html: `<div class="fc">${h.html}<div class="fc-grid">${cards}</div></div>` };
  },

  srs(s, c) {
    const eb = s.eyebrow ? `<div class="srs-eb"${A("rise", 0)}>${inl(c, s.eyebrow)}</div>` : "";
    const hint = s.hint
      ? `<button class="srs-hint-btn" type="button" aria-expanded="false"${A("fade", 180)}><span class="srs-hint-tag">${SVG.bulb}<span>${esc(c.t.hint)}</span></span><span class="srs-hint-text">${inl(c, s.hint)}</span></button>`
      : "";
    const origin = s.origin
      ? `<div class="srs-origin"${A("fade", 0)}>${s.origin.href ? `<a href="${esc(s.origin.href)}" target="_blank" rel="noopener">${SVG.prev}<span>${inl(c, s.origin.label)}</span></a>` : `<span>${inl(c, s.origin.label)}</span>`}</div>`
      : "";
    const hook = s.hook
      ? `<div class="srs-hook"${A("fade", 100)}><i class="srs-hook-ic">${SVG.anchor}</i><span>${inl(c, s.hook)}</span></div>`
      : "";
    const rateRow =
      `<div class="srs-rate-row"${A("rise", 140)}>` +
      `<button type="button" class="srs-r r-again" data-r="again"><kbd>1</kbd> <span>${esc(c.t.srsAgain)}</span></button>` +
      `<button type="button" class="srs-r r-hard" data-r="hard"><kbd>2</kbd> <span>${esc(c.t.srsHard)}</span></button>` +
      `<button type="button" class="srs-r r-good" data-r="good"><kbd>3</kbd> <span>${esc(c.t.srsGood)}</span></button>` +
      `<button type="button" class="srs-r r-easy" data-r="easy"><kbd>4</kbd> <span>${esc(c.t.srsEasy)}</span></button>` +
      `</div>`;

    return {
      cls: "has-srs",
      html:
        `<div class="srs" data-card="${esc(s.card)}">` +
        `<div class="srs-card" aria-pressed="false"${A("tilt", 0)}><div class="srs-in">` +
        `<div class="srs-face srs-front">${eb}<div class="srs-term">${blk(c, s.front)}</div>${hint}<div class="srs-tap">${SVG.flip}<span>${esc(c.t.flip)}</span></div></div>` +
        `<div class="srs-face srs-back">${origin}<div class="srs-ans">${blk(c, s.back)}</div>${hook}${rateRow}</div>` +
        `</div></div></div>`,
    };
  },

  cloze(s, c) {
    const h = head(c, s.eyebrow, s.title);
    const counter = { n: 0 };
    const text = block(s.text, { math: c.math.render, cloze: counter });
    if (!counter.n) warn(c, `Cloze slide ${slideNo(c)} has no [[blanks]].`);
    return {
      cls: `blanks-${counter.n}`,
      html:
        `<div class="cloze">${h.html}<div class="cz-text"${A("rise", h.d)}>${text}</div>` +
        `${s.hint ? `<div class="cz-hint"${A("fade", h.d + 320)}>${SVG.bulb}<span>${inl(c, s.hint)}</span></div>` : ""}</div>`,
    };
  },

  chart(s, c) {
    const h = head(c, s.eyebrow, s.title, s.subtitle);
    const spec = { kind: s.kind, labels: s.labels, series: s.series, unit: s.unit, max: s.max, highlight: s.highlight, lang: c.deck.lang };
    const body = renderChart(spec, `ch${c.slideIndex}`, h.d + 100);
    if ((s.kind === "donut" || s.kind === "hbar") && s.series.length > 1) warn(c, `${s.kind} charts show only the first series (slide ${slideNo(c)}).`);
    const legend =
      s.series.length > 1 && s.kind !== "donut" && s.kind !== "hbar"
        ? `<ul class="ch-legend"${A("fade", h.d)}>${s.series.map((x, i) => `<li><i style="background:${esc(x.color ?? PALETTE[i % PALETTE.length]!)}"></i>${esc(x.name ?? `#${i + 1}`)}</li>`).join("")}</ul>`
        : "";
    return {
      cls: `k-${s.kind}`,
      html: `<div class="chart">${h.html}${legend}<div class="ch-body">${body}</div>${s.note ? `<div class="source"${A("fade", h.d + 900)}>${inl(c, s.note)}</div>` : ""}</div>`,
    };
  },

  formula(s, c) {
    const h = head(c, s.eyebrow, s.title);
    const main = `<div class="fm-main"${A("blur", h.d + 60)}>${c.math.render(s.formula, true)}</div>`;
    const text = s.text ? `<p class="fm-text"${A("rise", h.d + 420)}>${inl(c, s.text)}</p>` : "";
    const legend = s.legend?.length
      ? `<dl class="fm-legend n-${s.legend.length}">${s.legend.map((l, k) => `<div class="fm-row"${A("rise", h.d + 560 + k * 90)}><dt>${c.math.render(l.symbol, false)}</dt><dd>${inl(c, l.meaning)}</dd></div>`).join("")}</dl>`
      : "";
    return { html: `<div class="formula">${h.html}${main}${text}${legend}</div>` };
  },

  definition(s, c) {
    const im = imgOf(c, s.image, "square");
    const media = im
      ? figure(c, im, "rounded", "df-fig", 300, "zoom")
      : s.icon
        ? `<div class="df-icon" data-depth="0.5">${icon(c, s.icon, "big-ic", 280, "pop", true)}</div>`
        : "";
    const d = 60 + wordsDur(s.term) + 100;
    const kind = s.kind ? `<div class="df-kind"${A("rise", 0)}>${inl(c, s.kind)}</div>` : "";
    const phon = s.phonetic ? `<div class="df-phon"${A("fade", d)}>${esc(s.phonetic)}</div>` : "";
    const def = `<p class="df-def"${A("rise", d + 120)}>${inl(c, s.definition)}</p>`;
    const ex = s.example ? `<blockquote class="df-ex"${A("rise", d + 260)}>${inl(c, s.example)}</blockquote>` : "";
    const rel = s.related?.length
      ? `<ul class="df-rel">${s.related.map((r, k) => `<li class="chip"${A("pop", d + 380 + k * 60)}>${inl(c, r)}</li>`).join("")}</ul>`
      : "";
    return {
      cls: media ? "with-media" : "",
      html: `<div class="def"><div class="df-main">${kind}${heading(c, s.term, "df-term", 60)}${phon}${def}${ex}${rel}</div>${media ? `<div class="df-media">${media}</div>` : ""}</div>`,
    };
  },

  hotspots(s, c) {
    const h = head(c, s.eyebrow, s.title);
    const im = imgOf(c, s.image, "landscape")!;
    const stepped = s.steps !== false;
    const pins = s.points
      .map((p, k) => {
        const at = stepped ? ` data-step="${k + 1}" data-a="pop"` : A("pop", h.d + 500 + k * 120);
        return `<button class="hs-pin" type="button" data-k="${k}" style="left:${p.x}%;top:${p.y}%"${at} aria-label="${esc(plain(p.label))}"><span>${k + 1}</span></button>`;
      })
      .join("");
    const list = s.points
      .map((p, k) => {
        const at = stepped ? ` data-step="${k + 1}"` : A("rise", h.d + 560 + k * 120);
        return `<li class="hs-item" data-k="${k}"${at}><span class="hs-n">${k + 1}</span><div class="hs-body"><div class="hs-label">${inl(c, p.label)}</div>${p.text ? `<div class="hs-text">${inl(c, p.text)}</div>` : ""}</div></li>`;
      })
      .join("");
    return {
      cls: `n-${s.points.length}${stepped ? " stepped" : ""}`,
      html:
        `<div class="hs">${h.html}<div class="hs-main"><figure class="hs-stage"${A("zoom", h.d)}><div class="hs-img">${imgTag(im, "")}${pins}</div>${credit(c, im)}</figure>` +
        `<ol class="hs-list">${list}</ol></div></div>`,
    };
  },

  agenda(s, c) {
    const items = s.items ?? c.sections.map((x) => x.title);
    if (!items.length) warn(c, `Agenda on slide ${slideNo(c)} has no items and the deck has no section slides.`);
    let cur = s.current;
    if (cur === undefined && !s.items) {
      const before = c.sections.filter((x) => x.index < c.slideIndex).length;
      if (before > 0 && before < c.sections.length) cur = before;
    }
    const h = head(c, s.eyebrow, s.title ?? c.t.agenda);
    const list = items
      .map((it, k) => {
        const st = k === cur ? " cur" : cur !== undefined && k < cur ? " done" : "";
        return `<li class="ag-item${st}"${A("rise", h.d + k * 80)}><span class="ag-n">${String(k + 1).padStart(2, "0")}</span><span class="ag-t">${inl(c, it)}</span></li>`;
      })
      .join("");
    return { cls: `n-${items.length}${items.length > 5 ? " two-col" : ""}`, html: `<div class="agenda">${h.html}<ol class="ag-list">${list}</ol></div>` };
  },

  summary(s, c) {
    const h = head(c, s.eyebrow, s.title);
    if (s.score && !c.quizTotal && !c.predictTotal && !c.srsTotal) warn(c, `Summary on slide ${slideNo(c)} asks for a score but the deck has no quiz, predict or srs slides.`);
    const showScore = (s.score ?? true) && (c.quizTotal > 0 || c.predictTotal > 0 || c.srsTotal > 0);
    const list = s.items
      .map((it, k) => `<li class="sm-item"${A("rise", h.d + k * 90)}><i class="sm-ck">${SVG.check}</i><span>${inl(c, it)}</span></li>`)
      .join("");
    const totalCount = c.quizTotal || c.predictTotal || c.srsTotal;
    const scoreLabel = c.quizTotal ? c.t.score : c.predictTotal ? c.t.predictionsRight : c.t.srsReview;
    const score = showScore
      ? `<div class="sm-score"${A("scale", h.d + 200)}><div class="sm-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="sm-track" cx="100" cy="100" r="84"/>` +
        `<circle class="sm-fill" cx="100" cy="100" r="84" pathLength="100"/></svg><div class="sm-num"><b class="sm-got">0</b><span>/${totalCount}</span></div></div>` +
        `<div class="sm-label">${esc(scoreLabel)}</div><div class="sm-msg">${esc(c.t.none)}</div>` +
        (c.quizTotal > 0 && c.predictTotal > 0 ? `<div class="sm-pred" hidden></div>` : "") +
        (c.srsTotal > 0 ? `<div class="sm-srs" hidden></div>` : "") +
        `</div>`
      : "";
    return {
      cls: showScore ? "with-score" : "",
      html: `<div class="summary"><div class="sm-main">${h.html}<ul class="sm-list n-${s.items.length}">${list}</ul></div>${score}</div>`,
    };
  },

  video(s, c) {
    const h = head(c, s.eyebrow, s.title);
    const yt = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(s.src);
    const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(s.src);
    const label = esc(plain(s.title) || "Video");
    let inner: string;
    if (yt) {
      const start = /[?&](?:t|start)=(\d+)/.exec(s.src)?.[1];
      inner =
        `<iframe data-src="https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&amp;modestbranding=1&amp;playsinline=1${start ? `&amp;start=${start}` : ""}" title="${label}" ` +
        `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>` +
        `<a class="vd-poster" href="https://www.youtube.com/watch?v=${yt[1]}" target="_blank" rel="noopener"><img src="${esc(s.poster ?? `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`)}" alt="" decoding="async"><span class="vd-play">${SVG.play}</span><span class="vd-open">${esc(c.t.open)}</span></a>`;
    } else if (vm) {
      inner =
        `<iframe data-src="https://player.vimeo.com/video/${vm[1]}?dnt=1" title="${label}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>` +
        `<a class="vd-poster" href="https://vimeo.com/${vm[1]}" target="_blank" rel="noopener">${s.poster ? `<img src="${esc(s.poster)}" alt="" decoding="async">` : ""}<span class="vd-play">${SVG.play}</span><span class="vd-open">${esc(c.t.open)}</span></a>`;
    } else {
      const src = /^(https?:|data:|blob:)/i.test(s.src) ? s.src : s.src.replace(/\\/g, "/");
      inner = `<video src="${esc(src)}" controls preload="metadata" playsinline${s.poster ? ` poster="${esc(s.poster)}"` : ""}></video>`;
    }
    return {
      cls: yt || vm ? "embed" : "file",
      html:
        `<div class="video">${h.html}<figure class="vd-frame"${A("zoom", h.d)}><div class="win-bar"><i></i><i></i><i></i><span class="win-title">${label}</span></div><div class="vd-ratio">${inner}</div></figure>` +
        `${s.caption ? `<p class="vd-cap"${A("fade", h.d + 300)}>${inl(c, s.caption)}</p>` : ""}</div>`,
    };
  },

  html(s, c) {
    if (s.css && c.mode === "render") c.css.push(`#${c.domId}{${s.css.replace(/<\/style/gi, "<\\/style")}}`);
    return { cls: "custom", html: `<div class="custom-in">${s.html}</div>` };
  },

  notebook(s, c) {
    const stepped = s.steps !== false;
    const lines = s.lines
      .map((ln, k) => {
        const at = stepped ? ` data-step="${k + 1}" data-a="ink"` : A("ink", 520 + k * 260);
        if (typeof ln !== "string") return `<li class="nb-l k-def"${at}><b class="nb-term">${inl(c, ln.term)}</b><span class="nb-def">${inl(c, ln.def)}</span></li>`;
        if (ln.startsWith("# ")) return `<li class="nb-l k-head"${at}>${inl(c, ln.slice(2))}</li>`;
        if (ln.startsWith("= ")) return `<li class="nb-l k-formula"${at}>${c.math.render(ln.slice(2), true)}</li>`;
        if (ln.startsWith("! ")) return `<li class="nb-l k-key"${at}><span class="nb-hl">${inl(c, ln.slice(2))}</span></li>`;
        if (ln.startsWith("@ ")) return `<li class="nb-l k-anchor"${at}><i class="nb-anc" aria-hidden="true">${SVG.anchor}</i><span>${inl(c, ln.slice(2))}</span></li>`;
        return `<li class="nb-l k-pt"${at}><i class="nb-mk" aria-hidden="true"></i><span>${inl(c, ln)}</span></li>`;
      })
      .join("");
    const tag = `<span class="nb-tag">${SVG.pencil}${inl(c, s.eyebrow ?? c.t.notebook)}</span>`;
    return {
      cls: `n-${s.lines.length}${stepped ? " stepped" : ""}`,
      html:
        `<div class="nb"><div class="nb-page"${A("rise", 0)}><div class="nb-holes" aria-hidden="true"><i></i><i></i><i></i></div>` +
        `<header class="nb-head">${tag}${s.page ? `<span class="nb-pg">${inl(c, s.page)}</span>` : ""}</header>` +
        `<h2 class="nb-title"${morph(c, "t", s.title)}${A("ink", 200)}>${inl(c, s.title)}</h2><ol class="nb-lines">${lines}</ol></div></div>`,
    };
  },

  explode(s, c) {
    const h = head(c, s.eyebrow, s.title, s.subtitle);
    const n = s.layers.length;
    const im = imgOf(c, s.image, "landscape");
    const focus = s.focus !== false;
    const stages = (im ? 2 : 1) + 1 + (focus ? n : 0);
    // Size plates so the fully exploded stack fits the scene (rotateZ 36°, rotateX 58° projection).
    const sceneH = h.html ? 700 : 860;
    const plateW = n <= 3 ? 600 : n <= 5 ? 540 : 480;
    const plateH = Math.round(plateW * 0.62);
    const isoH = (plateW * 0.588 + plateH * 0.809) * 0.53;
    const gap = Math.max(46, Math.min(150, (sceneH - 90 - isoH) / Math.max(1, n - 1) / 0.85));
    const mid = (n - 1) / 2;
    const layers = s.layers
      .map((L, i) => {
        const lim = imgOf(c, L.image, "landscape");
        const mix = Math.round(88 - (i * 64) / Math.max(1, n - 1));
        const color = L.color ?? `color-mix(in oklab, var(--accent) ${mix}%, var(--accent2))`;
        const face = lim ? imgTag(lim, "xp-img") : L.icon ? icon(c, L.icon, "xp-ic") : `<span class="xp-name">${inl(c, L.label)}</span>`;
        return `<div class="xp-layer" data-i="${i}" style="--i:${i};--off:${(mid - i).toFixed(2)};--c:${esc(color)}"><div class="xp-lift"><div class="xp-slab"></div><div class="xp-face${lim ? " has-img" : ""}">${face}</div></div></div>`;
      })
      .join("");
    const labels = s.layers
      .map((L, i) => `<li class="xp-label" data-i="${i}"><div class="xp-lt"><b>${inl(c, L.label)}</b>${L.text ? `<span>${inl(c, L.text)}</span>` : ""}</div></li>`)
      .join("");
    const lines = s.layers.map((_, i) => `<path class="xp-line" data-i="${i}" d="M0 0"/><circle class="xp-dot" data-i="${i}" r="7" cx="0" cy="0"/>`).join("");
    return {
      cls: `n-${n}${im ? " has-photo" : ""}`,
      html:
        `<div class="xp" data-stages="${stages}" data-n="${n}"${im ? ' data-photo="1"' : ""}${focus ? ' data-focus="1"' : ""} style="--pw:${plateW}px;--ph:${plateH}px;--gap:${gap.toFixed(1)}px">` +
        `${h.html}<div class="xp-scene"${A("fade", h.d)}>` +
        (im ? `<figure class="xp-photo"><div class="xp-pic">${imgTag(im, "")}${credit(c, im)}</div></figure>` : "") +
        `<div class="xp-3d"><div class="xp-stack">${layers}</div></div>` +
        `<svg class="xp-lines" aria-hidden="true">${lines}</svg><ol class="xp-labels">${labels}</ol></div></div>`,
    };
  },

  exercise(s, c) {
    const lv = s.level ? ["easy", "medium", "hard"].indexOf(s.level) : -1;
    const level = lv >= 0 ? `<span class="ex-lv lv-${lv + 1}" title="${esc(c.t.levels[lv]!)}"><i></i><i></i><i></i><span>${esc(c.t.levels[lv]!)}</span></span>` : "";
    const h = head(c, s.eyebrow ?? c.t.practice, s.title ?? c.t.exercise);
    const code = s.code ? codeWindow(c, s.code, h.d + 200, { w: 900, h: 470 }) : "";
    const hints = s.hints ?? [];
    const sol = s.solution ?? [];
    let k = 0;
    let steps = hints.map((t, i) => `<li class="ex-hint" data-step="${++k}"><i class="ex-ic">${SVG.bulb}</i><div><b>${esc(c.t.hint)} ${hints.length > 1 ? i + 1 : ""}</b>${inl(c, t)}</div></li>`).join("");
    steps += sol.map((t, i) => `<li class="ex-sol${i === 0 ? " first" : ""}" data-step="${++k}"><span class="ex-n">${i + 1}</span><div>${i === 0 ? `<b>${esc(c.t.solution)}</b>` : ""}${inl(c, t)}</div></li>`).join("");
    if (s.answer) steps += `<li class="ex-ans" data-step="${++k}" data-a="pop"><b>${esc(c.t.answer)}</b><div>${inl(c, s.answer)}</div></li>`;
    if (!k) warn(c, `Exercise on slide ${slideNo(c)} has no hints, solution or answer; learners cannot check their work.`);
    const timer = s.time
      ? `<button class="ex-timer" type="button" data-time="${s.time}" data-start="${esc(c.t.start)}" data-pause="${esc(c.t.pause)}" data-up="${esc(c.t.timeUp)}">` +
        `<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="t-track" cx="60" cy="60" r="52"/><circle class="t-fill" cx="60" cy="60" r="52" pathLength="100"/></svg>` +
        `<span class="t-num">${Math.floor(s.time / 60)}:${String(s.time % 60).padStart(2, "0")}</span><span class="t-cta">${esc(c.t.start)}</span></button>`
      : "";
    return {
      cls: `${code ? "has-code" : ""}${k ? "" : " no-steps"}`,
      html:
        `<div class="ex">${h.html.replace("</header>", `${level}</header>`)}<div class="ex-body">` +
        `<section class="ex-task"${A("rise", h.d)}><div class="ex-label">${esc(c.t.problem)}</div><div class="ex-problem">${blk(c, s.problem)}</div>${code}</section>` +
        `<div class="ex-side"><div class="ex-try"${A("fade", h.d + 300)}>${timer}<div class="ex-try-t">${esc(c.t.tryFirst)}</div>${k ? `<div class="ex-try-s">${esc(c.t.tryNext)}</div>` : ""}</div>` +
        `<ol class="ex-steps">${steps}</ol></div></div></div>`,
    };
  },

  predict(s, c) {
    const h = head(c, s.eyebrow ?? c.t.practice, s.title);
    const codeSpec = (s.code || s.file)
      ? { code: s.code, file: s.file, lines: s.lines, dedent: s.dedent, lang: s.lang, filename: s.filename }
      : undefined;
    const code = codeSpec ? codeWindow(c, codeSpec, h.d + 100, { w: 850, h: 360 }) : "";
    const hints = s.hints ?? [];
    const runStep = hints.length + 1;
    const explainStep = runStep + 1;

    const hintItems = hints.length
      ? `<ul class="pred-hints">${hints.map((t, i) => `<li class="pred-hint" data-step="${i + 1}"><i class="ex-ic">${SVG.bulb}</i><div><b>${esc(c.t.hint)} ${hints.length > 1 ? i + 1 : ""}</b>${inl(c, t)}</div></li>`).join("")}</ul>`
      : "";

    const inputArea = s.input !== false
      ? `<div class="pred-box"${A("rise", h.d + 160)}><textarea class="pred-input" placeholder="${esc(c.t.predictPlaceholder)}" aria-label="${esc(c.t.predictPlaceholder)}"></textarea></div>`
      : "";

    const cmdLine = s.command
      ? `<div class="term-cmd"><span class="term-ps">$ </span><span class="term-cmd-text">${esc(s.command)}</span></div>`
      : "";

    return {
      cls: `${code ? "has-code" : ""}`,
      html:
        `<div class="pred">${h.html}<div class="pred-body">` +
        `<section class="pred-task"${A("rise", h.d)}><div class="pred-q">${blk(c, s.question)}</div>${code}${inputArea}${hintItems}</section>` +
        `<div class="pred-side">` +
        `<div class="window pred-term" data-run-step="${runStep}"${A("rise", h.d + 80)}>` +
        `<div class="win-bar"><i></i><i></i><i></i><span class="win-title">Terminal</span></div>` +
        `<div class="term-body">` +
        `<div class="term-run-hint">${esc(c.t.pressToRun)}</div>` +
        `${cmdLine}` +
        `<pre class="term-output" data-raw="${esc(s.output)}"><code>${esc(s.output)}</code></pre>` +
        `</div></div>` +
        `<div class="pred-reveal" data-step="${explainStep}">` +
        `<div class="pred-explain card">${blk(c, s.explain)}</div>` +
        `<div class="pred-rate">` +
        `<button type="button" class="pred-r ok" data-r="1"><kbd>1</kbd> ${esc(c.t.asPredicted)}</button>` +
        `<button type="button" class="pred-r diff" data-r="0"><kbd>2</kbd> ${esc(c.t.different)}</button>` +
        `</div>` +
        `<div class="pred-gap-msg" hidden>${esc(c.t.gapLesson)}</div>` +
        `</div>` +
        `</div></div></div>`,
    };
  },

  palace(s, c) {
    // `from` reuses another palace (usually the learn walk) so a recall walk later in the deck cannot drift from it.
    const src = s.from ? c.deck.slides.find((x): x is SlideOf<"palace"> => x.type === "palace" && x.id === s.from && x !== s) : undefined;
    if (s.from && !src) warn(c, `Palace on slide ${slideNo(c)}: there is no palace slide with id "${s.from}" to reuse.`);
    const stations = s.stations ?? src?.stations ?? [];
    const recall = s.mode === "recall";
    const input = s.image ?? src?.image;
    const im = imgOf(c, input, "landscape");
    const n = stations.length;
    if (im && stations.some((st) => st.x === undefined || st.y === undefined))
      warn(c, `Palace on slide ${slideNo(c)} has an image: give every station x/y (% of the image) so the markers sit on the right spots.`);
    const pts = layoutStations(stations);
    const zoom = s.zoom ?? src?.zoom ?? (im ? 2 : 1.6);
    const ar = svgRatio(input) ?? 16 / 9;
    const h = head(c, s.eyebrow ?? (recall ? c.t.reviewTag : c.t.palace), s.title ?? (recall ? c.t.palaceRecall : src?.title), s.subtitle);
    const hint = `<p class="pl-hint"${A("fade", h.d + 260)}>${SVG.next}<span>${esc(recall ? c.t.recallIntro : c.t.walkStart)}</span></p>`;
    const pid = s.from ?? s.id ?? String(slideNo(c));
    const pins = stations
      .map((st, k) => {
        const [x, y] = pts[k]!;
        // A recall walk shows numbers only: an icon on the map would give the idea away.
        const mark = st.icon && !recall ? icon(c, st.icon, "pl-ic") : `<b>${k + 1}</b>`;
        return (
          `<li class="pl-pin${x > 76 ? " tag-l" : ""}" data-k="${k}" data-place="${esc(plain(st.place))}" data-item="${esc(plain(st.item))}" data-x="${x.toFixed(2)}" data-y="${y.toFixed(2)}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%">` +
          `<span class="pl-dot">${mark}</span><span class="pl-tag"><span class="pl-tp">${inl(c, st.place)}</span><span class="pl-ti">${inl(c, st.item)}</span></span></li>`
        );
      })
      .join("");
    const cards = stations
      .map((st, k) => {
        const pim = imgOf(c, st.image, "landscape");
        const pic = pim ? `<figure class="pl-pic">${imgTag(pim, "")}</figure>` : "";
        const ic = !pim && st.icon ? `<span class="pl-cic">${icon(c, st.icon, "pl-cic-i")}</span>` : "";
        const place = `<div class="pl-place"><span class="pl-no">${esc(c.t.station)} ${k + 1}/${n}</span><span class="pl-pn">${SVG.pin}<span>${inl(c, st.place)}</span></span></div>`;
        const item = `<div class="pl-item">${ic}<span class="pl-it">${inl(c, st.item)}</span></div>`;
        const hook = st.hook ? `<p class="pl-hook"><b>${esc(c.t.imagine)}</b>${inl(c, st.hook)}</p>` : "";
        if (!recall) return `<li class="pl-card" data-k="${k}" data-place="${esc(plain(st.place))}" data-item="${esc(plain(st.item))}">${pic}${place}${item}${hook}</li>`;
        const rate =
          `<div class="pl-rate"><button type="button" class="pl-r ok" data-r="1"><kbd>1</kbd>${esc(c.t.gotIt)}</button>` +
          `<button type="button" class="pl-r miss" data-r="0"><kbd>2</kbd>${esc(c.t.missed)}</button></div>`;
        return (
          `<li class="pl-card recall" data-k="${k}" data-place="${esc(plain(st.place))}" data-item="${esc(plain(st.item))}">${place}<div class="pl-ask"><span class="pl-q">?</span><span>${esc(c.t.recallAsk)}</span></div>` +
          `<div class="pl-ans">${pic}${item}${hook}${rate}</div></li>`
        );
      })
      .join("");
    const names = stations.map((st) => plain(st.place));
    const route = names.join(" → ").length <= 96 ? names.join(" → ") : `${names[0]} → … → ${names[n - 1]}`;
    const end = recall
      ? `<div class="pl-end recall" data-got="${esc(c.t.recalled)}" data-unit="${esc(c.t.stopsUnit)}" data-all="${esc(c.t.allRecalled)}" data-miss="${esc(c.t.reviewMissed)}">` +
        `<b class="pl-score"></b><span class="pl-msg">${esc(c.t.walkAgain)} <b>${esc(route)}</b></span></div>`
      : `<div class="pl-end"><span class="pl-msg">${esc(c.t.walkAgain)} <b>${esc(route)}</b></span></div>`;
    const world = im ? imgTag(im, "pl-img") : `<div class="pl-map" aria-hidden="true"></div>`;
    const under =
      `<div class="pl-view${im ? " has-img" : ""}"${svgRatio(input) ? ' data-fixed="1"' : ""} style="--ar:${ar.toFixed(4)}"${A("fade", 0)}><div class="pl-world">${world}` +
      `<svg class="pl-route" aria-hidden="true"></svg><ol class="pl-pins">${pins}</ol></div></div><div class="pl-shade"></div>`;
    return {
      cls: `${recall ? "pl-recall" : "pl-learn"}${im ? " has-img" : " no-img"}`,
      under,
      html:
        `<div class="pl" data-mode="${recall ? "recall" : "learn"}" data-palace="${esc(pid)}" data-n="${n}" data-z="${zoom}" data-stages="${recall ? 2 * n + 2 : n + 2}" data-at="intro">` +
        `${h.html.replace("</header>", `${hint}</header>`)}<ol class="pl-cards">${cards}</ol>${end}` +
        `<svg class="pl-lead" viewBox="0 0 1920 1080" aria-hidden="true"><path d="M0 0"/><circle r="7" cx="0" cy="0"/></svg></div>`,
    };
  },

  anchors(s, c) {
    const h = head(c, s.eyebrow ?? (s.recall ? c.t.reviewTag : c.t.anchors), s.title);
    const n = s.items.length;
    const cards = s.items
      .map((it, k) => {
        const im = imgOf(c, it.image, n > 4 ? "square" : "landscape");
        const pic = im
          ? `<figure class="an-pic">${imgTag(im, "")}</figure>`
          : `<figure class="an-pic an-art">${it.icon ? icon(c, it.icon, "an-ic") : `<span class="an-k">${k + 1}</span>`}</figure>`;
        const term = `<div class="an-term">${inl(c, it.term)}</div>`;
        const hook = it.hook ? `<p class="an-hook">${inl(c, it.hook)}</p>` : "";
        const mean = it.meaning ? `<p class="an-mean">${inl(c, it.meaning)}</p>` : "";
        if (!s.recall) return `<li class="an-card" data-step="${k + 1}" data-a="rise">${pic}<div class="an-body">${term}${hook}${mean}</div></li>`;
        return (
          `<li class="an-card"${A("rise", h.d + k * 110)}>${pic}<div class="an-body"><div class="an-slot"><span class="an-q" aria-hidden="true">?</span>` +
          `<div class="an-ans" data-step="${k + 1}" data-a="blur">${term}${mean}</div></div>${hook}</div></li>`
        );
      })
      .join("");
    return {
      cls: `n-${n}${s.recall ? " recall" : ""}`,
      html: `<div class="an">${h.html}<ol class="an-list">${cards}</ol></div>`,
    };
  },

  analogy(s, c) {
    const h = head(c, s.eyebrow ?? c.t.analogy, s.title);
    const stepped = s.steps !== false;
    const side = (o: { label: string; icon?: string; image?: ImageInput }, cls: string, d: number): string => {
      const im = imgOf(c, o.image, "square");
      const vis = im ? `<span class="ay-pic">${imgTag(im, "")}</span>` : o.icon ? `<span class="ay-art">${icon(c, o.icon, "ay-ic")}</span>` : "";
      return `<div class="ay-side ${cls}"${A("rise", d)}>${vis}<h3 class="ay-label">${inl(c, o.label)}</h3></div>`;
    };
    const top = `<div class="ay-top">${side(s.known, "ay-k", h.d)}<div class="ay-eq"${A("pop", h.d + 160)}>≈</div>${side(s.concept, "ay-c", h.d + 240)}</div>`;
    const d0 = h.d + 520;
    const pairs = s.pairs
      .map((p, k) => {
        const at = stepped ? ` data-step="${k + 1}"` : A("rise", d0 + k * 130);
        return (
          `<li class="ay-pair"${at}><span class="ay-a">${inl(c, p.known)}</span><span class="ay-link" aria-hidden="true"><i></i><b></b><i></i></span>` +
          `<span class="ay-b">${inl(c, p.concept)}</span>${p.note ? `<span class="ay-note">${inl(c, p.note)}</span>` : ""}</li>`
        );
      })
      .join("");
    const lat = stepped ? ` data-step="${s.pairs.length + 1}"` : A("fade", d0 + s.pairs.length * 130 + 200);
    const limit = s.limit ? `<div class="ay-limit"${lat}><b>${esc(c.t.limit)}</b><span>${inl(c, s.limit)}</span></div>` : "";
    return {
      cls: `n-${s.pairs.length}${stepped ? " stepped" : ""}${s.limit ? " has-limit" : ""}`,
      html: `<div class="ay">${h.html}${top}<ol class="ay-pairs">${pairs}</ol>${limit}</div>`,
    };
  },

  mnemonic(s, c) {
    const h = head(c, s.eyebrow ?? c.t.mnemonic, s.title);
    const stepped = s.steps !== false;
    const phrase = s.phrase ? `<p class="mn-phrase"${A("blur", h.d)}>${inl(c, s.phrase)}</p>` : "";
    const d0 = h.d + (s.phrase ? 420 : 0);
    const short = s.items.every((it) => plain(it.cue).length <= 3);
    // Size the cue column to the longest cue so arrows line up and the decoded text gets the room.
    const longest = Math.max(...s.items.map((it) => [...plain(it.cue)].length));
    const fs = short ? 84 : s.items.length <= 3 ? 54 : s.items.length === 4 ? 42 : 36;
    const cue = Math.round(Math.min(640, Math.max(short ? 110 : 150, longest * fs * 0.6 + 30)));
    const rows = s.items
      .map((it, k) => {
        const at = stepped ? ` data-step="${k + 1}"` : A("rise", d0 + k * 110);
        return `<li class="mn-row"${at}><span class="mn-cue">${inl(c, it.cue)}</span><i class="mn-arrow">${SVG.arrow}</i><span class="mn-text">${inl(c, it.text)}</span></li>`;
      })
      .join("");
    return {
      cls: `n-${s.items.length}${short ? " short" : ""}${stepped ? " stepped" : ""}${s.phrase ? " has-phrase" : ""}`,
      html: `<div class="mn" style="--cue:${cue}px">${h.html}${phrase}<ol class="mn-rows">${rows}</ol></div>`,
    };
  },

  diagram(s, c) {
    const h = head(c, s.eyebrow, s.title, s.subtitle);
    const theme = s.theme ?? c.deck.theme;
    const job = {
      code: s.code.replace(/\r\n/g, "\n").trim(),
      vars: mermaidTheme(theme, s.accent ?? (s.theme ? undefined : c.deck.accent), c.deck.font, partner),
      css: mermaidCss(theme),
      look: s.look ?? "classic",
    };
    const key = diagramKey(job);
    if (c.mode === "collect") c.needDiagrams.set(key, { key, ...job });
    const out = c.diagrams.get(key);
    const cap = s.caption ? `<figcaption class="dg-cap">${inl(c, s.caption)}</figcaption>` : "";
    let fig: string;
    if (out?.svg) {
      fig = `<figure class="dg-fig"${A("fade", h.d)}><div class="dg-svg${s.steps ? " stepped" : ""}" style="--dw:${out.w}px;--dh:${out.h}px">${out.svg}</div>${cap}</figure>`;
    } else {
      const err = (out?.error ?? "").trim();
      if (c.mode === "render") warn(c, `Diagram on slide ${slideNo(c)} was not drawn: ${err.split("\n").slice(0, 4).join(" | ") || "unknown error"}`);
      fig = `<figure class="dg-fig dg-failed"${A("fade", h.d)}><div class="dg-err"><b>${esc(c.t.diagramFailed)}</b><span>${esc(err.split("\n")[0] ?? "")}</span><pre>${esc(job.code)}</pre></div>${cap}</figure>`;
    }
    let side = "";
    if (s.text || s.items?.length) {
      let d = h.d + 200;
      if (s.text) {
        side += `<div class="body"${A("rise", d)}>${blk(c, s.text)}</div>`;
        d += 160;
      }
      if (s.items?.length) side += `<ul class="items mini">${s.items.map((it, k) => item(c, it, A("rise", d + k * 80))).join("")}</ul>`;
    }
    return {
      cls: `${side ? `with-side side-${s.side ?? "left"}` : ""}${s.steps ? " stepped" : ""}`,
      html: `<div class="dg">${h.html}<div class="dg-body">${side ? `<div class="dg-side">${side}</div>` : ""}${fig}</div></div>`,
    };
  },
};

/** Station positions in % of the palace picture; stations without x/y follow a winding route on the right of the map (the title sits on the left). */
function layoutStations(st: Array<{ x?: number; y?: number }>): Array<[number, number]> {
  const n = st.length;
  const rows = Math.max(1, Math.ceil(n / 3));
  const auto: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    const r = Math.floor(k / 3);
    const j = k % 3;
    const slot = r % 2 === 0 ? j : 2 - j;
    const x = n <= 3 ? 50 + (n === 1 ? 16 : (36 * k) / (n - 1)) : 49 + slot * 18;
    const y = rows === 1 ? 48 + (k % 2 ? 9 : -9) : 19 + (54 * r) / (rows - 1) + (slot === 1 ? 4 : 0);
    auto.push([x, y]);
  }
  return st.map((s, k) => [s.x ?? auto[k]![0], s.y ?? auto[k]![1]]);
}

/** Aspect ratio of an inline SVG image (its viewBox or width/height), so markers line up before any image loads. */
function svgRatio(input: ImageInput | undefined): number | undefined {
  const svg = input && typeof input !== "string" ? input.svg : undefined;
  if (!svg) return undefined;
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
  const w = vb ? +vb[1]! : +(/\swidth\s*=\s*["']([\d.]+)/i.exec(svg)?.[1] ?? 0);
  const h = vb ? +vb[2]! : +(/\sheight\s*=\s*["']([\d.]+)/i.exec(svg)?.[1] ?? 0);
  return w > 0 && h > 0 ? w / h : undefined;
}

/* ───────────────────────── Backdrops ───────────────────────── */

export const BD_LAYERS: Record<BgKind, string> = {
  aurora: `<i class="rb r1"></i><i class="rb r2"></i><i class="rb r3"></i><i class="rb r4"></i><i class="stars"></i>`,
  mesh: `<i class="mb m1"></i><i class="mb m2"></i><i class="mb m3"></i><i class="mb m4"></i>`,
  spotlight: `<i class="sp-cone"></i><i class="sp-floor"></i>`,
  grid: `<i class="grid-l"></i><i class="glow-c"></i>`,
  dots: `<i class="dots-l"></i><i class="glow-c"></i>`,
  stars: `<i class="stars"></i><i class="stars s2"></i><i class="nebula"></i>`,
  glow: `<i class="gl g1"></i><i class="gl g2"></i>`,
  plain: ``,
};

/** Registers (once) the backdrop a slide needs and returns its key; identical backdrops are shared so they never restart between slides. */
function backdrop(c: Ctx, s: Slide, theme: ThemeName): string {
  const spec = s.background ?? (s.theme ? "auto" : (c.deck.background ?? "auto"));
  const o = typeof spec === "string" ? { kind: spec } : spec;
  const kind: BgKind = o.kind && o.kind !== "auto" ? o.kind : THEME_META[theme].bg;
  const im = "image" in o && o.image ? imgOf(c, o.image, "landscape") : undefined;
  const dim = "dim" in o ? o.dim : undefined;
  const blur = "blur" in o ? o.blur : undefined;
  const colors = "colors" in o ? o.colors : undefined;
  const key = "b" + hash(JSON.stringify([theme, kind, im?.src || im?.key || "", dim, blur, colors]), 6);
  if (c.mode === "render" && !c.backdrops.has(key)) {
    const style = colors ? ` style="${esc(colors.map((col, k) => `--b${k + 1}:${col}`).join(";"))}"` : "";
    const photo =
      im && !im.missing && im.src
        ? `<img class="bd-img" src="${esc(im.src)}" alt="" decoding="async"${blur ? ` style="filter:blur(${blur}px);inset:-${blur * 2}px"` : ""}><i class="bd-dim" style="opacity:${dim ?? 0.45}"></i>`
        : "";
    c.backdrops.set(
      key,
      `<div class="bd k-${photo ? "image" : kind}" data-bd="${key}" data-theme="${theme}" data-tone="${THEME_META[theme].tone}"${style}>${photo || BD_LAYERS[kind]}</div>`,
    );
  }
  return key;
}

/* ───────────────────────── Slides & document ───────────────────────── */

export function titleOf(s: Slide): string {
  switch (s.type) {
    case "statement":
      return s.text;
    case "quote":
      return s.quote;
    case "quiz":
      return s.question;
    case "srs":
      return s.front;
    case "definition":
      return s.term;
    case "image":
      return s.title ?? s.caption ?? "";
    case "exercise":
      return s.title ?? s.problem;
    case "predict":
      return s.title;
    case "explode":
      return s.title ?? s.layers.map((l) => l.label).join(" · ");
    case "palace":
      return s.title ?? ((s.stations ?? []).map((st) => st.item).join(" · ") || (s.from ? `${s.mode === "recall" ? "↺ " : ""}#${s.from}` : ""));
    case "anchors":
      return s.title ?? s.items.map((it) => it.term).join(" · ");
    case "analogy":
      return s.title ?? `${s.known.label} ≈ ${s.concept.label}`;
    case "mnemonic":
      return s.title ?? s.phrase ?? s.items.map((it) => it.cue).join(" ");
    case "diagram":
      return s.title ?? s.caption ?? "";
    case "html":
      return "";
    default: {
      const r = s as { title?: string; eyebrow?: string };
      return r.title ?? r.eyebrow ?? "";
    }
  }
}

function renderSlide(c: Ctx, s: Slide, i: number): string {
  c.slideIndex = i;
  c.domId = `s-${s.id ?? i + 1}`;
  const theme = s.theme ?? c.deck.theme;
  const tone = THEME_META[theme].tone;
  const r = (layouts[s.type] as (s: Slide, c: Ctx) => R)(s, c);
  const bd = backdrop(c, s, theme);
  const notes = s.notes ? blk(c, s.notes) : "";
  if (c.mode === "collect") return "";
  const acc = accentParts(s.accent ?? (s.theme ? undefined : c.deck.accent));
  const label = plain(titleOf(s));
  const attrs =
    ` id="${esc(c.domId)}" class="slide t-${s.type}${r.cls ? ` ${r.cls.trim()}` : ""}" data-i="${i}" data-type="${s.type}"` +
    ` data-theme="${theme}" data-tone="${tone}" data-bd="${bd}"${acc.attr}${acc.style ? ` style="${acc.style}"` : ""}` +
    `${s.transition ? ` data-transition="${s.transition}"` : ""}${s.morph === false ? ' data-morph="0"' : ""}` +
    ` aria-roledescription="slide" aria-label="${i + 1}${label ? `: ${esc(label.slice(0, 120))}` : ""}"`;
  const src = s.source ? `<div class="sl-source" title="${esc(plain(s.source))}">${inl(c, s.source)}</div>` : "";
  return (
    `<section${attrs}>${r.under ? `<div class="sl-under">${r.under}</div>` : ""}` +
    `<div class="sl-stage"><div class="sl-in">${r.html}</div>${src}</div>` +
    `${notes ? `<template class="sl-notes">${notes}</template>` : ""}</section>`
  );
}

function hud(c: Ctx, total: number, course?: CourseNav): string {
  const t = c.t;
  const o = c.deck.options ?? {};
  const crumb = course
    ? `<a class="crumb" href="${esc(course.hub)}" title="${esc(c.t.courseHome)}">${SVG.prev}<span class="cr-t">${esc(plain(course.title))}</span><b>${esc(c.t.lesson)} ${course.n}/${course.total}</b></a>`
    : "";
  const nextLesson = course?.next
    ? `<a class="next-lesson" href="${esc(course.next.href)}" hidden><span class="nl-k">${esc(c.t.nextLesson)}</span><b>${esc(plain(course.next.title))}</b><i>${SVG.next}</i></a>`
    : course
      ? `<a class="next-lesson" href="${esc(course.hub)}" hidden><span class="nl-k">${esc(c.t.courseDone)}</span><b>${esc(c.t.courseHome)}</b><i>${SVG.next}</i></a>`
      : "";
  const btn = (act: string, label: string, svg: string) =>
    `<button class="hb" type="button" data-act="${act}" aria-label="${esc(label)}" title="${esc(label)}">${svg}</button>`;
  const counter = o.counter !== false ? `<span class="count" aria-live="polite"><b>1</b><span class="sl">/</span><span class="tot">${total}</span></span>` : "";
  return (
    `<div class="hud">${crumb}${nextLesson}` +
    (o.progress !== false ? `<div class="progress" aria-hidden="true"><i></i></div>` : "") +
    (o.controls !== false
      ? `<nav class="pill" aria-label="${esc(t.controls)}">${btn("prev", t.prev, SVG.prev)}${counter}${btn("next", t.next, SVG.next)}<i class="sep"></i>` +
        `${btn("overview", t.overview, SVG.grid)}${btn("notes", t.notes, SVG.notes)}${btn("fullscreen", t.fullscreen, SVG.full)}${btn("help", t.help, SVG.help)}</nav>`
      : "") +
    `<aside class="notes-panel" aria-label="${esc(t.notes)}" hidden><header><span class="np-t">${esc(t.notes)}</span><span class="np-n"></span>${btn("notes", t.notes, SVG.close)}</header><div class="np-body"></div></aside>` +
    `<div class="help-sheet" role="dialog" aria-label="${esc(t.help)}" hidden><div class="help-card"><h3>${esc(t.help)}</h3><dl>` +
    t.keys.map(([k, v]) => `<div><dt>${k!.split(" / ").map((x) => `<kbd>${esc(x)}</kbd>`).join("")}</dt><dd>${esc(v)}</dd></div>`).join("") +
    `</dl><div class="help-foot"><button type="button" class="help-export" data-act="export-progress">${esc(t.exportProgress)}</button></div></div></div><div class="toast" role="status" hidden></div></div>`
  );
}

/* ───────────────────────── Assets ───────────────────────── */

const assetCache = new Map<string, string>();

/** Reads a build asset (assets/) with an optional source fallback (runtime/). Cached unless AURORA_DEV is set. */
export async function asset(name: string, fallback?: string): Promise<string> {
  const dev = !!process.env.AURORA_DEV;
  if (!dev && assetCache.has(name)) return assetCache.get(name)!;
  const paths = dev && fallback ? [join(PKG_ROOT, fallback), join(PKG_ROOT, "assets", name)] : [join(PKG_ROOT, "assets", name), ...(fallback ? [join(PKG_ROOT, fallback)] : [])];
  let text = "";
  for (const p of paths) {
    try {
      text = await readFile(p, "utf8");
      break;
    } catch {
      /* try next */
    }
  }
  assetCache.set(name, text);
  return text;
}

const FONT_LINKS: Record<string, string> = {
  vietnam: "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap",
  inter: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..800;1,14..32,400&display=swap",
  mono: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400..700&display=swap",
};

export async function fontCss(name: string): Promise<string> {
  const css = await asset(`font-${name}.css`);
  return css ? `<style>${css}</style>` : FONT_LINKS[name] ? `<link rel="stylesheet" href="${FONT_LINKS[name]}">` : "";
}

/* ───────────────────────── Public API ───────────────────────── */

export interface CourseNav {
  /** Stable progress key shared with the course home page. */
  key: string;
  title: string;
  hub: string;
  n: number;
  total: number;
  next?: { title: string; href: string };
  lesson?: string;
}

export interface RenderOptions {
  /** Folder that relative image paths are resolved against (the deck folder). */
  dir?: string;
  /** Inline local images as data URIs so the HTML works anywhere. */
  embed?: boolean;
  /** Set when the deck is a lesson of a course: breadcrumb, next-lesson button, shared progress. */
  course?: CourseNav;
}

/** A `generate` prompt waiting for the coding agent to make the picture (AURORA_IMAGE_PROVIDER=agent). */
export interface ImageRequest {
  id: string;
  prompt: string;
  orientation: Orientation;
  transparent: boolean;
  slides: number[];
}

export interface RenderResult {
  html: string;
  warnings: string[];
  missingIcons: string[];
  failedImages: string[];
  imageRequests: ImageRequest[];
  /** Ids of every `generate` prompt in the deck (filled or not). */
  genIds: string[];
  stats: { slides: number; icons: number; images: number; codeBlocks: number; math: boolean; bytes: number };
}

export async function renderDeck(deck: Deck, opts: RenderOptions = {}): Promise<RenderResult> {
  const dir = resolve(opts.dir ?? process.cwd());
  const lang = deck.lang.toLowerCase().startsWith("vi") ? "vi" : "en";
  const sections: Ctx["sections"] = [];
  deck.slides.forEach((s, i) => {
    if (s.type === "section")
      sections.push({ index: i, title: s.title, number: s.number !== undefined ? String(s.number) : String(sections.length + 1).padStart(2, "0") });
  });
  const shared = {
    icons: new Map<string, IconRecord>(),
    images: new Map<string, ImageResult>(),
    code: new Map<string, CodeHtml>(),
    codeErrors: new Map<string, CodeError>(),
    codeWarnings: new Map<string, string>(),
    local: new Map<string, string>(),
    missingLocal: new Set<string>(),
    gen: new Map<string, string>(),
    genErrors: new Map<string, string>(),
    genWait: new Set<string>(),
    diagrams: new Map<string, DiagramOut>(),
  };
  const mk = (mode: Ctx["mode"]): Ctx => ({
    mode, deck, dir, embed: !!opts.embed, t: STRINGS[lang], magic: deck.options?.magicMove !== false, math: createMath(), ...shared,
    needIcons: new Set(), needImages: new Map(), needCode: new Map(), needCodeFiles: new Map(), needLocal: new Map(), needGen: new Map(), needDiagrams: new Map(), warnings: [], sections,
    quizTotal: deck.slides.filter((s) => s.type === "quiz").length,
    predictTotal: deck.slides.filter((s) => s.type === "predict").length,
    srsTotal: deck.slides.filter((s) => s.type === "srs").length,
    quizNo: 0, slideIndex: 0, domId: "", backdrops: new Map(), css: [],
  });

  // Pass 1: collect everything the layouts need.
  const col = mk("collect");
  deck.slides.forEach((s, i) => renderSlide(col, s, i));

  // Resolve in parallel: icons, image queries, syntax highlighting, local files, code files.
  const [iconRes, imgRes] = await Promise.all([
    col.needIcons.size ? resolveIcons(col.needIcons) : Promise.resolve({ icons: new Map<string, IconRecord>(), missing: [] as string[], offline: [] as string[] }),
    col.needImages.size ? resolveImageQueries([...col.needImages.values()]) : Promise.resolve({ found: new Map<string, ImageResult>(), failed: [] as string[] }),
    Promise.all([
      ...[...col.needCode].map(async ([key, { code, lang: l }]) => shared.code.set(key, await highlightCode(code, l))),
      ...[...col.needCodeFiles].map(async ([key, job]) => {
        try {
          const raw = await readFile(job.absPath, "utf8");
          const totalLines = raw.replace(/\r\n/g, "\n").split("\n").length;
          if (!job.lines && totalLines > 40) {
            shared.codeWarnings.set(key, `Slide ${job.slideNo}: quoting whole file "${job.file}" (${totalLines} lines); add a "lines" range (e.g. "1-25") so the code stays readable.`);
          }
          const ranges = parseLineRanges(job.lines);
          const cut = cutFileLines(raw, ranges, job.dedent !== false);
          const lang = job.lang ?? langFromExt(job.file);
          const res = await highlightCode(cut.code, lang, cut.lineEntries);
          shared.code.set(key, { ...res, filename: job.filename ?? basename(job.file) });
        } catch (e) {
          const reason = (e as any)?.code === "ENOENT" ? "file not found" : (e instanceof Error ? e.message : String(e));
          shared.codeErrors.set(key, {
            slideNo: job.slideNo,
            file: job.file,
            lines: job.lines,
            reason,
            filename: job.filename ?? basename(job.file),
          });
        }
      }),
    ]),
    Promise.all(
      [...col.needLocal].map(async ([abs, embed]) => {
        try {
          const buf = await readFile(abs);
          if (embed) shared.local.set(abs, `data:${MIME[extname(abs).toLowerCase()] ?? "application/octet-stream"};base64,${buf.toString("base64")}`);
        } catch {
          shared.missingLocal.add(abs);
        }
      }),
    ),
  ]);
  iconRes.icons.forEach((v, k) => shared.icons.set(k, v));
  imgRes.found.forEach((v, k) => shared.images.set(k, v));

  // `generate` prompts: a picture already in images/gen-<id>.* (made by the agent or earlier) or in the cache is reused;
  // otherwise agent mode lists a request for the coding agent, and the other modes call the image API.
  const mode = imageMode();
  const use = async (key: string, file: string, inDeck: boolean) => {
    if (opts.embed) shared.gen.set(key, `data:${MIME[extname(file).toLowerCase()] ?? "image/png"};base64,${(await readFile(file)).toString("base64")}`);
    else shared.gen.set(key, inDeck ? `images/${basename(file)}` : await placeInDeck(file, dir, `gen-${key}`));
  };
  const jobs = [...col.needGen];
  const worker = async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const [key, g] = job;
      try {
        const have = findGenerated(key, dir);
        if (have) await use(key, have.file, have.inDeck);
        else if (mode === "agent") shared.genWait.add(key);
        else await use(key, (await generateCached({ prompt: g.prompt, orientation: g.orientation, transparent: g.transparent })).file, false);
      } catch (e) {
        shared.genErrors.set(key, e instanceof Error ? e.message : String(e));
      }
    }
  };
  // Mermaid diagrams: drawn in headless Chrome with the deck's fonts (cached), alongside the image generation.
  const drawDiagrams = async () => {
    if (!col.needDiagrams.size) return;
    const fontText = deck.font === "system" ? "" : await asset(`font-${deck.font}.css`);
    (await renderDiagrams([...col.needDiagrams.values()], fontText)).forEach((v, k) => shared.diagrams.set(k, v));
  };
  await Promise.all([worker(), worker(), worker(), drawDiagrams()]);

  // Pass 2: render.
  const c = mk("render");
  const slides = deck.slides.map((s, i) => renderSlide(c, s, i)).join("\n");
  const total = deck.slides.length;
  if (iconRes.offline.length) c.warnings.push(`Could not reach the Iconify API for ${iconRes.offline.length} icon(s); they render as blanks until the next online build.`);
  if (shared.missingLocal.size && !c.warnings.some((w) => w.startsWith("Image file not found"))) c.warnings.push(`${shared.missingLocal.size} local image file(s) were not found.`);

  const usesCode = col.needCode.size > 0 || col.needCodeFiles.size > 0;
  const [css, js, katexCss, fonts, mono] = await Promise.all([
    asset("aurora.min.css", "runtime/aurora.css"),
    asset("aurora.min.js", "runtime/aurora.js"),
    c.math.used() ? asset("katex.css") : Promise.resolve(""),
    fontCss(deck.font === "system" ? "" : deck.font),
    usesCode ? fontCss("mono") : Promise.resolve(""),
  ]);
  if (!css || !js) c.warnings.push("Runtime assets are missing; run `node scripts/build.mjs` in the Aurora Slides folder.");

  const o = deck.options ?? {};
  const cfg = {
    v: VERSION,
    id: opts.course?.key ?? hash(`${deck.title}|${deck.author ?? ""}`, 10),
    course: opts.course
      ? {
          title: plain(opts.course.title),
          lesson: opts.course.lesson ?? basename(dir),
          n: opts.course.n,
          total: opts.course.total,
          key: hash(opts.course.title, 10),
        }
      : undefined,
    deck: plain(deck.title),
    title: plain(deck.title),
    lang: deck.lang,
    transition: deck.transition,
    options: {
      progress: o.progress !== false, controls: o.controls !== false, counter: o.counter !== false, grain: o.grain !== false,
      parallax: o.parallax !== false, magicMove: o.magicMove !== false, loop: o.loop === true, resume: o.resume !== false,
    },
    quizzes: c.quizTotal,
    predicts: c.predictTotal,
    srsCards: c.srsTotal,
    t: {
      correct: c.t.correct, wrong: c.t.wrong, answerIs: c.t.answerIs, resume: c.t.resume, resumeYes: c.t.resumeYes, restart: c.t.restart,
      great: c.t.great, good: c.t.good, review: c.t.review, none: c.t.none, noNotes: c.t.noNotes, notes: c.t.notes,
      asPredicted: c.t.asPredicted, different: c.t.different, gapLesson: c.t.gapLesson, predictionsRight: c.t.predictionsRight,
      exportProgress: c.t.exportProgress,
      srsAgain: c.t.srsAgain, srsHard: c.t.srsHard, srsGood: c.t.srsGood, srsEasy: c.t.srsEasy, srsReview: c.t.srsReview, cardsUnit: c.t.cardsUnit, forgotten: c.t.forgotten,
    },
    slides: deck.slides.map((s, i) => ({ id: s.id ?? String(i + 1), rawId: s.id ?? null, type: s.type, title: plain(titleOf(s)).slice(0, 140) })),
  };
  const theme = deck.theme;
  const html =
    `<!doctype html>\n<html lang="${esc(deck.lang)}" data-theme="${theme}" data-tone="${THEME_META[theme].tone}" class="f-${deck.font}">\n<head>\n` +
    `<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n` +
    `<meta name="generator" content="Aurora Slides ${VERSION}">\n<title>${esc(plain(deck.title))}</title>\n` +
    `${deck.subtitle ? `<meta name="description" content="${esc(plain(deck.subtitle))}">\n` : ""}${deck.author ? `<meta name="author" content="${esc(deck.author)}">\n` : ""}` +
    `<meta name="color-scheme" content="${THEME_META[theme].tone}">\n${fonts}${mono}${katexCss ? `<style>${katexCss}</style>` : ""}\n<style>${css}</style>\n` +
    `${c.css.length ? `<style>${c.css.join("\n")}</style>\n` : ""}</head>\n<body>\n` +
    `<div class="backdrops" aria-hidden="true">${[...c.backdrops.values()].join("")}</div>\n` +
    `<main class="deck" id="deck">\n${slides}\n</main>\n` +
    `${cfg.options.grain ? `<div class="grain" aria-hidden="true"></div>\n` : ""}${hud(c, total, opts.course)}\n` +
    `<script>window.AURORA=${JSON.stringify(cfg).replace(/</g, "\\u003c")}</script>\n<script>${js}</script>\n</body>\n</html>\n`;

  return {
    html,
    warnings: c.warnings,
    missingIcons: iconRes.missing,
    failedImages: imgRes.failed,
    imageRequests: [...col.needGen].filter(([k]) => shared.genWait.has(k)).map(([id, g]) => ({ id, ...g })),
    genIds: [...col.needGen.keys()],
    stats: { slides: total, icons: shared.icons.size, images: shared.images.size, codeBlocks: col.needCode.size + col.needCodeFiles.size, math: c.math.used(), bytes: Buffer.byteLength(html) },
  };
}
