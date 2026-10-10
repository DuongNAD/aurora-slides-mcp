/**
 * Courses: a subject split into small lessons, each its own deck with its own look,
 * plus an Apple-style course home page that shows the learner's progress.
 */
import { inline, plain } from "./markup.js";
import { iconHtml, resolveIcons } from "./media.js";
import { asset, BD_LAYERS, fontCss, STRINGS, SVG, THEME_META, type ThemeName } from "./render.js";
import type { Course } from "./schema.js";
import { esc, hash, VERSION } from "./util.js";

export interface LessonCard {
  n: number;
  title: string;
  summary?: string;
  icon?: string;
  theme: ThemeName;
  minutes?: number;
  dir: string;
  /** Relative link to the lesson page once its deck is built. */
  href?: string;
  slides?: number;
  key: string;
}

/** Rotation used when a lesson has no theme: neighbours never share a look. */
export const LESSON_THEMES: ThemeName[] = ["aurora", "titanium", "ocean", "sunset", "forest", "liquid", "midnight", "daylight", "paper"];

/** Progress key shared by a lesson deck and the course page (stable across rebuilds). */
export const lessonKey = (courseTitle: string, dir: string): string => hash(`course|${courseTitle}|${dir}`, 10);

const HUB_JS = `(() => {
  const T = window.AURORA_HUB || {};
  const get = (k) => { try { return JSON.parse(localStorage.getItem("aurora:" + k + ":progress")); } catch { return null; } };
  const cards = Array.from(document.querySelectorAll(".c-card"));
  // Spaced review: a finished lesson is due again 1, 3, 7, 16, 35 days after the last visit (each recall walk moves it up a level).
  const GAPS = [1, 3, 7, 16, 35], DAY = 864e5;
  const due = [];
  let done = 0, total = 0, next = null;
  for (const c of cards) {
    const link = c.querySelector("a.c-link");
    if (!link) continue;
    total++;
    const p = get(c.dataset.key);
    const chip = c.querySelector(".c-chip");
    const bar = c.querySelector(".c-bar i");
    if (p && p.done) {
      done++;
      bar.style.width = "100%";
      const last = Math.max(p.t || 0, p.rt || 0);
      if (last && Date.now() >= last + GAPS[Math.min(GAPS.length - 1, p.rv || 0)] * DAY) { c.classList.add("due"); chip.textContent = T.due; due.push(c); }
      else { c.classList.add("done"); chip.textContent = T.done; }
      continue;
    }
    if (p && p.max > 1 && p.total) {
      const pct = Math.min(99, Math.round((100 * p.max) / p.total));
      c.classList.add("doing");
      chip.textContent = T.doing + " · " + pct + "%";
      bar.style.width = pct + "%";
    }
    if (!next) next = c;
  }
  const n = document.querySelector(".cp-n");
  if (n) n.textContent = String(done);
  const ring = document.querySelector(".cp-fill");
  if (ring && done > 0) {
    ring.style.opacity = "1";
    requestAnimationFrame(() => (ring.style.strokeDasharray = ((100 * done) / total).toFixed(1) + " 100"));
  }
  const cta = document.querySelector("[data-cta]");
  const label = cta && cta.querySelector("span");
  if (cta && label) {
    if (next) {
      cta.href = next.querySelector("a.c-link").getAttribute("href");
      if (done > 0 || next.classList.contains("doing")) label.textContent = T.cont + " " + next.dataset.n;
    } else if (total) {
      cta.href = cards.find((c) => c.querySelector("a.c-link")).querySelector("a.c-link").getAttribute("href");
      label.textContent = T.review;
    }
  }
  const dueEl = document.querySelector(".c-due");
  if (dueEl && due.length) {
    dueEl.textContent = T.today;
    for (const c of due) {
      const a = document.createElement("a");
      a.href = c.querySelector("a.c-link").getAttribute("href");
      a.textContent = T.lesson + " " + c.dataset.n;
      dueEl.append(a);
    }
    dueEl.hidden = false;
  }
  window.addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });
})();`;

