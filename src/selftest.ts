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
  const bdContainer = document.querySelector(".backdrops");
  const activeBd1 = document.querySelector(".backdrops .bd.on");
  check("active backdrop has scn when scene present", activeBd1 && !!activeBd1.querySelector(".scn"));
  check("title slide data-hero is 1", bdContainer && bdContainer.dataset.hero === "1", bdContainer ? bdContainer.dataset.hero : "");
  let testedHeroDense = false;
  let testedHero0 = false;
  let testedSceneNone = false;
  const seen = [];
  let guard = 0;
  let last = A.state();
  while (guard++ < 400) {
    const s = A.state();
    seen.push(s.slide + "." + s.step);
    const curBd = document.querySelector(".backdrops .bd.on");
    const bdHero = bdContainer ? bdContainer.dataset.hero : null;
    if (!testedHeroDense && (s.type === "code" || s.type === "table" || s.type === "diagram")) {
      testedHeroDense = true;
      check("content slide data-hero switches to dense", bdHero === "dense", s.type + ": " + bdHero);
    }
    if (!testedHero0 && (s.type === "bullets" || s.type === "split")) {
      testedHero0 = true;
      check("content slide data-hero switches to 0", bdHero === "0", s.type + ": " + bdHero);
    }
    if (!testedSceneNone && (s.type === "notebook" || s.type === "anchors")) {
      testedSceneNone = true;
      check("slide with scene none renders no scn", curBd && !curBd.querySelector(".scn"));
    }
    if (s.type === "notebook") {
      const sl = document.querySelector(".slide.on");
      const fRows = sl ? Array.from(sl.querySelectorAll(".k-formula")) : [];
      for (const row of fRows) {
        if (!row._formulaTested) {
          const disp = row.querySelector(".katex-display") || row.firstElementChild;
          if (disp && disp.offsetHeight > 0) {
            row._formulaTested = true;
            const rowH = row.getBoundingClientRect().height;
            const formH = disp.getBoundingClientRect().height;
            check(
              "notebook formula row does not clip or overlap",
              rowH >= formH - 1,
              "row " + Math.round(rowH) + "px vs formula " + Math.round(formH) + "px",
            );
          }
        }
      }
    }
    if (s.type === "trace") {
      const sl = document.querySelector(".slide.on");
      if (sl && !sl._traceTested) {
        sl._traceTested = true;
        const stage = sl.querySelector(".sl-stage");
        const frame = sl.querySelector(".tr-frame");
        const iframe = sl.querySelector(".tr-ratio iframe");
        const sc = (stage ? stage.getBoundingClientRect().width : 1920) / 1920;
        const fRect = frame ? frame.getBoundingClientRect() : { width: 0, height: 0 };
        const fW = fRect.width / sc;
        const fH = fRect.height / sc;
        check(
          "trace frame fills the slide",
          fW >= 1700 && fH >= 880,
          "frame " + Math.round(fW) + "x" + Math.round(fH) + " (stage scale " + sc.toFixed(3) + ")",
        );
        let scaleVal = 0;
        if (iframe) {
          const tf = iframe.style.transform || "";
          const m = /scale\(([\d.]+)\)/.exec(tf);
          if (m) scaleVal = parseFloat(m[1]);
        }
        check("trace iframe scaled", scaleVal >= 1.2, "iframe scale: " + scaleVal);
      }
    }
    if (s.type === "quiz") {
      const quiz = document.querySelector(".slide.on .quiz");
      const ok = quiz && quiz.querySelector('.qz-opt[data-ok="1"]');
      if (ok && !quiz.classList.contains("answered")) {
        ok.click();
        await wait(80);
        check("quiz grades a correct answer", quiz.classList.contains("answered") && quiz.querySelector(".qz-result.ok"));
        const retryBtn = quiz.querySelector(".qz-foot .qz-retry");
        check("quiz has try again button", retryBtn && !retryBtn.hidden);
        if (retryBtn) {
          retryBtn.click();
          await wait(60);
          check("quiz try again resets visual state", !quiz.classList.contains("answered") && !quiz.querySelector(".qz-result.ok") && retryBtn.hidden);
          ok.click();
          await wait(80);
        }
      }
    }
    if (s.type === "order") {
      const sl = document.querySelector(".slide.on");
      const order = sl && sl.querySelector(".order");
      if (order && !sl._orderTested) {
        sl._orderTested = true;
        const list = order.querySelector(".od-list");
        let sorted = false;
        for (let iter = 0; iter < 12; iter++) {
          const tiles = Array.from(list.querySelectorAll(".od-tile"));
          let misplaced = -1;
          for (let i = 0; i < tiles.length; i++) {
            if (+tiles[i].dataset.k !== i) { misplaced = i; break; }
          }
          if (misplaced < 0) { sorted = true; break; }
          const targetTile = tiles.find((t) => +t.dataset.k === misplaced);
          tiles[misplaced].click();
          await wait(30);
          targetTile.click();
          await wait(50);
        }
        check("order tiles reordered via clicks", sorted);
        const chk = order.querySelector(".qz-check");
        if (chk) chk.click();
        await wait(80);
        check("order grades as correct", order.classList.contains("checked") && order.querySelector(".qz-result.ok"));
      }
    }
    if (s.type === "match") {
      const sl = document.querySelector(".slide.on");
      const match = sl && sl.querySelector(".match");
      if (match && !sl._matchTested) {
        sl._matchTested = true;
        const lefts = Array.from(match.querySelectorAll('.mt-item[data-side="left"]'));
        for (const l of lefts) {
          const k = l.dataset.k;
          const r = match.querySelector('.mt-item[data-side="right"][data-k="' + k + '"]');
          l.click();
          await wait(30);
          r.click();
          await wait(40);
        }
        const chk = match.querySelector(".qz-check");
        check("match enables check when all pairs connected", chk && !chk.disabled);
        if (chk) chk.click();
        await wait(80);
        check("match grades all pairs correct", match.classList.contains("checked") && match.querySelector(".qz-result.ok"));
      }
    }
    if (s.type === "sort") {
      const sl = document.querySelector(".slide.on");
      const sort = sl && sl.querySelector(".sort");
      if (sort && !sl._sortTested) {
        sl._sortTested = true;
        const chips = Array.from(sort.querySelectorAll(".st-tray .st-chip"));
        for (const ch of chips) {
          const k = +ch.dataset.k;
          const bin = sort.querySelector('.st-bin[data-bin="' + k + '"]');
          ch.click();
          await wait(30);
          bin.click();
          await wait(40);
        }
        const chk = sort.querySelector(".qz-check");
        check("sort enables check when tray is empty", chk && !chk.disabled);
        if (chk) chk.click();
        await wait(80);
        check("sort grades all chips correct", sort.classList.contains("checked") && sort.querySelector(".qz-result.ok"));
      }
    }
    if (s.type === "cloze") {
      const sl = document.querySelector(".slide.on");
      const inputs = Array.from(sl.querySelectorAll(".cz-in"));
      if (inputs.length && !sl._clozeTested) {
        sl._clozeTested = true;
        let testedBlank = null;
        for (let i = 0; i < inputs.length; i++) {
          const ans = inputs[i].dataset.ans || "";
          const noAcc = ans.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d");
          if (!testedBlank && noAcc !== ans) {
            inputs[i].focus();
            inputs[i].value = noAcc;
            inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
            testedBlank = { idx: i, ans };
          } else {
            inputs[i].focus();
            inputs[i].value = ans;
            inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
        await wait(40);
        const chk = sl.querySelector(".qz-check");
        check("typed cloze enables check when all blanks filled", chk && !chk.disabled);
        if (chk) chk.click();
        await wait(80);
        const fb = testedBlank ? inputs[testedBlank.idx].closest(".cz-blank-wrap")?.querySelector(".cz-fb.accent") : null;
        check("typed cloze accepts accent-free answer with accent note", sl.querySelector(".qz-result.ok") && fb && fb.textContent.includes(testedBlank.ans));
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
        await wait(60);
        const goodBtn = sl.querySelector(".srs-r.r-good");
        check("srs rating 3 marks good", goodBtn && goodBtn.classList.contains("sel"));
        await wait(350);
        last = A.state();
        continue;
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
  const quizEv = events.find((e) => e.type === "quiz" && !e.chosenText?.[0]?.includes("→") && e.chosen.length > 0);
  check("quiz event recorded in buffer with contract fields", quizEv && quizEv.v === 1 && typeof quizEv.t === "string" && quizEv.correct === true && Array.isArray(quizEv.chosen) && Array.isArray(quizEv.answer) && Array.isArray(quizEv.chosenText) && Array.isArray(quizEv.answerText));
  const orderEv = events.find((e) => e.type === "quiz" && e.chosenText?.length === 1 && e.chosenText[0].includes("→"));
  check("order event recorded in buffer with contract fields", orderEv && orderEv.v === 1 && orderEv.correct === true && Array.isArray(orderEv.chosen) && orderEv.chosen.length >= 3);
  const matchEv = events.find((e) => e.type === "quiz" && e.chosenText?.length >= 2 && e.chosen.length >= 2 && e.chosenText[0].includes("→"));
  check("match event recorded in buffer with contract fields", matchEv && matchEv.v === 1 && matchEv.correct === true && Array.isArray(matchEv.chosen));
  const sortEv = events.find((e) => e.type === "quiz" && e.chosen?.length >= 4 && e.answer?.length >= 4 && e.chosenText?.length >= 4);
  check("sort event recorded in buffer with contract fields", sortEv && sortEv.v === 1 && sortEv.correct === true);
  const clozeEv = events.find((e) => e.type === "quiz" && e.chosen?.length === 0 && e.answer?.length === 0 && e.chosenText?.length >= 2);
  check("typed cloze event recorded in buffer with contract fields", clozeEv && clozeEv.v === 1 && clozeEv.correct === true && Array.isArray(clozeEv.answerText));
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
