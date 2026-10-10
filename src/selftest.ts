/**
 * Drives a built deck in headless Chrome like a learner would (keyboard
 * navigation, builds, quiz, flashcards, overview) and reports runtime errors.
 */
import { pathToFileURL } from "node:url";
import { withPage } from "./browser.js";

export interface SelfTestReport {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
  logs: string[];
}

const SCRIPT = String.raw`(async () => {
  const A = window.__aurora;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail === undefined ? undefined : String(detail) });
  check("runtime loaded", A && A.total > 0, A && A.total);
  check("starts on slide 1", A.state().slide === 1, JSON.stringify(A.state()));
  const seen = [];
  let guard = 0;
  let last = A.state();
  while (guard++ < 400) {
    const s = A.state();
    seen.push(s.slide + "." + s.step);
    if (s.type === "quiz") {
      const quiz = document.querySelector(".slide.on .quiz");
      const ok = quiz && quiz.querySelector('.qz-opt[data-ok="1"]');
      if (ok && !quiz.classList.contains("answered")) {
        ok.click();
        await wait(80);
        check("quiz grades a correct answer", quiz.classList.contains("answered") && quiz.querySelector(".qz-result.ok"));
      }
    }
    if (s.type === "flashcards") {
      const card = document.querySelector(".slide.on .fcard");
      if (card && card.getAttribute("aria-pressed") !== "true") {
        card.click();
        await wait(60);
        check("flashcard flips", card.getAttribute("aria-pressed") === "true");
      }
    }
    if (s.type === "exercise") {
      const tm = document.querySelector(".slide.on .ex-timer");
      if (tm && !tm.classList.contains("run") && !tm._tested) {
        tm._tested = true;
        tm.click();
        await wait(1150);
        const txt = tm.querySelector(".t-num").textContent;
        check("exercise timer counts down", tm.classList.contains("run") && txt !== tm.dataset.time, txt);
        tm.click();
      }
    }
    if (s.type === "diagram") {
      const sl = document.querySelector(".slide.on");
      if (!sl._dgTested) {
        sl._dgTested = true;
        check("diagram is drawn", sl.querySelector(".dg-svg svg") && !sl.querySelector(".dg-failed"));
      }
    }
    if (s.type === "predict") {
      const sl = document.querySelector(".slide.on");
      const ta = sl.querySelector(".pred-box");
      if (ta && !sl._predTested) {
        sl._predTested = true;
        ta.focus();
        ta.value = "abc";
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        await wait(50);
        check("predict typing leaves slide unchanged", A.state().slide === s.slide && ta.value === "abc");
        ta.blur();
      }
      if (s.step === s.steps && !sl._predEndTested) {
        sl._predEndTested = true;
        const term = sl.querySelector(".pred-term pre");
        check("predict terminal printed output", term && term.textContent.includes("[1, 2, 3]"), term ? term.textContent : "");
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", code: "Digit1", bubbles: true }));
        await wait(60);
        const okBtn = sl.querySelector(".pred-r.ok");
        check("predict rating 1 records rating", okBtn && okBtn.classList.contains("sel"));
      }
    }
    if (s.type === "palace") {
      const sl = document.querySelector(".slide.on");
      A.settle();
      const world = sl.querySelector(".pl-world");
      const z = +(world.style.getPropertyValue("--cz") || 1);
      if (s.step === 1 && !sl._camTested) {
        sl._camTested = true;
        check("palace camera zooms into the first stop", z > 1.05 && sl.querySelector(".pl-card.on"), world.style.transform);
        check("palace draws the route", sl.querySelectorAll(".pl-leg").length === sl.querySelectorAll(".pl-pin").length - 1);
      }
      const btn = sl.querySelector(".pl-card.on.revealed .pl-r.ok");
      if (btn && !sl._rateTested) {
        sl._rateTested = true;
        btn.click();
        await wait(60);
        check("palace recall rating marks the stop", sl.querySelector(".pl-pin.ok"));
      }
      if (s.step === s.steps && sl.querySelector(".pl-end.recall") && !sl._endTested) {
        sl._endTested = true;
        check("palace recall shows the score", (sl.querySelector(".pl-score").textContent || "").length > 0, sl.querySelector(".pl-score").textContent);
      }
    }
    if (s.type === "srs") {
      const sl = document.querySelector(".slide.on");
      const card = sl && sl.querySelector(".srs-card");
      if (card && !sl._srsTested) {
        sl._srsTested = true;
        const hintBtn = sl.querySelector(".srs-hint-btn");
        if (hintBtn) {
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", code: "KeyH", bubbles: true }));
          await wait(50);
          check("srs hint toggles with key H", hintBtn.classList.contains("revealed"));
        }
        card.click();
        await wait(60);
        check("srs card flips to back", card.getAttribute("aria-pressed") === "true");
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "3", code: "Digit3", bubbles: true }));
        await wait(360);
        const goodBtn = sl.querySelector(".srs-r.r-good");
        check("srs rating 3 marks good", goodBtn && goodBtn.classList.contains("sel"));
      }
    }
    if (s.slide === s.total && s.step >= s.steps) break;
    A.next();
    await wait(140);
    const n = A.state();
    if (n.slide < last.slide || (n.slide === last.slide && n.step <= last.step && n.slide !== n.total)) {
      check("navigation moves forward", false, last.slide + "." + last.step + " -> " + n.slide + "." + n.step);
      break;
    }
    last = n;
  }
  check("reached the last slide with all builds", A.state().slide === A.total, JSON.stringify(A.state()));
  const sum = document.querySelector(".slide.on .sm-got");
  if (sum) check("summary shows the quiz score", +sum.textContent >= 1, sum.textContent);
  A.prev(); await wait(120); A.prev(); await wait(120);
  check("back navigation", A.state().slide <= A.total, JSON.stringify(A.state()));
  A.overview(); await wait(250);
  check("overview opens", document.documentElement.classList.contains("ov"));
  A.overview(); await wait(250);
  check("overview closes", !document.documentElement.classList.contains("ov"));
  A.go(0); await wait(200);
  check("go(0)", A.state().slide === 1);

  let events = [];
  try {
    const k = Object.keys(localStorage).find((x) => x.startsWith("aurora:") && x.endsWith(":events"));
    if (k) events = JSON.parse(localStorage.getItem(k)) || [];
  } catch {}
  const quizEv = events.find((e) => e.type === "quiz");
  check("quiz event recorded in buffer with contract fields", quizEv && quizEv.v === 1 && typeof quizEv.t === "string" && quizEv.correct === true && Array.isArray(quizEv.chosen) && Array.isArray(quizEv.answer) && Array.isArray(quizEv.chosenText) && Array.isArray(quizEv.answerText));
  const predEv = events.find((e) => e.type === "predict");
  check("predict event recorded in buffer with contract fields", predEv && predEv.v === 1 && typeof predEv.t === "string" && predEv.rating === "right" && typeof predEv.output === "string");
  const cardEv = events.find((e) => e.type === "card");
  check("card event recorded in buffer with contract fields", cardEv && cardEv.v === 1 && typeof cardEv.t === "string" && typeof cardEv.card === "string" && cardEv.rating === "good" && typeof cardEv.ms === "number");
  const completeEv = events.find((e) => e.type === "complete");
  check("complete event recorded in buffer with contract fields", completeEv && completeEv.v === 1 && typeof completeEv.slides === "number");

  return { checks, visited: seen.length };
})()`;

export async function selfTest(html: string): Promise<SelfTestReport> {
  return withPage(/^https?:/i.test(html) ? html : pathToFileURL(html).href, { width: 1280, height: 720 }, async (page) => {
    try {
      await page.send("Runtime.evaluate", { expression: "localStorage.clear(); true", returnByValue: true });
    } catch {
      /* storage may be unavailable */
    }
    const r = await page.eval<{ checks: SelfTestReport["checks"]; visited: number }>(SCRIPT, 180000);
    const logs = [...new Set(page.logs)];
    const ok = r.checks.every((c) => c.ok) && logs.length === 0;
    return { ok, checks: [...r.checks, { name: `visited ${r.visited} slide states`, ok: true }], logs };
  });
}