export async function renderCourse(course: Course, lessons: LessonCard[]): Promise<{ html: string; warnings: string[] }> {
  const lang = course.lang.toLowerCase().startsWith("vi") ? "vi" : "en";
  const t = STRINGS[lang];
  const warnings: string[] = [];
  const ids = lessons.map((l) => l.icon).filter((x): x is string => !!x);
  const res = ids.length ? await resolveIcons(ids) : { icons: new Map(), missing: [] as string[], offline: [] as string[] };
  res.missing.forEach((m) => warnings.push(`Icon "${m}" in the course outline was not found.`));
  const totalMin = lessons.reduce((a, l) => a + (l.minutes ?? 0), 0);
  const built = lessons.filter((l) => l.href);
  const cards = lessons
    .map((l) => {
      const meta = [l.minutes ? `${l.minutes} ${t.minutesUnit}` : "", l.slides ? `${l.slides} ${t.slidesUnit}` : ""].filter(Boolean).join(" · ");
      const ic = l.icon ? iconHtml(res.icons.get(l.icon), l.icon, "c-ic") : "";
      const inner =
        `<div class="c-bg" aria-hidden="true"><i></i><i></i></div><div class="c-num">${String(l.n).padStart(2, "0")}</div>` +
        `<div class="c-body">${meta ? `<div class="c-meta">${esc(meta)}</div>` : ""}<h2 class="c-t">${inline(l.title)}</h2>` +
        `${l.summary ? `<p class="c-s">${inline(l.summary)}</p>` : ""}` +
        `<div class="c-state"><span class="c-chip">${esc(l.href ? t.statusNew : t.statusSoon)}</span><span class="c-bar"><i></i></span></div></div>` +
        `${ic ? `<div class="c-icon">${ic}</div>` : ""}`;
      return (
        `<li class="c-card${l.href ? "" : " soon"}" data-theme="${l.theme}" data-tone="${THEME_META[l.theme].tone}" data-key="${l.key}" data-n="${l.n}">` +
        `${l.href ? `<a class="c-link" href="${esc(l.href)}">${inner}</a>` : `<div class="c-link">${inner}</div>`}</li>`
      );
    })
    .join("");
  const theme = course.theme;
  const kind = THEME_META[theme].bg;
  const [css, fonts] = await Promise.all([asset("aurora.min.css", "runtime/aurora.css"), fontCss(course.font === "system" ? "" : course.font)]);
  const strings = { done: t.statusDone, doing: t.statusDoing, cont: t.continueAt, review: t.reviewAll, due: t.statusDue, today: t.reviewToday, lesson: t.lesson };
  const html =
    `<!doctype html>\n<html lang="${esc(course.lang)}" data-theme="${theme}" data-tone="${THEME_META[theme].tone}" class="f-${course.font} hub">\n<head>\n` +
    `<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n` +
    `<meta name="generator" content="Aurora Slides ${VERSION}">\n<title>${esc(plain(course.title))}</title>\n` +
    `<meta name="color-scheme" content="${THEME_META[theme].tone}">\n${fonts}\n<style>${css}</style>\n</head>\n<body>\n` +
    `<div class="backdrops" aria-hidden="true"><div class="bd k-${kind} on" data-theme="${theme}" data-tone="${THEME_META[theme].tone}">${BD_LAYERS[kind]}</div></div>\n` +
    `<main class="course"><header class="c-hero"><div class="c-kicker">${esc(t.course)} · ${lessons.length} ${esc(t.lessonsUnit)}${totalMin ? ` · ~${totalMin} ${esc(t.minutesUnit)}` : ""}</div>` +
    `<h1 class="c-title">${inline(course.title)}</h1>${course.subtitle ? `<p class="c-sub">${inline(course.subtitle)}</p>` : ""}` +
    `<div class="c-actions">${built[0] ? `<a class="c-cta" href="${esc(built[0].href!)}" data-cta><span>${esc(t.startLearning)}</span>${SVG.next}</a>` : ""}` +
    `<div class="c-progress"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="cp-track" cx="22" cy="22" r="18"/><circle class="cp-fill" cx="22" cy="22" r="18" pathLength="100"/></svg>` +
    `<span><b class="cp-n">0</b>/${built.length} ${esc(t.learned)}</span></div></div><p class="c-due" hidden></p></header>\n` +
    `<ol class="c-lessons">${cards}</ol>\n<footer class="c-foot">${course.author && course.author !== "Aurora Slides" ? `${esc(plain(course.author))} · ` : ""}Aurora Slides</footer></main>\n` +
    `<div class="grain" aria-hidden="true"></div>\n` +
    `<script>window.AURORA_HUB=${JSON.stringify(strings).replace(/</g, "\\u003c")}</script>\n<script>${HUB_JS}</script>\n</body>\n</html>\n`;
  return { html, warnings };
}
