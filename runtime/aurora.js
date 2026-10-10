/* Aurora Slides runtime: navigation, Keynote-style builds, spring animations,
   Magic Move (View Transitions), quizzes, flashcards, overview, notes and a
   small QA API (window.__aurora) used by the MCP server's browser tools. */
(() => {
  "use strict";
  const CFG = window.AURORA || {};
  const doc = document;
  const root = doc.documentElement;
  const deckEl = doc.getElementById("deck");
  if (!deckEl) return;
  const slides = Array.from(deckEl.querySelectorAll(":scope > .slide"));
  const N = slides.length;
  const bds = new Map(Array.from(doc.querySelectorAll(".backdrops > .bd")).map((b) => [b.dataset.bd, b]));
  const hud = doc.querySelector(".hud");
  const OPT = Object.assign({ progress: true, controls: true, counter: true, parallax: true, magicMove: true, loop: false, resume: true }, CFG.options);
  const T = CFG.t || {};
  const params = new URLSearchParams(location.search);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || params.has("reduced");
  let STATIC = params.has("static");
  const KEY = "aurora:" + (CFG.id || "deck");
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(KEY + ":" + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(KEY + ":" + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const eventsKey = CFG.course && CFG.course.key ? "aurora:course:" + CFG.course.key + ":events" : KEY + ":events";
  const sentKey = eventsKey + ":sent";

  function isoNow() {
    const d = new Date();
    const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, "0");
    const tzMin = -d.getTimezoneOffset();
    const tzSign = tzMin >= 0 ? "+" : "-";
    const tzStr = tzSign + pad(tzMin / 60) + ":" + pad(tzMin % 60);
    return (
      d.getFullYear() + "-" +
      pad(d.getMonth() + 1) + "-" +
      pad(d.getDate()) + "T" +
      pad(d.getHours()) + ":" +
      pad(d.getMinutes()) + ":" +
      pad(d.getSeconds()) + tzStr
    );
  }

  function flushEvents() {
    if (STATIC) return;
    const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!isLocal || !window.AURORA_LIVE) return;
    const deckKey = window.AURORA_LIVE.split("/").pop() || "";
    let list = [];
    try { list = JSON.parse(localStorage.getItem(eventsKey)) || []; } catch { return; }
    let sentIdx = 0;
    try { sentIdx = +(localStorage.getItem(sentKey) || 0); } catch {}
    if (sentIdx < 0 || sentIdx > list.length) sentIdx = 0;
    if (sentIdx >= list.length) return;
    const unsent = list.slice(sentIdx);
    unsent.forEach((ev, i) => {
      fetch("/__aurora/progress?deck=" + encodeURIComponent(deckKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ev),
        keepalive: true,
      }).then((res) => {
        if (res.ok) {
          try {
            const cur = +(localStorage.getItem(sentKey) || 0);
            if (sentIdx + i + 1 > cur) localStorage.setItem(sentKey, String(sentIdx + i + 1));
          } catch {}
        }
      }).catch(() => {});
    });
  }

  function emitEvent(type, payload, sIdx) {
    if (STATIC) return;
    sIdx = sIdx !== undefined ? sIdx : idx;
    const meta = (CFG.slides || [])[sIdx] || {};
    const ev = Object.assign({
      v: 1,
      t: isoNow(),
      course: CFG.course ? CFG.course.title || null : null,
      lesson: CFG.course ? CFG.course.lesson || null : null,
      deck: CFG.deck || CFG.title || "",
      slide: sIdx + 1,
      slideId: meta.rawId !== undefined ? meta.rawId : null,
      type,
    }, payload);
    let list = [];
    try { list = JSON.parse(localStorage.getItem(eventsKey)) || []; } catch { list = []; }
    list.push(ev);
    if (list.length > 1000) list = list.slice(list.length - 1000);
    try { localStorage.setItem(eventsKey, JSON.stringify(list)); } catch {}
    flushEvents();
  }

  function exportProgress() {
    let events = [];
    try { events = JSON.parse(localStorage.getItem(eventsKey)) || []; } catch {}
    const text = events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
    const title = (CFG.course && CFG.course.title) || CFG.title || "progress";
    const slug = title
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "progress";
    const blob = new Blob([text], { type: "application/x-jsonlines;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = url;
    a.download = "aurora-progress-" + slug + ".jsonl";
    doc.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (STATIC) root.classList.add("static");
  let idx = -1;
  let ov = false;
  let sheetOn = false;
  let printing = false;
  let completeSent = false;

  /* ───────────── Springs ───────────── */
  // SwiftUI-style spring (response, dampingFraction) sampled into a CSS linear() easing.
  function spring(response, damping) {
    const w0 = (2 * Math.PI) / response;
    const z = damping;
    const pos = (t) => {
      if (z < 1) {
        const wd = w0 * Math.sqrt(1 - z * z);
        return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
      }
      return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    };
    let end = 0.2;
    for (let t = 0; t < 4; t += 1 / 240) if (Math.abs(1 - pos(t)) > 0.0015) end = t;
    end += 1 / 240;
    const n = Math.min(64, Math.max(16, Math.round(end * 44)));
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(+pos((end * i) / n).toFixed(4));
    pts[n] = 1;
    return { easing: "linear(" + pts.join(", ") + ")", duration: Math.round(end * 1000) };
  }
  const LINEAR = typeof CSS !== "undefined" && CSS.supports && CSS.supports("animation-timing-function", "linear(0, 1)");
  const SPR = LINEAR
    ? { smooth: spring(0.62, 1), snappy: spring(0.5, 0.8), bouncy: spring(0.52, 0.62), gentle: spring(0.95, 1) }
    : {
        smooth: { easing: "cubic-bezier(.16,1,.3,1)", duration: 800 },
        snappy: { easing: "cubic-bezier(.34,1.3,.64,1)", duration: 700 },
        bouncy: { easing: "cubic-bezier(.34,1.56,.64,1)", duration: 800 },
        gentle: { easing: "cubic-bezier(.16,1,.3,1)", duration: 1100 },
      };
  root.style.setProperty("--spring", SPR.snappy.easing);
  root.style.setProperty("--spring-soft", SPR.smooth.easing);

  /* ───────────── Animation presets ───────────── */
  const PRESETS = {
    rise: { k: [{ opacity: 0, translate: "0 34px", filter: "blur(7px)" }, { opacity: 1, translate: "0 0", filter: "blur(0px)" }], s: "smooth" },
    fade: { k: [{ opacity: 0 }, { opacity: 1 }], s: "gentle" },
    blur: { k: [{ opacity: 0, filter: "blur(24px)", scale: "1.04" }, { opacity: 1, filter: "blur(0px)", scale: "1" }], s: "gentle" },
    scale: { k: [{ opacity: 0, scale: ".88" }, { opacity: 1, scale: "1" }], s: "snappy" },
    pop: { k: [{ opacity: 0, scale: ".35" }, { opacity: 1, scale: "1" }], s: "bouncy" },
    zoom: { k: [{ opacity: 0, scale: "1.08", filter: "blur(12px)" }, { opacity: 1, scale: "1", filter: "blur(0px)" }], s: "gentle" },
    wipe: { k: [{ clipPath: "inset(0 0 0 100% round 34px)", scale: "1.05" }, { clipPath: "inset(0 0 0 0% round 34px)", scale: "1" }], s: "gentle" },
    tilt: { k: [{ opacity: 0, translate: "0 70px", rotate: "x 22deg", filter: "blur(6px)" }, { opacity: 1, translate: "0 0", rotate: "x 0deg", filter: "blur(0px)" }], s: "smooth" },
    bar: { k: [{ scale: "1 0" }, { scale: "1 1" }], s: "snappy" },
    hbar: { k: [{ scale: "0 1" }, { scale: "1 1" }], s: "smooth" },
    draw: { k: [{ strokeDasharray: "1 1", strokeDashoffset: "1" }, { strokeDasharray: "1 1", strokeDashoffset: "0" }], s: "gentle", d: 1200, e: "cubic-bezier(.45,0,.2,1)" },
    // Handwriting-like reveal: the line is "written" left to right.
    ink: { k: [{ clipPath: "inset(-40% 100% -40% 0)", opacity: 0.3 }, { clipPath: "inset(-40% 0% -40% 0)", opacity: 1 }], s: "gentle", d: 900, e: "cubic-bezier(.4,.1,.25,1)" },
    // Diagram boxes: in from a soft blur (no transform, so Mermaid's own SVG transforms stay intact).
    dgin: { k: [{ opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)" }], s: "smooth" },
  };
  const QUIET = { k: [{ opacity: 0 }, { opacity: 1 }], s: "gentle", d: 380, e: "ease-out" };

  function isOwn(a) {
    return !(typeof CSSAnimation !== "undefined" && a instanceof CSSAnimation) && !(typeof CSSTransition !== "undefined" && a instanceof CSSTransition);
  }
  function stopAnims(el) {
    if (!el) return;
    for (const a of el.getAnimations({ subtree: true })) if (isOwn(a)) a.cancel();
    stopCounters(el);
  }

  function play(el, name, delay) {
    delay = delay || 0;
    if (name === "words" || name === "spot") return playWords(el, delay, name === "spot");
    if (name === "trace") return trace(el, delay);
    if (name === "ring") {
      const final = el.getAttribute("stroke-dasharray") || "0 100";
      return el.animate([{ strokeDasharray: "0 100" }, { strokeDasharray: final }], { duration: 1300, easing: "cubic-bezier(.22,1,.36,1)", delay, fill: "backwards" });
    }
    let p = reduced ? QUIET : PRESETS[name] || PRESETS.rise;
    if (el.tagName === "TR" && p === PRESETS.rise) p = { k: [{ opacity: 0, translate: "0 22px" }, { opacity: 1, translate: "0 0" }], s: "smooth" };
    const s = SPR[p.s];
    return el.animate(p.k, { duration: p.d || s.duration, easing: p.e || s.easing, delay, fill: "backwards" });
  }

  // An arrow draws itself from its start; its arrowhead appears when the line arrives.
  function trace(el, delay) {
    let L = 0;
    try { L = el.getTotalLength(); } catch { /* not a path */ }
    if (!L || reduced) return el.animate(QUIET.k, { duration: 400, delay, fill: "backwards" });
    const me = el.style.markerEnd, ms = el.style.markerStart;
    el.style.markerEnd = "none";
    el.style.markerStart = "none";
    const a = el.animate(
      [{ strokeDasharray: L + " " + L, strokeDashoffset: L }, { strokeDasharray: L + " " + L, strokeDashoffset: 0 }],
      { duration: Math.min(1200, 350 + L * 1.4), easing: "cubic-bezier(.45,0,.2,1)", delay, fill: "backwards" },
    );
    const back = () => { el.style.markerEnd = me; el.style.markerStart = ms; };
    a.finished.then(back, back);
    return a;
  }

  /* Mermaid diagrams: tag boxes and arrows so they build in (cascade on entrance, or one box per → with steps).
     Arrows are matched to the boxes at their two ends geometrically, so this works for any diagram with boxes. */
  function dgPrepare(s) {
    const box = s.querySelector(".dg-svg");
    const svg = box && box.querySelector("svg");
    if (!svg) return;
    const stepped = box.classList.contains("stepped");
    const base = (+box.parentElement.dataset.d || 0) + 160;
    const tag = (el, a, d, step) => {
      el.dataset.a = a;
      if (d !== undefined) el.dataset.d = String(Math.round(d));
      if (step !== undefined) el.dataset.step = String(step);
    };
    // Sequence diagrams: participants stay, each message draws in order (one per → with steps).
    const msgs = Array.from(svg.querySelectorAll(".messageLine0, .messageLine1"));
    if (msgs.length) {
      const texts = Array.from(svg.querySelectorAll("text.messageText"));
      const paired = texts.length === msgs.length;
      msgs.forEach((m, i) => (stepped ? tag(m, "trace", 0, i + 1) : tag(m, "trace", base + 300 + i * 360)));
      texts.forEach((t, i) => {
        const k = paired ? i : msgs.length - 1;
        stepped ? tag(t, "dgin", 260, k + 1) : tag(t, "dgin", base + 300 + k * 360 + 260);
      });
      return;
    }
    // Charts: bars grow from the axis, lines trace, pie slices fade in turn.
    const bars = Array.from(svg.querySelectorAll('[class*="bar-plot"] rect'));
    const lines = Array.from(svg.querySelectorAll('[class*="line-plot"] path'));
    const slices = Array.from(svg.querySelectorAll("path.pieCircle"));
    if (bars.length || lines.length || slices.length) {
      bars.forEach((b, i) => tag(b, "bar", base + i * 70));
      lines.forEach((l, i) => tag(l, "trace", base + bars.length * 70 + 200 + i * 200));
      slices.forEach((p, i) => tag(p, "dgin", base + i * 140));
      svg.querySelectorAll("text.slice").forEach((t) => tag(t, "fade", base + slices.length * 140 + 200));
      return;
    }
    const nodes = Array.from(svg.querySelectorAll("g.node, g.mindmap-node, g.rough-node, g.timeline-node")).filter((n) => !n.parentElement.closest("g.node, g.mindmap-node, g.rough-node, g.timeline-node"));
    if (!nodes.length) {
      tag(svg, "blur", base - 40);
      return;
    }
    const edges = Array.from(svg.querySelectorAll(".edgePaths path, .edgePath path, path.flowchart-link, path.relation"))
      .filter((e, i, all) => all.indexOf(e) === i && !e.closest("defs, marker"));
    const labels = Array.from(svg.querySelectorAll("g.edgeLabel"));
    const clusters = Array.from(svg.querySelectorAll("g.cluster"));
    const rects = nodes.map((n) => n.getBoundingClientRect());
    const near = (p) => {
      let best = -1, bd = Infinity;
      rects.forEach((r, i) => {
        const d = Math.hypot(Math.max(r.left - p.x, 0, p.x - r.right), Math.max(r.top - p.y, 0, p.y - r.bottom));
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    };
    const ends = edges.map((e) => {
      try {
        const m = e.getScreenCTM();
        const L = e.getTotalLength();
        return [near(e.getPointAtLength(0).matrixTransform(m)), near(e.getPointAtLength(L).matrixTransform(m))];
      } catch { return [-1, -1]; }
    });
    const inCluster = (c) => {
      const r = c.getBoundingClientRect();
      const i = rects.findIndex((q) => q.left + q.width / 2 > r.left && q.left + q.width / 2 < r.right && q.top + q.height / 2 > r.top && q.top + q.height / 2 < r.bottom);
      return i < 0 ? 0 : i;
    };
    // Edge labels follow their arrow when Mermaid emits one label group per edge (empty ones included).
    const labelOf = (i) => (labels.length === edges.length ? i : -1);
    if (stepped) {
      const at = (i) => (i < 0 ? nodes.length : i + 1);
      nodes.forEach((n, i) => tag(n, "dgin", 0, i + 1));
      clusters.forEach((c) => tag(c, "dgin", 0, inCluster(c) + 1));
      const es = ends.map(([a, b]) => Math.max(at(a), at(b)));
      edges.forEach((e, i) => tag(e, "trace", 120, es[i]));
      labels.forEach((l, i) => tag(l, "dgin", 520, labelOf(i) >= 0 ? es[i] : nodes.length));
      return;
    }
    const per = Math.max(28, Math.min(80, 1500 / nodes.length));
    const when = nodes.map((n, i) => base + i * per);
    nodes.forEach((n, i) => tag(n, "dgin", when[i]));
    clusters.forEach((c) => tag(c, "dgin", Math.max(0, base - 80)));
    const edgeAt = ends.map(([a, b]) => Math.max(a < 0 ? base : when[a], b < 0 ? base : when[b]) + 260);
    edges.forEach((e, i) => tag(e, "trace", edgeAt[i]));
    labels.forEach((l, i) => tag(l, "dgin", (labelOf(i) >= 0 ? edgeAt[i] : base + nodes.length * per) + 480));
  }

  function playWords(el, delay, spot) {
    const words = el.querySelectorAll(".w");
    if (!words.length) return play(el, "blur", delay);
    if (reduced) return el.animate(QUIET.k, { duration: 400, delay, fill: "backwards" });
    if (spot) {
      words.forEach((w, i) => w.animate([{ opacity: 0.16 }, { opacity: 1 }], { duration: 520, easing: "ease-out", delay: delay + i * 120, fill: "backwards" }));
      return;
    }
    const per = Math.max(24, Math.min(60, 900 / words.length));
    const s = SPR.smooth;
    words.forEach((w, i) =>
      w.animate(
        [{ opacity: 0, translate: "0 .38em", filter: "blur(10px)" }, { opacity: 1, translate: "0 0", filter: "blur(0px)" }],
        { duration: s.duration, easing: s.easing, delay: delay + i * per, fill: "backwards" },
      ),
    );
  }

  /* ───────────── Count-up numbers ───────────── */
  const counters = new Set();
  function delayOf(el) {
    const host = el.closest("[data-d]");
    return host ? +host.dataset.d || 0 : 0;
  }
  function countUp(el, delay) {
    const target = parseFloat(el.dataset.count);
    if (!isFinite(target)) return;
    const dec = +el.dataset.dec || 0;
    let fmt;
    try { fmt = new Intl.NumberFormat(CFG.lang || "vi", { minimumFractionDigits: dec, maximumFractionDigits: dec }); } catch { fmt = { format: (v) => v.toFixed(dec) }; }
    const finalText = el.textContent;
    const job = { el, finalText, done: false };
    counters.add(job);
    el.textContent = fmt.format(0);
    const dur = 1500;
    let t0 = null;
    const tick = (now) => {
      if (job.done) return;
      if (t0 === null) t0 = now + delay;
      const t = Math.min(1, Math.max(0, (now - t0) / dur));
      const e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      if (t >= 1) { el.textContent = finalText; job.done = true; counters.delete(job); return; }
      el.textContent = fmt.format(target * e);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function stopCounters(scope) {
    for (const job of counters) {
      if (!scope || scope.contains(job.el)) { job.done = true; job.el.textContent = job.finalText; counters.delete(job); }
    }
  }

  /* ───────────── Steps (Keynote builds) ───────────── */
  function stepEls(s) {
    if (!s._steps) s._steps = Array.from(s.querySelectorAll("[data-step]"));
    return s._steps;
  }
  function maxStep(s) {
    if (s._max === undefined) {
      const sc = s.querySelector(".xp, .pl");
      s._max = sc ? Math.max(0, (+sc.dataset.stages || 1) - 1) : stepEls(s).reduce((m, el) => Math.max(m, +el.dataset.step || 0), 0);
    }
    return s._max;
  }
  function setStep(s, n, animate) {
    s._step = n;
    s.dataset.step = String(n);
    for (const el of stepEls(s)) {
      const k = +el.dataset.step;
      const shown = k <= n;
      const was = !el.classList.contains("pending");
      el.classList.toggle("pending", !shown);
      if (el.classList.contains("blank")) el.classList.toggle("on", shown || !!el._open);
      else if (shown && !was && animate) revealStep(el);
      if (el.classList.contains("fb-zcap")) el.classList.toggle("cur", k === n);
    }
    if (s._hasXp === undefined) s._hasXp = !!s.querySelector(".xp");
    if (s._hasXp) {
      const x = xpInit(s);
      xpTo(s, (STATIC || printing || ov) && n === maxStep(s) ? xpExploded(x) : n, animate && !STATIC);
    }
    if (s._hasPl === undefined) s._hasPl = !!s.querySelector(".pl");
    if (s._hasPl) {
      const x = plInit(s);
      if (x) {
        plTo(s, n, animate && !STATIC && !printing && !ov);
        if (animate && x.recall && n === maxStep(s)) plDone(x);
      }
    }
    const cam = s.querySelector(".fb-cam[data-zoom]");
    if (cam) camTo(cam, n);
    if (s.dataset.type === "predict") {
      const term = s.querySelector(".pred-term");
      if (term) {
        const runStep = +term.dataset.runStep || 1;
        const outPre = term.querySelector(".term-output");
        const outCode = outPre && outPre.querySelector("code");
        const raw = outPre ? outPre.dataset.raw || "" : "";
        const body = term.querySelector(".term-body");
        if (n < runStep) {
          term.classList.remove("running", "done");
          if (term._printTimer) { clearInterval(term._printTimer); term._printTimer = 0; }
          if (outCode) outCode.textContent = "";
        } else {
          if (!term.classList.contains("done") && !term.classList.contains("running")) {
            if (animate && !STATIC && !printing && !ov && !reduced && n === runStep) {
              term.classList.add("running");
              const lines = raw.split("\n");
              const totalLines = lines.length;
              const lineDelay = Math.max(16, Math.min(50, Math.floor(1600 / Math.max(1, totalLines))));
              let curLine = 0;
              if (outCode) outCode.textContent = "";
              term._printTimer = setInterval(() => {
                curLine++;
                if (outCode) outCode.textContent = lines.slice(0, curLine).join("\n");
                if (body) body.scrollTop = body.scrollHeight;
                if (curLine >= totalLines) {
                  clearInterval(term._printTimer);
                  term._printTimer = 0;
                  term.classList.remove("running");
                  term.classList.add("done");
                }
              }, lineDelay);
            } else {
              if (term._printTimer) { clearInterval(term._printTimer); term._printTimer = 0; }
              term.classList.remove("running");
              term.classList.add("done");
              if (outCode) outCode.textContent = raw;
              if (body) body.scrollTop = body.scrollHeight;
            }
          }
        }
      }
    }
    const cw = s.querySelectorAll(".cw-step");
    if (cw.length) {
      let lines = "";
      cw.forEach((li) => {
        const k = +li.dataset.step;
        li.classList.toggle("cur", k === n);
        li.classList.toggle("past", k < n);
        if (k === n) lines = li.dataset.lines || "";
      });
      const pre = s.querySelector(".code-pre");
      if (pre) {
        const set = new Set(lines.split(" ").filter(Boolean));
        pre.classList.toggle("focus", set.size > 0);
        pre.querySelectorAll(".ln").forEach((l) => l.classList.toggle("hl", set.has(l.dataset.l)));
      }
    }
    if (s.classList.contains("t-hotspots") && s.classList.contains("stepped")) {
      s.querySelectorAll(".hs-item").forEach((it) => {
        const k = +it.dataset.step;
        it.classList.toggle("cur", k === n);
        it.classList.toggle("past", k < n);
      });
      s.querySelectorAll(".hs-pin").forEach((p) => p.classList.toggle("cur", +p.dataset.step === n));
    }
  }
  /* ───────────── Exploded view (scroll-scrubbed, Apple product-page style) ───────────── */
  const smooth = (t) => t * t * (3 - 2 * t);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function xpInit(s) {
    if (s._xp) return s._xp;
    const el = s.querySelector(".xp");
    if (!el) return null;
    s._xp = {
      el, p: 0, raf: 0, snap: 0,
      n: +el.dataset.n || 0, photo: el.dataset.photo === "1", focus: el.dataset.focus === "1", stages: +el.dataset.stages || 1,
      scene: el.querySelector(".xp-scene"),
      layers: Array.from(el.querySelectorAll(".xp-layer")),
      labels: Array.from(el.querySelectorAll(".xp-label")),
      lines: Array.from(el.querySelectorAll(".xp-line")),
      dots: Array.from(el.querySelectorAll(".xp-dot")),
    };
    return s._xp;
  }
  function xpExploded(x) {
    return x.photo ? 2 : 1;
  }
  function xpRender(s) {
    const x = s._xp;
    if (!x) return;
    const p = x.p;
    const z = x.photo ? smooth(clamp01(p)) : 1;
    const e = smooth(clamp01(p - (x.photo ? 1 : 0)));
    const f = p - xpExploded(x) - 1;
    const fo = x.focus ? smooth(clamp01(f + 1)) : 0;
    x.el.style.setProperty("--z", z.toFixed(4));
    x.el.style.setProperty("--e", e.toFixed(4));
    x.el.style.setProperty("--fo", fo.toFixed(4));
    for (let i = 0; i < x.n; i++) {
      const w = x.focus ? smooth(Math.max(0, 1 - Math.abs(f - i))).toFixed(4) : "0";
      for (const list of [x.layers, x.labels, x.lines, x.dots]) if (list[i]) list[i].style.setProperty("--w", w);
    }
    xpPlace(s);
  }
  function xpPlace(s) {
    const x = s._xp;
    const stage = s.querySelector(".sl-stage");
    if (!x || !x.scene || !stage) return;
    const k = stage.getBoundingClientRect().width / 1920 || 1;
    const sr = x.scene.getBoundingClientRect();
    const colX = x.scene.clientWidth * 0.62;
    x.layers.forEach((L, i) => {
      // Labels stay at the part's resting place; the dot follows the part when it lifts into focus.
      const base = L.getBoundingClientRect();
      const face = L.querySelector(".xp-face");
      const r = face ? face.getBoundingClientRect() : base;
      if (!r.width) return;
      const cy = (base.top + base.height / 2 - sr.top) / k;
      const ay = (r.top + r.height / 2 - sr.top) / k;
      const ax = (r.left + r.width * 0.72 - sr.left) / k;
      const lab = x.labels[i];
      if (lab) {
        lab.style.setProperty("--y", cy.toFixed(1) + "px");
        lab.style.setProperty("--x", colX.toFixed(1) + "px");
      }
      if (x.lines[i]) x.lines[i].setAttribute("d", "M" + ax.toFixed(1) + "," + ay.toFixed(1) + " L" + (colX - 60).toFixed(1) + "," + cy.toFixed(1) + " L" + (colX - 22).toFixed(1) + "," + cy.toFixed(1));
      if (x.dots[i]) {
        x.dots[i].setAttribute("cx", ax.toFixed(1));
        x.dots[i].setAttribute("cy", ay.toFixed(1));
      }
    });
  }
  function xpTo(s, target, animate) {
    const x = s._xp;
    if (!x) return;
    cancelAnimationFrame(x.raf);
    clearTimeout(x.snap);
    if (!animate || reduced || Math.abs(target - x.p) < 0.001) {
      x.p = target;
      xpRender(s);
      return;
    }
    const from = x.p;
    const t0 = performance.now();
    const dur = 1050 + Math.min(3, Math.abs(target - from)) * 180;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      x.p = from + (target - from) * inOut(t);
      xpRender(s);
      if (t < 1) x.raf = requestAnimationFrame(tick);
    };
    x.raf = requestAnimationFrame(tick);
  }
  // Wheel / trackpad: scrub the exploded view continuously, otherwise step through builds and slides.
  let wheelAcc = 0, wheelLock = false, wheelTimer = 0;
  function holdWheel() {
    wheelLock = true;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelLock = false; wheelAcc = 0; }, 260);
  }
  addEventListener("wheel", (e) => {
    if (ov || e.ctrlKey || STATIC) return;
    if (e.target.closest && e.target.closest(".notes-panel, .help-card")) return;
    const s = slides[idx];
    if (!s) return;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    // Scroll-scrubbed slides: the exploded view and the memory-palace walk.
    const x = s._hasXp ? xpInit(s) : s._hasPl ? plInit(s) : null;
    if (!x && OPT.wheel === false) return;
    e.preventDefault();
    if (wheelLock) { holdWheel(); return; }
    if (x) {
      const render = s._hasXp ? xpRender : plRender;
      const to = s._hasXp ? xpTo : plTo;
      const max = x.stages - 1;
      if ((x.p >= max - 0.001 && dy > 0) || (x.p <= 0.001 && dy < 0)) {
        wheelAcc += dy;
        if (Math.abs(wheelAcc) > 150) {
          wheelAcc = 0;
          holdWheel();
          dy > 0 ? next() : prev();
        }
        return;
      }
      wheelAcc = 0;
      cancelAnimationFrame(x.raf);
      x.p = Math.max(0, Math.min(max, x.p + dy / 560));
      render(s);
      const st = Math.round(x.p);
      if (st !== s._step) {
        s._step = st;
        s.dataset.step = String(st);
        if (s._hasPl && x.recall && st === max) plDone(x);
        updateHud();
      }
      clearTimeout(x.snap);
      x.snap = setTimeout(() => to(s, Math.round(x.p), true), 300);
      return;
    }
    wheelAcc += dy;
    if (Math.abs(wheelAcc) > 70) {
      const d = wheelAcc;
      wheelAcc = 0;
      holdWheel();
      d > 0 ? next() : prev();
    }
  }, { passive: false });

  /* Camera moves on image slides: glide to a detail, centered but never past the photo's edges. */
  function camTo(cam, n) {
    let list = [];
    try { list = JSON.parse(cam.dataset.zoom || "[]"); } catch { /* ignore */ }
    const z = n > 0 ? list[n - 1] : null;
    if (!z || STATIC || printing) {
      cam.style.transform = "";
      return;
    }
    const fx = z[0] / 100, fy = z[1] / 100, sc = z[2] || 2.4;
    const lim = (t, f) => Math.max((1 - f) * (1 - sc), Math.min(f * (sc - 1), t));
    const tx = lim(0.5 - fx, fx), ty = lim(0.5 - fy, fy);
    cam.style.transformOrigin = z[0] + "% " + z[1] + "%";
    cam.style.transform = "translate(" + (tx * 100).toFixed(2) + "%, " + (ty * 100).toFixed(2) + "%) scale(" + sc + ")";
  }

  /* ───────────── Memory palace: a camera walks the route, one idea per stop ─────────────
     Stages: learn = intro, one per stop, end map; recall = intro, two per stop (ask, reveal), end map.
     p is a continuous stage position so steps tween and the wheel scrubs, exactly like the exploded view. */
  const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function plInit(s) {
    if (s._pl) return s._pl;
    const el = s.querySelector(".pl");
    const view = s.querySelector(".pl-view");
    if (!el || !view) return null;
    const pins = Array.from(view.querySelectorAll(".pl-pin"));
    const x = {
      el, view, pins, world: view.querySelector(".pl-world"),
      pts: pins.map((p) => [(+p.dataset.x || 0) / 100, (+p.dataset.y || 0) / 100]),
      n: pins.length, recall: el.dataset.mode === "recall", z: +el.dataset.z || 1.6, stages: +el.dataset.stages || 2,
      cards: Array.from(el.querySelectorAll(".pl-card")), svg: view.querySelector(".pl-route"), legs: [],
      lead: el.querySelector(".pl-lead"), end: el.querySelector(".pl-end"), head: el.querySelector(":scope > .sl-head"), textKey: "",
      ar: parseFloat(view.style.getPropertyValue("--ar")) || 16 / 9,
      p: 0, raf: 0, snap: 0, rate: new Map(), counted: false,
      // A drawn map is transparent over the backdrop, so the camera may pass its edges; a picture must keep covering the view.
      map: !view.classList.contains("has-img"),
    };
    s._pl = x;
    // The picture decides the world's aspect ratio (markers are % of the picture), known once it loads.
    const img = view.querySelector("img.pl-img");
    const fit = () => {
      if (view.dataset.fixed || !img || !img.naturalWidth || !img.naturalHeight) return;
      const ar = img.naturalWidth / img.naturalHeight;
      if (Math.abs(ar - x.ar) < 0.005) return;
      x.ar = ar;
      view.style.setProperty("--ar", ar.toFixed(4));
      plRoute(x);
      plRender(s);
    };
    plRoute(x);
    if (img && !img.complete) img.addEventListener("load", fit, { once: true });
    else fit();
    return x;
  }
  // Smooth route through the stops (Catmull-Rom as cubic Béziers), one path per leg so legs draw as the camera walks.
  function plRoute(x) {
    x.legs = [];
    if (!x.svg) return;
    if (x.n < 2) { x.svg.innerHTML = ""; return; }
    const W = 1000, H = 1000 / x.ar;
    const P = x.pts.map((q) => [q[0] * W, q[1] * H]);
    const f = (q) => q[0].toFixed(1) + "," + q[1].toFixed(1);
    let all = "M" + f(P[0]);
    let legs = "";
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const seg = " C" + f([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + " " + f([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + " " + f(p2);
      all += seg;
      legs += '<path class="pl-leg" pathLength="1" d="M' + f(p1) + seg + '"/>';
    }
    x.svg.setAttribute("viewBox", "0 0 " + W + " " + H.toFixed(2));
    x.svg.setAttribute("preserveAspectRatio", "none");
    x.svg.innerHTML = '<path class="pl-trail" d="' + all + '"/>' + legs;
    x.legs = Array.from(x.svg.querySelectorAll(".pl-leg"));
  }
  // cam: stop index, -1 intro, -2 end (whole place). w: how far along the route the walk is. card: stop shown. reveal: idea visible.
  function plStage(x, st) {
    const last = x.stages - 1;
    if (st <= 0) return { cam: -1, w: -1, card: -1, reveal: false };
    if (st >= last) return { cam: -2, w: x.n - 1, card: -1, reveal: true };
    if (!x.recall) return { cam: st - 1, w: st - 1, card: st - 1, reveal: true };
    const i = Math.floor((st - 1) / 2);
    return { cam: i, w: i, card: i, reveal: (st - 1) % 2 === 1 };
  }
  // Card on the left for stops on the right half of the place, otherwise on the right.
  const plSide = (x, i) => (x.pts[i] && x.pts[i][0] > 0.58 ? "l" : "r");
  function plGeo(s, x) {
    const V = x.view.clientWidth, Hv = x.view.clientHeight, W = x.world.offsetWidth, H = x.world.offsetHeight;
    if (!V || !Hv || !W || !H) return null;
    const vr = x.view.getBoundingClientRect();
    const st = s.querySelector(".sl-stage").getBoundingClientRect();
    const k = st.width / 1920 || 1;
    const fx = vr.width / V || 1, fy = vr.height / Hv || 1;
    // Where a stop lands on screen: in the free part of the stage beside its card.
    const at = (sx, sy) => [(st.left + sx * k - vr.left) / fx, (st.top + sy * k - vr.top) / fy];
    return { V, Hv, W, H, ox: x.world.offsetLeft, oy: x.world.offsetTop, tr: at(560, 540), tl: at(1360, 540) };
  }
  const plClamp = (x, v, lo, hi) => (x.map ? v : clampTo(v, lo, hi));
  // Camera as the world point at the view centre (u, v) plus zoom, so stops interpolate smoothly and survive resizes.
  function plCam(x, cam, g) {
    if (cam < 0) return { u: 0.5, v: 0.5, z: 1 };
    const q = x.pts[cam], z = x.z;
    const t = plSide(x, cam) === "l" ? g.tl : g.tr;
    const X = plClamp(x, t[0] - g.ox - z * q[0] * g.W, g.V - g.ox - z * g.W, -g.ox);
    const Y = plClamp(x, t[1] - g.oy - z * q[1] * g.H, g.Hv - g.oy - z * g.H, -g.oy);
    return { u: (g.V / 2 - g.ox - X) / (z * g.W), v: (g.Hv / 2 - g.oy - Y) / (z * g.H), z };
  }
  function plRender(s) {
    const x = s._pl;
    if (!x) return;
    const last = x.stages - 1;
    const p = clampTo(x.p, 0, last);
    const a = Math.floor(p), b = Math.min(last, a + 1), t = p - a;
    const A = plStage(x, a), B = plStage(x, b);
    const g = plGeo(s, x);
    if (g) {
      const ca = plCam(x, A.cam, g), cb = plCam(x, B.cam, g);
      const z = Math.exp(Math.log(ca.z) + (Math.log(cb.z) - Math.log(ca.z)) * t);
      const u = ca.u + (cb.u - ca.u) * t, v = ca.v + (cb.v - ca.v) * t;
      const X = plClamp(x, g.V / 2 - g.ox - z * u * g.W, g.V - g.ox - z * g.W, -g.ox);
      const Y = plClamp(x, g.Hv / 2 - g.oy - z * v * g.H, g.Hv - g.oy - z * g.H, -g.oy);
      x.world.style.transform = "translate(" + X.toFixed(2) + "px," + Y.toFixed(2) + "px) scale(" + z.toFixed(4) + ")";
      x.world.style.setProperty("--cz", z.toFixed(4));
    }
    const w = A.w + (B.w - A.w) * t;
    x.legs.forEach((L, i) => {
      const f = clamp01(w - i);
      L.style.strokeDashoffset = (1 - f).toFixed(4);
      L.style.opacity = f > 0.002 ? "1" : "0";
    });
    const st = Math.round(p);
    const S = plStage(x, st);
    const settled = Math.abs(p - st) < 0.22;
    const at = st === 0 ? "intro" : st === last ? "end" : "stop";
    x.el.dataset.at = at;
    s.dataset.pl = at;
    x.pins.forEach((pin, i) => {
      const seen = S.cam === -2 || i <= S.w;
      pin.classList.toggle("seen", seen);
      pin.classList.toggle("shown", x.recall ? S.cam === -2 || i < S.card || (i === S.card && S.reveal) : seen);
      pin.classList.toggle("cur", i === S.card);
    });
    x.cards.forEach((card, i) => {
      const on = i === S.card && settled;
      if (on) {
        const l = plSide(x, i) === "l";
        card.classList.toggle("side-l", l);
        card.classList.toggle("side-r", !l);
      }
      card.classList.toggle("on", on);
      card.classList.toggle("revealed", !x.recall || (i === S.card && S.reveal));
    });
    plLead(s, x, S, st, p);
    if (x.recall && at === "end") plScore(x);
    if (g && S.cam < 0) plText(s, x, g, at);
  }
  // At the intro and the end the whole place is on screen: put the title or the caption in the first free
  // spot of the left (else right) column, so it never covers a stop or its label.
  function plText(s, x, g, at) {
    const el = at === "intro" ? x.head : x.end;
    const key = at + "|" + g.V + "x" + g.Hv;
    if (!el || x.textKey === key) return;
    x.textKey = key;
    const stage = s.querySelector(".sl-stage").getBoundingClientRect();
    const k = stage.width / 1920 || 1;
    const vr = x.view.getBoundingClientRect();
    const fx = vr.width / g.V || 1, fy = vr.height / g.Hv || 1;
    const pk = parseFloat(getComputedStyle(x.view).getPropertyValue("--pk")) || k;
    const boxes = x.pins.map((pin, i) => {
      const sx = (vr.left + (g.ox + x.pts[i][0] * g.W) * fx - stage.left) / k;
      const sy = (vr.top + (g.oy + x.pts[i][1] * g.H) * fy - stage.top) / k;
      const tag = pin.querySelector(".pl-tag");
      const f = pk / k;
      const half = Math.max(36, ((tag ? tag.offsetWidth : 0) * f) / 2);
      return { l: sx - half - 16, r: sx + half + 16, t: sy - 40 * f, b: sy + (52 + (tag ? tag.offsetHeight : 0)) * f };
    });
    const w = el.offsetWidth, h = el.offsetHeight;
    let spot = null;
    for (const left of [120, 1800 - w]) {
      const busy = boxes.filter((b) => b.r > left && b.l < left + w).sort((a, b) => a.t - b.t);
      let y = 100;
      for (const b of busy) {
        if (b.t - y >= h) break;
        if (b.b > y) y = b.b;
      }
      if (y + h <= 990) { spot = { left, top: y }; break; }
    }
    if (!spot) spot = { left: 120, top: 100 };
    el.style.left = spot.left + "px";
    el.style.top = Math.round(spot.top) + "px";
    s.dataset.plSide = spot.left > 960 ? "r" : "l";
  }
  // Leader line from the anchor point on the map to the card, shown once the camera has arrived.
  function plLead(s, x, S, st, p) {
    if (!x.lead) return;
    const op = S.card >= 0 ? clamp01(1 - Math.abs(p - st) * 5) : 0;
    x.lead.style.opacity = op.toFixed(3);
    if (op <= 0) return;
    const stage = s.querySelector(".sl-stage").getBoundingClientRect();
    const k = stage.width / 1920 || 1;
    const dot = x.pins[S.card].querySelector(".pl-dot").getBoundingClientRect();
    const card = x.cards[S.card].getBoundingClientRect();
    if (!dot.width || !card.width) return;
    const px = (dot.left + dot.width / 2 - stage.left) / k, py = (dot.top + dot.height / 2 - stage.top) / k;
    const ex = ((plSide(x, S.card) === "l" ? card.right : card.left) - stage.left) / k;
    const ct = (card.top - stage.top) / k, cb = (card.bottom - stage.top) / k;
    const ey = clampTo(py, ct + 48, Math.max(ct + 48, cb - 48));
    const sx = px + (ex > px ? 1 : -1) * (dot.width / 2 / k + 10);
    const mx = (sx + ex) / 2;
    x.lead.querySelector("path").setAttribute("d", "M" + sx.toFixed(1) + "," + py.toFixed(1) + " C" + mx.toFixed(1) + "," + py.toFixed(1) + " " + mx.toFixed(1) + "," + ey.toFixed(1) + " " + ex.toFixed(1) + "," + ey.toFixed(1));
    const c = x.lead.querySelector("circle");
    c.setAttribute("cx", ex.toFixed(1));
    c.setAttribute("cy", ey.toFixed(1));
  }
  function plTo(s, target, animate) {
    const x = s._pl;
    if (!x) return;
    cancelAnimationFrame(x.raf);
    clearTimeout(x.snap);
    // Ask → reveal happens in place: no camera move, no tween.
    const same = Math.abs(target - x.p) <= 1 && plStage(x, Math.round(x.p)).cam === plStage(x, target).cam;
    if (!animate || reduced || same || Math.abs(target - x.p) < 0.001) {
      x.p = target;
      plRender(s);
      return;
    }
    const from = x.p;
    const t0 = performance.now();
    const dur = 1300 + Math.min(3, Math.abs(target - from)) * 220;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      x.p = from + (target - from) * inOut(t);
      plRender(s);
      if (t < 1) x.raf = requestAnimationFrame(tick);
    };
    x.raf = requestAnimationFrame(tick);
  }
  // Recall walk: the learner rates each stop (click, or keys 1 / 2), then the walk moves on.
  function plRate(s, r) {
    const x = s && s._pl;
    if (!x || !x.recall) return false;
    const st = Math.round(x.p);
    const S = plStage(x, st);
    if (S.card < 0 || !S.reveal) return false;
    x.rate.set(S.card, r);
    x.pins[S.card].classList.toggle("ok", r === 1);
    x.pins[S.card].classList.toggle("miss", r === 0);
    x.cards[S.card].classList.toggle("rated-ok", r === 1);
    x.cards[S.card].classList.toggle("rated-miss", r === 0);

    const sIdx = slides.indexOf(s);
    const cardEl = x.cards[S.card];
    const pinEl = x.pins[S.card];
    const place = (cardEl && cardEl.dataset.place) || (pinEl && pinEl.dataset.place) || "";
    const item = (cardEl && cardEl.dataset.item) || (pinEl && pinEl.dataset.item) || "";
    const palaceId = (x.el && x.el.dataset.palace) || (s && s.dataset.palace) || "palace";
    emitEvent("recall", {
      palace: palaceId,
      station: S.card + 1,
      place: place,
      item: item,
      rating: r === 1 ? "got" : "missed",
    }, sIdx);

    setTimeout(() => { if (slides[idx] === s && Math.round(x.p) === st && s._step === st) next(); }, 420);
    return true;
  }
  function plScore(x) {
    if (!x.end) return;
    const sc = x.end.querySelector(".pl-score");
    if (!sc) return;
    if (!x.rate.size) { sc.textContent = ""; return; }
    let got = 0;
    x.rate.forEach((v) => { got += v ? 1 : 0; });
    const d = x.end.dataset;
    sc.textContent = d.got + " " + got + "/" + x.n + " " + d.unit + ". " + (got === x.n ? d.all : d.miss);
  }
  // A finished recall walk counts as a review: the course page schedules the next one (spaced repetition).
  function plDone(x) {
    if (x.counted || STATIC) return;
    x.counted = true;
    const pr = store.get("progress") || {};
    store.set("progress", Object.assign({}, pr, { rv: (pr.rv || 0) + 1, rt: Date.now() }));
  }

  function revealStep(el) {
    if (el.classList.contains("cw-step")) return;
    play(el, el.dataset.a || "rise", +el.dataset.d || 0);
    el.querySelectorAll("[data-count]").forEach((c) => countUp(c, 200));
  }

  /* ───────────── Entrances ───────────── */
  function playIn(s, fwd) {
    stopAnims(s);
    if (!fwd || STATIC) return;
    for (const el of s.querySelectorAll("[data-a]")) {
      if (el.hasAttribute("data-step") || el.dataset.mm) continue;
      if (el.closest(".pending")) continue;
      play(el, el.dataset.a, +el.dataset.d || 0);
    }
    s.querySelectorAll("[data-count]").forEach((c) => {
      if (!c.closest(".pending")) countUp(c, delayOf(c) + 160);
    });
  }

  function settle(s) {
    s = s || slides[idx];
    if (!s) return;
    // Scripted camera moves jump to where the current step is heading.
    if (s._xp) xpTo(s, (STATIC || printing || ov) && (s._step || 0) === maxStep(s) ? xpExploded(s._xp) : s._step || 0, false);
    if (s._pl) plTo(s, s._step || 0, false);
    if (s.dataset.type === "predict") {
      const term = s.querySelector(".pred-term");
      if (term && term._printTimer) {
        clearInterval(term._printTimer);
        term._printTimer = 0;
        term.classList.remove("running");
        term.classList.add("done");
        const outPre = term.querySelector(".term-output");
        const outCode = outPre && outPre.querySelector("code");
        if (outCode && outPre) outCode.textContent = outPre.dataset.raw || "";
        const body = term.querySelector(".term-body");
        if (body) body.scrollTop = body.scrollHeight;
      }
    }
    for (const a of s.getAnimations({ subtree: true })) {
      const it = a.effect && a.effect.getTiming ? a.effect.getTiming().iterations : 1;
      if (it === Infinity) continue;
      try { a.finish(); } catch { /* not finishable */ }
    }
    stopCounters(s);
  }

  /* ───────────── Stage scaling & text fitting ───────────── */
  function scale() {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    root.style.setProperty("--k", k.toFixed(5));
    if (ov || sheetOn) layoutTiles();
    const cur = slides[idx];
    if (cur && cur._pl) plRender(cur);
  }
  addEventListener("resize", scale);
  scale();

  // Real content only: decorative layers (orb, big section number, glows, arrows) may bleed on purpose.
  const CONTENT =
    "h1,h2,h3,p,li,blockquote,figure,table,dl,.card,.cmp-col,.window,.st,.pr-item,.tl-ev,.cy-label,.cy-badge,.qz-opt,.fcard,.hs-img," +
    ".ag-item,.sm-score,.dn-ring,.dn-legend,.chart-svg,.hbars,.fm-main,.vd-frame,.eyebrow,.kicker,.meta,.source,.body,.cz-text,.cz-hint,.ch-legend";
  const CLIP_BOXES = ".card-in, .fc-face, .cmp-col, .pr-item, .tb-wrap";
  function overflowing(s) {
    const stage = s.querySelector(".sl-stage");
    const inn = s.querySelector(".sl-in");
    if (!stage || !inn) return false;
    const b = stage.getBoundingClientRect();
    const k = b.width / 1920 || 1;
    const L = b.left + 24 * k, T = b.top + 16 * k, R = b.right - 24 * k, B = b.bottom - 24 * k;
    for (const el of inn.querySelectorAll(CONTENT)) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (r.right > R + 1 || r.bottom > B + 1 || r.left < L - 1 || r.top < T - 1) return true;
    }
    for (const box of inn.querySelectorAll(CLIP_BOXES)) if (box.scrollHeight > box.clientHeight + 2) return true;
    return false;
  }
  function animating(s) {
    return s.getAnimations({ subtree: true }).some((a) => isOwn(a) && a.playState === "running");
  }
  function fitSlide(s) {
    if (s.dataset.type === "html" || animating(s)) return;
    s.style.removeProperty("--kt");
    let kt = 1;
    for (let i = 0; i < 9 && overflowing(s); i++) {
      kt = +(kt - 0.04).toFixed(2);
      s.style.setProperty("--kt", String(kt));
    }
    s.dataset.kt = String(kt);
  }

  /* ───────────── Backdrops ───────────── */
  let curBd = null;
  function showBackdrop(key, instant) {
    const el = bds.get(key);
    if (!el || el === curBd) return;
    if (instant) {
      el.style.transition = "none";
      if (curBd) curBd.style.transition = "none";
    }
    if (curBd) curBd.classList.remove("on");
    el.classList.add("on");
    if (instant) {
      void el.offsetWidth;
      el.style.transition = "";
      if (curBd) curBd.style.transition = "";
    }
    curBd = el;
  }

  /* ───────────── Transitions ───────────── */
  const IO = "cubic-bezier(.65,0,.35,1)";
  const TRANS = {
    fade: () => [[{ opacity: 1 }, { opacity: 0 }], [{ opacity: 0 }, { opacity: 1 }], 620],
    slide: (f) => {
      const d = f ? 1 : -1;
      return [[{ translate: "0 0", opacity: 1 }, { translate: -d * 7 + "% 0", opacity: 0 }], [{ translate: d * 7 + "% 0", opacity: 0 }, { translate: "0 0", opacity: 1 }], 760];
    },
    zoom: (f) => [
      [{ scale: "1", opacity: 1, filter: "blur(0px)" }, { scale: f ? "1.1" : ".92", opacity: 0, filter: "blur(14px)" }],
      [{ scale: f ? ".94" : "1.08", opacity: 0 }, { scale: "1", opacity: 1 }],
      780,
    ],
    blur: () => [[{ filter: "blur(0px)", opacity: 1 }, { filter: "blur(26px)", opacity: 0 }], [{ filter: "blur(26px)", opacity: 0 }, { filter: "blur(0px)", opacity: 1 }], 820],
    cube: (f) => {
      const d = f ? 1 : -1;
      return [
        [{ rotate: "y 0deg", translate: "0 0", opacity: 1 }, { rotate: "y " + -d * 32 + "deg", translate: -d * 34 + "% 0", opacity: 0 }],
        [{ rotate: "y " + d * 32 + "deg", translate: d * 34 + "% 0", opacity: 0 }, { rotate: "y 0deg", translate: "0 0", opacity: 1 }],
        950,
      ];
    },
  };

  function visibleIn(el) {
    return !el.closest(".pending");
  }
  function morphPairs(a, b) {
    const map = new Map();
    a.querySelectorAll("[data-m]").forEach((el) => {
      if (!map.has(el.dataset.m) && visibleIn(el)) map.set(el.dataset.m, el);
    });
    const pairs = [];
    const used = new Set();
    b.querySelectorAll("[data-m]").forEach((el) => {
      const m = el.dataset.m;
      const o = map.get(m);
      if (o && !used.has(m) && visibleIn(el)) {
        used.add(m);
        pairs.push([o, el]);
      }
    });
    return pairs.slice(0, 16);
  }

  let busy = null;
  function swap(prev, next, fwd) {
    if (prev) {
      prev.classList.remove("on", "fwd");
      prev.inert = true;
    }
    next.classList.add("on");
    next.classList.toggle("fwd", !!fwd);
    next.inert = false;
    root.dataset.tone = next.dataset.tone || root.dataset.tone;
  }

  function transition(prev, next, fwd, instant) {
    const type = reduced ? "fade" : next.dataset.transition || CFG.transition || "fade";
    showBackdrop(next.dataset.bd, instant || !prev);
    if (busy) busy();
    if (!prev || prev === next || instant || type === "none" || STATIC) {
      swap(prev, next, fwd);
      if (prev && prev !== next) stopAnims(prev);
      playIn(next, fwd && !instant && !STATIC);
      return;
    }
    const pairs = OPT.magicMove && !reduced && next.dataset.morph !== "0" && doc.startViewTransition ? morphPairs(prev, next) : [];
    if (pairs.length) {
      pairs.forEach(([a, b], i) => {
        a.style.viewTransitionName = "m" + i;
        b.style.viewTransitionName = "m" + i;
        b.dataset.mm = "1";
      });
      let vt;
      try {
        vt = doc.startViewTransition(() => {
          pairs.forEach(([a]) => (a.style.viewTransitionName = ""));
          swap(prev, next, fwd);
          playIn(next, fwd);
        });
      } catch {
        vt = null;
      }
      if (vt) {
        vt.ready.catch(() => {});
        if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => {});
        const done = () => {
          pairs.forEach(([a, b]) => {
            a.style.viewTransitionName = "";
            b.style.viewTransitionName = "";
            delete b.dataset.mm;
          });
          stopAnims(prev);
        };
        vt.finished.then(done, done);
        return;
      }
      pairs.forEach(([a, b]) => {
        a.style.viewTransitionName = "";
        b.style.viewTransitionName = "";
        delete b.dataset.mm;
      });
    }
    const [outK, inK, dur] = (TRANS[type] || TRANS.fade)(fwd);
    prev.classList.add("out");
    swap(prev, next, fwd);
    playIn(next, fwd);
    const o = prev.animate(outK, { duration: dur * 0.8, easing: IO, fill: "forwards" });
    const i = next.animate(inK, { duration: dur, easing: type === "fade" ? "ease" : SPR.smooth.easing, fill: "backwards" });
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      busy = null;
      prev.classList.remove("out");
      o.cancel();
      if (!prev.classList.contains("on")) stopAnims(prev);
    };
    busy = () => {
      i.finish();
      end();
    };
    o.finished.then(end, end);
  }

  /* ───────────── Navigation ───────────── */
  function go(target, o) {
    o = o || {};
    if (!N) return;
    if (typeof target === "string") target = indexOf(target);
    target = Math.max(0, Math.min(N - 1, target | 0));
    const prev = slides[idx];
    const next = slides[target];
    if (ov) closeOverview(false);
    const fwd = o.dir !== undefined ? o.dir : target >= idx;
    const max = maxStep(next);
    let st = o.step === "last" ? max : o.step !== undefined ? +o.step : fwd ? 0 : max;
    st = Math.max(0, Math.min(max, st));
    if (prev && prev !== next) deactivateMedia(prev);
    setStep(next, st, false);
    const from = idx;
    idx = target;
    transition(from === target ? null : prev, next, fwd, !!o.instant);
    if (!STATIC) activateMedia(next);
    if (next.classList.contains("t-summary")) renderScore(next);
    updateHud();
    if (!o.keepHash) writeHash();
    store.set("pos", idx);
    // Shared with the course page: how far the learner got in this lesson.
    const pr = store.get("progress") || {};
    store.set("progress", Object.assign({}, pr, { max: Math.max(pr.max || 0, idx + 1), total: N, done: !!pr.done || idx === N - 1, t: Date.now() }));
    if (nextLessonEl) nextLessonEl.hidden = idx !== N - 1 || STATIC;

    if (!completeSent && idx === N - 1) {
      completeSent = true;
      const scores = store.get("quiz") || {};
      const totalQ = CFG.quizzes || 0;
      const gotQ = Object.values(scores).reduce((a, b) => a + (b ? 1 : 0), 0);
      const quizStr = totalQ > 0 ? gotQ + "/" + totalQ : null;

      const predRates = store.get("predRate") || {};
      const totalP = CFG.predicts || 0;
      const gotP = Object.values(predRates).reduce((a, b) => a + (b === 1 ? 1 : 0), 0);
      const predStr = totalP > 0 ? gotP + "/" + totalP : null;

      emitEvent("complete", {
        slides: N,
        quiz: quizStr,
        predictions: predStr,
      }, idx);
    }
  }
  function next() {
    const s = slides[idx];
    if (!s) return;
    if ((s._step || 0) < maxStep(s)) {
      setStep(s, (s._step || 0) + 1, !STATIC);
      updateHud();
      return;
    }
    if (idx < N - 1) go(idx + 1, { dir: true });
    else if (OPT.loop) go(0, { dir: true });
  }
  function prev() {
    const s = slides[idx];
    if (!s) return;
    if ((s._step || 0) > 0) {
      setStep(s, s._step - 1, false);
      updateHud();
      return;
    }
    if (idx > 0) go(idx - 1, { dir: false });
    else if (OPT.loop) go(N - 1, { dir: false });
  }
  function indexOf(key) {
    if (/^\d+$/.test(key)) return +key - 1;
    const i = (CFG.slides || []).findIndex((m) => m.id === key);
    return i >= 0 ? i : slides.findIndex((s) => s.id === "s-" + key);
  }
  function readHash() {
    const m = /^#\/?([^?]+)/.exec(decodeURIComponent(location.hash || ""));
    if (!m) return null;
    const [key, step] = m[1].split("/");
    const i = indexOf(key);
    return i >= 0 && i < N ? { i, step: step !== undefined ? +step : undefined } : null;
  }
  function writeHash() {
    const meta = (CFG.slides || [])[idx];
    const key = meta && meta.id && !/^\d+$/.test(meta.id) ? meta.id : String(idx + 1);
    try { history.replaceState(null, "", "#/" + key); } catch { /* sandboxed */ }
  }
  addEventListener("hashchange", () => {
    const h = readHash();
    if (h && h.i !== idx) go(h.i, { step: h.step, keepHash: true });
  });

  /* ───────────── Media ───────────── */
  function activateMedia(s) {
    s.querySelectorAll("iframe[data-src]").forEach((f) => {
      if (location.protocol === "file:" && /youtube/.test(f.dataset.src)) return;
      if (!f.getAttribute("src")) f.setAttribute("src", f.dataset.src);
      const fr = f.closest(".vd-frame");
      if (fr) fr.classList.add("live");
    });
  }
  function deactivateMedia(s) {
    s.querySelectorAll("iframe[data-src]").forEach((f) => {
      f.removeAttribute("src");
      const fr = f.closest(".vd-frame");
      if (fr) fr.classList.remove("live");
    });
    s.querySelectorAll("video").forEach((v) => { try { v.pause(); } catch { /* ignore */ } });
  }

  /* ───────────── HUD ───────────── */
  const countB = hud && hud.querySelector(".count b");
  const prog = hud && hud.querySelector(".progress i");
  const notesP = hud && hud.querySelector(".notes-panel");
  const helpP = hud && hud.querySelector(".help-sheet");
  const toastEl = hud && hud.querySelector(".toast");
  const nextLessonEl = hud && hud.querySelector(".next-lesson");
  function updateHud() {
    if (countB) countB.textContent = String(idx + 1);
    if (prog) {
      const s = slides[idx];
      const m = maxStep(s);
      const frac = N > 1 ? (idx + (m ? (s._step || 0) / (m + 1) : 0)) / (N - 1) : 1;
      prog.style.setProperty("--p", Math.min(1, frac).toFixed(4));
    }
    if (notesP && !notesP.hidden) renderNotes();
  }
  function renderNotes() {
    const body = notesP.querySelector(".np-body");
    const n = notesP.querySelector(".np-n");
    const tpl = slides[idx].querySelector("template.sl-notes");
    body.textContent = "";
    if (tpl) body.append(tpl.content.cloneNode(true));
    else {
      const p = doc.createElement("p");
      p.className = "empty";
      p.textContent = T.noNotes || "";
      body.append(p);
    }
    if (n) n.textContent = idx + 1 + " / " + N;
  }
  function toggleNotes(force) {
    if (!notesP) return;
    const show = force !== undefined ? force : notesP.hidden;
    notesP.hidden = !show;
    if (show) renderNotes();
    hud.querySelectorAll('.pill [data-act="notes"]').forEach((b) => b.classList.toggle("on", show));
  }
  function toggleHelp(force) {
    if (!helpP) return;
    helpP.hidden = force !== undefined ? !force : !helpP.hidden;
  }
  function toggleFull() {
    if (!doc.fullscreenElement) (root.requestFullscreen ? root.requestFullscreen() : Promise.reject()).catch(() => {});
    else doc.exitFullscreen().catch(() => {});
  }
  let toastTimer = 0;
  function toast(text, actions, ms) {
    if (!toastEl) return;
    toastEl.textContent = "";
    const span = doc.createElement("span");
    span.textContent = text;
    toastEl.append(span);
    (actions || []).forEach((a) => {
      const b = doc.createElement("button");
      b.type = "button";
      b.textContent = a.label;
      if (a.primary) b.className = "pri";
      b.onclick = () => {
        toastEl.hidden = true;
        if (a.run) a.run();
      };
      toastEl.append(b);
    });
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), ms || 9000);
  }
  if (hud) {
    hud.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) {
        if (e.target === helpP) toggleHelp(false);
        return;
      }
      const a = b.dataset.act;
      if (a === "prev") prev();
      else if (a === "next") next();
      else if (a === "overview") toggleOverview();
      else if (a === "notes") toggleNotes();
      else if (a === "fullscreen") toggleFull();
      else if (a === "help") toggleHelp();
      else if (a === "export-progress") exportProgress();
    });
  }
  // Auto-hide the control pill while the learner reads.
  let idleTimer = 0;
  function wake() {
    if (!hud) return;
    hud.classList.remove("idle");
    root.classList.remove("idle-cursor");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (ov || (hud.querySelector(".pill:hover"))) return wake();
      hud.classList.add("idle");
      if (doc.fullscreenElement) root.classList.add("idle-cursor");
    }, 2600);
  }
  addEventListener("pointermove", wake, { passive: true });
  addEventListener("pointerdown", wake, { passive: true });

  /* ───────────── Overview & contact sheet ───────────── */
  function ensureClone(s) {
    if (s._clone) return;
    const b = bds.get(s.dataset.bd);
    if (!b) return;
    const c = b.cloneNode(true);
    c.classList.add("bd-clone", "on");
    c.removeAttribute("data-bd");
    s.prepend(c);
    s._clone = c;
  }
  function layoutTiles() {
    const w = innerWidth;
    const cols = sheetOn ? sheetOn.cols : w < 640 ? 2 : w < 1100 ? 3 : w < 1800 ? 4 : 5;
    deckEl.style.setProperty("--cols", String(cols));
    const tile = slides.find((s) => s.offsetWidth > 0);
    if (tile) deckEl.style.setProperty("--tk", (tile.offsetWidth / 1920).toFixed(5));
  }
  function openOverview() {
    if (ov) return;
    ov = true;
    stopAnims(slides[idx]);
    slides.forEach((s) => {
      ensureClone(s);
      s.inert = false;
      setStep(s, maxStep(s), false);
    });
    root.classList.add("ov");
    layoutTiles();
    slides.forEach((s) => s._pl && plRender(s));
    slides[idx].classList.add("cur");
    slides[idx].scrollIntoView({ block: "center" });
    deckEl.focus({ preventScroll: true });
  }
  function closeOverview(restore) {
    if (!ov) return;
    ov = false;
    root.classList.remove("ov");
    deckEl.style.removeProperty("--tk");
    slides.forEach((s, i) => {
      s.classList.remove("cur");
      if (i !== idx) s.inert = true;
    });
    deckEl.scrollTop = 0;
    if (restore !== false) go(idx, { instant: true, step: "last" });
  }
  function toggleOverview() {
    ov ? closeOverview() : openOverview();
  }
  function moveCursor(delta) {
    const cur = slides.findIndex((s) => s.classList.contains("cur"));
    const n = Math.max(0, Math.min(N - 1, cur + delta));
    slides[cur].classList.remove("cur");
    slides[n].classList.add("cur");
    slides[n].scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }
  function sheet(o) {
    o = o || {};
    const from = Math.max(0, (o.from || 1) - 1);
    const to = Math.min(N, o.to || N);
    STATIC = true;
    sheetOn = { cols: o.cols || 3 };
    root.classList.add("static", "sheet");
    slides.forEach((s, i) => {
      const inRange = i >= from && i < to;
      s.style.display = inRange ? "" : "none";
      if (!inRange) return;
      ensureClone(s);
      s.inert = false;
      setStep(s, maxStep(s), false);
      stopAnims(s);
    });
    layoutTiles();
    return { height: deckEl.scrollHeight, width: deckEl.clientWidth };
  }

  /* ───────────── Print ───────────── */
  let printed = false;
  function preparePrint() {
    if (printed) return;
    printed = true;
    printing = true;
    slides.forEach((s) => {
      ensureClone(s);
      setStep(s, maxStep(s), false);
      stopAnims(s);
    });
  }
  addEventListener("beforeprint", preparePrint);

  /* ───────────── Quiz, flashcards, cloze, hotspots ───────────── */
  const SVG_OK = '<svg viewBox="0 0 24 24"><path d="M5.5 12.5l4 4L18.5 7.5"/></svg>';
  const SVG_NO = '<svg viewBox="0 0 24 24"><path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/></svg>';
  function grade(quiz, chosen) {
    if (quiz.classList.contains("answered")) return;
    const poll = !!quiz.dataset.poll;
    quiz.classList.add("answered");
    let right = true;
    quiz.querySelectorAll(".qz-opt").forEach((o) => {
      const ok = o.dataset.ok === "1";
      const sel = chosen.includes(o);
      if (!poll && ok) o.classList.add("ok");
      if (!poll && sel && !ok) o.classList.add("bad");
      if (poll && sel) o.classList.add("sel");
      if ((sel && !ok) || (!sel && ok)) right = false;
      const mk = o.querySelector(".qz-mark");
      if (mk && !poll) mk.innerHTML = ok ? SVG_OK : sel ? SVG_NO : "";
      if (sel) o.classList.add("hit");
      o.setAttribute("aria-disabled", "true");
    });
    const res = quiz.querySelector(".qz-result");
    if (res && !poll) {
      res.textContent = right ? T.correct || "" : T.wrong || "";
      res.className = "qz-result " + (right ? "ok" : "bad");
    }
    if (!poll) {
      const scores = store.get("quiz") || {};
      scores[quiz.dataset.quiz] = right ? 1 : 0;
      store.set("quiz", scores);

      const qEl = quiz.querySelector(".qz-q");
      const qText = (qEl ? qEl.textContent : "").trim().replace(/\s+/g, " ").slice(0, 200);
      const chosenIndices = chosen.map((o) => +o.dataset.k);
      const correctIndices = Array.from(quiz.querySelectorAll('.qz-opt[data-ok="1"]')).map((o) => +o.dataset.k);
      emitEvent("quiz", {
        question: qText,
        chosen: chosenIndices,
        answer: correctIndices,
        correct: right,
      });
    }
  }
  function answerKey(k) {
    const s = slides[idx];
    const quiz = s && s.querySelector(".quiz");
    if (!quiz) return false;
    const btn = quiz.querySelectorAll(".qz-opt")[k];
    if (!btn) return false;
    btn.click();
    return true;
  }
  // "Try it yourself first" countdown on exercise slides (click or T to start/pause).
  function drawTimer(btn) {
    const total = +btn.dataset.time || 60;
    const left = Math.max(0, btn._left === undefined ? total : btn._left);
    const num = btn.querySelector(".t-num");
    if (num) num.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
    btn.style.setProperty("--off", (100 * (1 - left / total)).toFixed(2));
  }
  function toggleTimer(btn) {
    const cta = btn.querySelector(".t-cta");
    if (btn._run) {
      clearInterval(btn._run);
      btn._run = 0;
      btn.classList.remove("run");
      if (cta) cta.textContent = btn.dataset.start || "";
      return;
    }
    if (btn._left === undefined || btn._left <= 0) btn._left = +btn.dataset.time || 60;
    btn.classList.add("run");
    btn.classList.remove("done");
    if (cta) cta.textContent = btn.dataset.pause || "";
    drawTimer(btn);
    btn._run = setInterval(() => {
      btn._left -= 1;
      drawTimer(btn);
      if (btn._left <= 0) {
        clearInterval(btn._run);
        btn._run = 0;
        btn.classList.remove("run");
        btn.classList.add("done");
        if (cta) cta.textContent = btn.dataset.up || "";
      }
    }, 1000);
  }

  function renderScore(s) {
    const box = s.querySelector(".sm-score");
    if (!box) return;
    const scores = store.get("quiz") || {};
    const total = CFG.quizzes || 0;
    const answered = Object.keys(scores).length;
    const got = Object.values(scores).reduce((a, b) => a + (b ? 1 : 0), 0);

    const predRates = store.get("predRate") || {};
    const predTotal = CFG.predicts || 0;
    const predAnswered = Object.keys(predRates).length;
    const predGot = Object.values(predRates).reduce((a, b) => a + (b === 1 ? 1 : 0), 0);

    const fill = box.querySelector(".sm-fill");
    const num = box.querySelector(".sm-got");
    const msg = box.querySelector(".sm-msg");
    const label = box.querySelector(".sm-label");
    const predEl = box.querySelector(".sm-pred");

    if (total > 0) {
      const pct = got / total;
      if (num) num.textContent = String(got);
      if (msg) msg.textContent = !answered ? T.none || "" : pct >= 0.8 ? T.great || "" : pct >= 0.5 ? T.good || "" : T.review || "";
      if (fill) {
        fill.style.strokeDasharray = "0 100";
        fill.style.opacity = pct > 0 ? "1" : "0";
        if (pct > 0) requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.strokeDasharray = (pct * 100).toFixed(1) + " 100")));
      }
      if (predEl && predTotal > 0) {
        predEl.textContent = (T.predictionsRight || "Predictions right") + " " + predGot + "/" + predTotal;
        predEl.hidden = false;
      }
    } else if (predTotal > 0) {
      const pct = predGot / predTotal;
      if (num) num.textContent = String(predGot);
      if (label) label.textContent = T.predictionsRight || "Predictions right";
      if (msg) msg.textContent = !predAnswered ? T.none || "" : pct >= 0.8 ? T.great || "" : pct >= 0.5 ? T.good || "" : T.review || "";
      if (fill) {
        fill.style.strokeDasharray = "0 100";
        fill.style.opacity = pct > 0 ? "1" : "0";
        if (pct > 0) requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.strokeDasharray = (pct * 100).toFixed(1) + " 100")));
      }
      if (predEl) predEl.hidden = true;
    }
  }

  function predRate(s, r) {
    if (!s || s.dataset.type !== "predict") return false;
    const reveal = s.querySelector(".pred-reveal");
    if (!reveal || reveal.classList.contains("pending")) return false;
    const sIdx = slides.indexOf(s);
    const rates = store.get("predRate") || {};
    rates[sIdx] = r;
    store.set("predRate", rates);

    const okBtn = s.querySelector(".pred-r.ok");
    const diffBtn = s.querySelector(".pred-r.diff");
    if (okBtn) okBtn.classList.toggle("sel", r === 1);
    if (diffBtn) diffBtn.classList.toggle("sel", r === 0);

    const gapMsg = s.querySelector(".pred-gap-msg");
    if (gapMsg) gapMsg.hidden = r !== 0;

    const meta = (CFG.slides || [])[sIdx] || {};
    const predInput = s.querySelector(".pred-input");
    const predText = (predInput ? predInput.value : store.get("pred:" + sIdx) || "").slice(0, 2000);
    const termOut = s.querySelector(".term-output");
    const outText = (termOut ? (termOut.dataset.raw || termOut.textContent) : "").slice(0, 300);
    const titleText = (meta.title || (s.querySelector("h2, .sl-head h2") ? s.querySelector("h2, .sl-head h2").textContent : "") || "").trim();
    emitEvent("predict", {
      title: titleText,
      prediction: predText,
      rating: r === 1 ? "right" : "different",
      output: outText,
    }, sIdx);

    return true;
  }
  deckEl.addEventListener("click", (e) => {
    if (ov) {
      const s = e.target.closest(".slide");
      if (s) {
        const i = slides.indexOf(s);
        closeOverview(false);
        go(i, { instant: true, step: "last" });
      }
      return;
    }
    const opt = e.target.closest(".qz-opt");
    if (opt) {
      const quiz = opt.closest(".quiz");
      if (quiz.classList.contains("answered")) return;
      if (quiz.dataset.multi) {
        opt.classList.toggle("sel");
        const chk = quiz.querySelector(".qz-check");
        if (chk) chk.disabled = !quiz.querySelector(".qz-opt.sel");
      } else grade(quiz, [opt]);
      return;
    }
    const chk = e.target.closest(".qz-check");
    if (chk) {
      const quiz = chk.closest(".quiz");
      grade(quiz, Array.from(quiz.querySelectorAll(".qz-opt.sel")));
      return;
    }
    const card = e.target.closest(".fcard");
    if (card) {
      card.setAttribute("aria-pressed", card.getAttribute("aria-pressed") === "true" ? "false" : "true");
      return;
    }
    const blank = e.target.closest(".blank");
    if (blank) {
      blank._open = true;
      blank.classList.add("on");
      return;
    }
    const timer = e.target.closest(".ex-timer");
    if (timer) {
      toggleTimer(timer);
      return;
    }
    const rate = e.target.closest(".pl-r");
    if (rate) {
      plRate(rate.closest(".slide"), +rate.dataset.r);
      return;
    }
    const predBtn = e.target.closest(".pred-r");
    if (predBtn) {
      predRate(predBtn.closest(".slide"), +predBtn.dataset.r);
      return;
    }
    const pin = e.target.closest(".hs-pin");
    if (pin) {
      const s = pin.closest(".slide");
      const k = pin.dataset.k;
      s.querySelectorAll(".hs-item").forEach((it) => it.classList.toggle("cur", it.dataset.k === k));
      s.querySelectorAll(".hs-pin").forEach((p) => p.classList.toggle("cur", p === pin));
    }
  });
  deckEl.addEventListener("keydown", (e) => {
    const blank = e.target.closest && e.target.closest(".blank");
    if (blank && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      blank._open = true;
      blank.classList.add("on");
    }
  });

  /* ───────────── Pointer: parallax, card light, swipe ───────────── */
  let px = 0, py = 0, tx = 0, ty = 0, raf = 0;
  function parallaxLoop() {
    tx += (px - tx) * 0.08;
    ty += (py - ty) * 0.08;
    const s = slides[idx];
    if (s) s.querySelectorAll("[data-depth]").forEach((el) => {
      const d = +el.dataset.depth || 0.5;
      el.style.transform = "translate3d(" + (tx * d * 26).toFixed(2) + "px," + (ty * d * 18).toFixed(2) + "px,0)";
    });
    raf = Math.abs(px - tx) + Math.abs(py - ty) > 0.001 ? requestAnimationFrame(parallaxLoop) : 0;
  }
  if (OPT.parallax && !reduced && !STATIC) {
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || ov) return;
      px = (e.clientX / innerWidth) * 2 - 1;
      py = (e.clientY / innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(parallaxLoop);
    }, { passive: true });
  }
  deckEl.addEventListener("pointermove", (e) => {
    const card = e.target.closest && e.target.closest(".card");
    if (!card || reduced) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    card.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
    card.style.setProperty("--my", (y * 100).toFixed(1) + "%");
    card.style.transform = "perspective(1200px) rotateX(" + ((0.5 - y) * 4).toFixed(2) + "deg) rotateY(" + ((x - 0.5) * 5).toFixed(2) + "deg)";
  }, { passive: true });
  deckEl.addEventListener("pointerout", (e) => {
    const card = e.target.closest && e.target.closest(".card");
    if (card && !card.contains(e.relatedTarget)) card.style.transform = "";
  });
  let sx = null, sy = null;
  deckEl.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
  }, { passive: true });
  deckEl.addEventListener("touchend", (e) => {
    if (sx === null || ov) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    sx = sy = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) dx < 0 ? next() : prev();
  }, { passive: true });

  /* ───────────── Keyboard ───────────── */
  addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) {
      if (e.key === "Escape") {
        e.preventDefault();
        t.blur();
      }
      return;
    }
    const onButton = t && t.tagName === "BUTTON";
    const k = e.key;
    if (helpP && !helpP.hidden && (k === "Escape" || k === "?" || k === "h")) { e.preventDefault(); toggleHelp(false); return; }
    if (ov) {
      const cols = +getComputedStyle(deckEl).getPropertyValue("--cols") || 4;
      if (k === "ArrowRight") moveCursor(1);
      else if (k === "ArrowLeft") moveCursor(-1);
      else if (k === "ArrowDown") moveCursor(cols);
      else if (k === "ArrowUp") moveCursor(-cols);
      else if (k === "Enter" || k === " ") {
        const i = slides.findIndex((s) => s.classList.contains("cur"));
        closeOverview(false);
        go(i, { instant: true, step: "last" });
      } else if (k === "Escape" || k === "o" || k === "O") closeOverview();
      else return;
      e.preventDefault();
      return;
    }
    switch (k) {
      case "ArrowRight": case "ArrowDown": case "PageDown":
        next(); break;
      case " ":
        if (onButton) return;
        e.shiftKey ? prev() : next(); break;
      case "Enter":
        if (onButton) return;
        next(); break;
      case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace":
        prev(); break;
      case "Home": go(0); break;
      case "End": go(N - 1, { step: "last" }); break;
      case "o": case "O": case "Escape":
        if (k === "Escape" && notesP && !notesP.hidden) toggleNotes(false);
        else openOverview();
        break;
      case "n": case "N": toggleNotes(); break;
      case "f": case "F": toggleFull(); break;
      case "?": case "h": case "H": toggleHelp(); break;
      case "t": case "T": {
        const tm = slides[idx] && slides[idx].querySelector(".ex-timer");
        if (!tm) return;
        toggleTimer(tm);
        break;
      }
      default:
        if ((k === "1" || k === "2") && plRate(slides[idx], k === "1" ? 1 : 0)) break;
        if ((k === "1" || k === "2") && predRate(slides[idx], k === "1" ? 1 : 0)) break;
        if (/^[1-6]$/.test(k) && answerKey(+k - 1)) break;
        return;
    }
    e.preventDefault();
    wake();
  });

  /* ───────────── QA: audit ───────────── */
  const TEXTY = "h1,h2,h3,p,li,blockquote,figcaption,dt,dd,td,th,.it-text,.it-detail,.card-t,.card-p,.st-label,.cy-title,.cy-text,.qz-text,.fc-term,.fc-ans,.hs-label,.hs-text,.tl-title,.tl-text,.pr-title,.pr-text,.cmp-t,.lead,.eyebrow";
  const BLOCKS = "h1,h2,h3,p,li,blockquote,.card,.cmp-col,.window,.media,table,.st,.tl-ev,.pr-item,.cy-label,.cy-badge,.qz-opt,.fcard,.hs-img,.hs-item,.ag-item,.sm-score,.dn-ring,.dn-legend,.chart-svg,.hbars,.fm-main,.fm-legend,.vd-frame,.df-rel";
  function rectIn(el, base, k) {
    const r = el.getBoundingClientRect();
    return { l: (r.left - base.left) / k, t: (r.top - base.top) / k, r: (r.right - base.left) / k, b: (r.bottom - base.top) / k, w: r.width / k, h: r.height / k };
  }
  function label(el) {
    const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || "";
    const txt = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48);
    return el.tagName.toLowerCase() + (cls ? "." + String(cls).trim().split(/\s+/).slice(0, 2).join(".") : "") + (txt ? ' "' + txt + '"' : "");
  }
  function auditSlide(s, i) {
    const issues = [];
    const stage = s.querySelector(".sl-stage");
    const base = stage.getBoundingClientRect();
    const k = base.width / 1920 || 1;
    const kt = +s.dataset.kt || 1;
    if (overflowing(s)) issues.push({ level: "error", msg: "Content overflows its box even after shrinking text to " + Math.round(kt * 100) + "%. Cut text or split the slide." });
    else if (kt < 0.9) issues.push({ level: "warn", msg: "Text was auto-shrunk to " + Math.round(kt * 100) + "% to fit. Consider trimming." });
    else if (kt < 1) issues.push({ level: "info", msg: "Text auto-shrunk slightly (" + Math.round(kt * 100) + "%)." });
    if (s.dataset.type !== "image" && s.dataset.type !== "html") {
      for (const el of s.querySelectorAll(".sl-in " + BLOCKS.split(",").join(", .sl-in "))) {
        if (el.closest(".pending") && !el.closest(".cw-step")) { /* still check: builds reveal later */ }
        const r = rectIn(el, base, k);
        if (r.w === 0 && r.h === 0) continue;
        const out = Math.max(-r.l, -r.t, r.r - 1920, r.b - 1080);
        if (out > 4) { issues.push({ level: "error", msg: "Element extends " + Math.round(out) + "px beyond the slide: " + label(el) }); break; }
      }
    }
    for (const el of s.querySelectorAll(".card-in, .fc-face, .cmp-col, .pr-item, .qz-opt, .tb-wrap, .hs-list")) {
      if (el.scrollHeight > el.clientHeight + 2) issues.push({ level: "error", msg: "Text is clipped inside " + label(el) });
    }
    const pre = s.querySelector(".code-pre");
    if (pre && pre.scrollWidth > pre.clientWidth + 2) issues.push({ level: "error", msg: "Code lines are too long and get cut off; shorten lines (≤ 60 chars) or split." });
    const dg = s.querySelector(".dg-svg > svg");
    if (dg) {
      const vb = dg.viewBox && dg.viewBox.baseVal;
      const r = dg.getBoundingClientRect();
      if (vb && vb.width && vb.height && r.width && r.height) {
        const px = (18 * Math.min(r.width / vb.width, r.height / vb.height)) / k;
        if (px < 16) issues.push({ level: "warn", msg: "Diagram labels show at about " + Math.round(px) + "px on the 1920px slide: too much for one slide. Use fewer boxes or shorter labels, switch LR/TD to fit the space, or split it." });
      }
    }
    if (s.querySelector(".dg-failed")) issues.push({ level: "error", msg: "A diagram could not be drawn: fix its Mermaid code (the build warnings quote Mermaid's message)." });
    const labels = Array.from(s.querySelectorAll(".cy-label, .cy-badge"));
    outer: for (let a = 0; a < labels.length; a++) {
      for (let b = a + 1; b < labels.length; b++) {
        if (labels[a].parentElement === labels[b].parentElement) continue;
        const ra = labels[a].getBoundingClientRect();
        const rb = labels[b].getBoundingClientRect();
        if (ra.left < rb.right - 2 && rb.left < ra.right - 2 && ra.top < rb.bottom - 2 && rb.top < ra.bottom - 2) {
          issues.push({ level: "warn", msg: "Cycle labels overlap; shorten titles/texts or use fewer items." });
          break outer;
        }
      }
    }
    s.querySelectorAll("img").forEach((img) => {
      if (img.classList.contains("amb")) return;
      if (img.complete && img.naturalWidth === 0) issues.push({ level: "error", msg: "Image failed to load: " + (img.getAttribute("src") || "").slice(0, 120) });
    });
    let minFs = Infinity;
    let minEl = null;
    s.querySelectorAll(TEXTY).forEach((el) => {
      // Diagram labels are scaled with their SVG; the diagram check above measures them at their real size.
      if (!el.textContent.trim() || el.closest(".credit,.fc-tap,.win-bar,.term-bar,.qz-why,.qz-expl,.vd-open,.dg-svg")) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < minFs) { minFs = fs; minEl = el; }
    });
    if (minFs < 19) issues.push({ level: "warn", msg: "Text as small as " + Math.round(minFs) + "px on a 1920px slide is hard to read: " + label(minEl) });
    const words = (s.querySelector(".sl-in").innerText || "").split(/\s+/).filter(Boolean).length;
    if (words > 110) issues.push({ level: "warn", msg: "Dense slide (" + words + " words). Move detail into notes or split it." });
    const meta = (CFG.slides || [])[i] || {};
    return { slide: i + 1, id: meta.id, type: s.dataset.type, title: meta.title, kt, words, issues };
  }
  function audit() {
    return slides.map((s, i) => auditSlide(s, i));
  }

  /* ───────────── Ready & boot ───────────── */
  function imagesReady(ms) {
    const imgs = Array.from(doc.images).filter((im) => !im.complete);
    if (!imgs.length) return Promise.resolve();
    return Promise.race([
      Promise.all(imgs.map((im) => new Promise((r) => { im.addEventListener("load", r, { once: true }); im.addEventListener("error", r, { once: true }); }))),
      new Promise((r) => setTimeout(r, ms)),
    ]);
  }
  let readyResolve;
  const ready = new Promise((r) => (readyResolve = r));
  async function boot() {
    slides.forEach((s, i) => {
      s.dataset.n = String(i + 1);
      s.inert = true;
      dgPrepare(s);
      if (s.dataset.type === "predict") {
        const ta = s.querySelector(".pred-input");
        if (ta) {
          const saved = store.get("pred:" + i);
          if (typeof saved === "string") ta.value = saved;
          ta.addEventListener("input", () => store.set("pred:" + i, ta.value));
        }
        const rates = store.get("predRate") || {};
        if (rates[i] !== undefined) {
          const r = rates[i];
          const okBtn = s.querySelector(".pred-r.ok");
          const diffBtn = s.querySelector(".pred-r.diff");
          if (okBtn) okBtn.classList.toggle("sel", r === 1);
          if (diffBtn) diffBtn.classList.toggle("sel", r === 0);
          const gapMsg = s.querySelector(".pred-gap-msg");
          if (gapMsg) gapMsg.hidden = r !== 0;
        }
      }
      setStep(s, 0, false);
    });
    // Load every embedded face before measuring, or text fitting would use fallback metrics.
    void deckEl.offsetHeight;
    const faces = doc.fonts ? Array.from(doc.fonts, (f) => f.load().catch(() => null)) : [];
    await Promise.race([Promise.all(faces).then(() => doc.fonts.ready), new Promise((r) => setTimeout(r, 3000))]);
    slides.forEach(fitSlide);
    let start = 0;
    let startStep;
    let live = null;
    try { live = JSON.parse(sessionStorage.getItem("aurora-live") || "null"); sessionStorage.removeItem("aurora-live"); } catch { /* ignore */ }
    const h = readHash();
    if (live && live.id === CFG.id) { start = Math.min(N - 1, live.i); startStep = live.step; }
    else if (h) { start = h.i; startStep = h.step; }
    go(start, { instant: !!(live || h) || STATIC, step: startStep, dir: true });
    if (!live && !h && !STATIC && OPT.resume) {
      const saved = store.get("pos");
      if (typeof saved === "number" && saved > 0 && saved < N) {
        toast((T.resume || "Resume from slide") + " " + (saved + 1) + "?", [
          { label: T.resumeYes || "Resume", primary: true, run: () => go(saved, { dir: true }) },
          { label: T.restart || "Start over" },
        ]);
      }
    }
    wake();
    await imagesReady(6000);
    // Images can change layout (hotspots size to the photo); re-fit those slides once they are idle.
    for (const s of slides) {
      if (!s.querySelector("img")) continue;
      if (animating(s)) await Promise.all(s.getAnimations({ subtree: true }).filter(isOwn).map((a) => a.finished.catch(() => null)));
      fitSlide(s);
    }
    flushEvents();
    readyResolve();
  }

  // Live reload from the preview server keeps your place.
  if (window.AURORA_LIVE && window.EventSource) {
    try {
      const es = new EventSource(window.AURORA_LIVE);
      es.addEventListener("reload", () => {
        try { sessionStorage.setItem("aurora-live", JSON.stringify({ id: CFG.id, i: idx, step: slides[idx] ? slides[idx]._step : 0 })); } catch { /* ignore */ }
        location.reload();
      });
    } catch { /* ignore */ }
  }

  window.__aurora = {
    version: CFG.v,
    total: N,
    slides: CFG.slides || [],
    whenReady: () => ready,
    state: () => ({ index: idx, slide: idx + 1, step: slides[idx] ? slides[idx]._step || 0 : 0, steps: slides[idx] ? maxStep(slides[idx]) : 0, total: N, type: slides[idx] && slides[idx].dataset.type }),
    go: (i, o) => { go(i, o); return window.__aurora.state(); },
    next, prev, settle,
    showAll: () => {
      const s = slides[idx];
      setStep(s, maxStep(s), false);
      settle(s);
      return window.__aurora.state();
    },
    setStatic: (on) => { STATIC = on !== false; root.classList.toggle("static", STATIC); },
    audit, sheet, preparePrint, fit: () => slides.forEach(fitSlide),
    overview: toggleOverview,
  };
  boot();
})();
