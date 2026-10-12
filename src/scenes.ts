/**
 * Lesson scenes: subject-matched animated backdrops and icon motions
 * that reinforce the topic of a lesson (photosynthesis, quantum, circuit, code…).
 */
import { esc } from "./util.js";

export const SCENES = [
  "leaves",
  "cells",
  "dna",
  "quantum",
  "waves",
  "molecules",
  "circuit",
  "network",
  "code",
  "orbits",
  "geometry",
  "ink",
] as const;

export type Scene = (typeof SCENES)[number];

export const DECK_SCENES = [...SCENES, "auto", "none"] as const;
export type DeckScene = (typeof DECK_SCENES)[number];

export const ICON_MOTIONS = [
  "sway",
  "spin",
  "rays",
  "orbit",
  "ripple",
  "beat",
  "float",
  "flicker",
  "bob",
  "none",
] as const;

export type IconMotion = (typeof ICON_MOTIONS)[number];

/** Conservative keyword map (Vietnamese and English, folded to ASCII lower-case). */
export const SCENE_KEYWORDS: Record<Scene, string[]> = {
  leaves: ["quang hop", "quang hợp", "lá", "thuc vat", "thực vật", "cây", "sinh thai", "sinh thái", "nong nghiep", "nông nghiệp", "photosynth", "plant"],
  cells: ["te bao", "tế bào", "vi khuan", "vi khuẩn", "virus", "mien dich", "miễn dịch", "cell", "microb"],
  dna: ["gen", "adn", "dna", "di truyen", "di truyền", "tien hoa", "tiến hoá", "genetic"],
  quantum: ["luong tu", "lượng tử", "qubit", "quantum", "nguyen tu", "nguyên tử", "hat co ban", "hạt cơ bản", "hat nhan", "hạt nhân"],
  waves: ["sóng", "dao dong", "dao động", "am thanh", "âm thanh", "quang hoc", "quang học", "tin hieu", "tín hiệu", "wave", "signal"],
  molecules: ["hoa hoc", "hoá học", "phan tu", "phân tử", "phan ung", "phản ứng", "axit", "bazo", "bazơ", "chemistry", "molecule"],
  circuit: ["mach dien", "mạch điện", "mach dien tu", "mạch điện tử", "mach logic", "mạch logic", "dien tu", "điện tử", "phan cung", "phần cứng", "vi xu ly", "vi xử lý", "cpu", "chip", "transistor", "hardware", "circuit"],
  network: ["tri tue nhan tao", "trí tuệ nhân tạo", "AI", "hoc may", "học máy", "mang no-ron", "mạng nơ-ron", "mang no ron", "do thi", "đồ thị", "machine learning", "neural", "graph"],
  code: ["lap trinh", "lập trình", "python", "javascript", "code", "thuat toan", "thuật toán", "co so du lieu", "cơ sở dữ liệu", "programming", "algorithm"],
  orbits: ["thien van", "thiên văn", "vu tru", "vũ trụ", "hanh tinh", "hành tinh", "quy dao", "quỹ đạo", "hap dan", "hấp dẫn", "astronomy", "orbit"],
  geometry: ["toán", "hinh hoc", "hình học", "dai so", "đại số", "giai tich", "giải tích", "xac suat", "xác suất", "thong ke", "thống kê", "math", "geometry", "calculus"],
  ink: ["lich su", "lịch sử", "van hoc", "văn học", "ngon ngu", "ngôn ngữ", "triet", "triết", "phap luat", "pháp luật", "history", "literature", "philosophy"],
};

/** Normalize string: lower-case, strip combining diacritics, đ/Đ -> d. */
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

/** Determine whether a word token has any diacritical marks (accents or đ/Đ). */
export function hasDiacritics(word: string): boolean {
  return /[đĐ]/.test(word) || /[\u0300-\u036f]/.test(word.normalize("NFD"));
}

/** Split text into word tokens (Unicode letters and digits). */
export function tokenizeWords(text: string): string[] {
  return text.normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Check if keyword matches a sub-sequence of tokens. */
function matchesKeywordTokens(
  origTokens: string[],
  lowerTokens: string[],
  kw: string,
): boolean {
  if (kw === "AI") {
    // "AI" matches only the upper-case token AI in the original text
    return origTokens.includes("AI");
  }

  const kwTokens = tokenizeWords(kw.toLowerCase());
  if (kwTokens.length === 0) return false;

  const m = kwTokens.length;
  for (let i = 0; i <= lowerTokens.length - m; i++) {
    let match = true;
    for (let j = 0; j < m; j++) {
      const kwTok = kwTokens[j]!;
      const textTok = lowerTokens[i + j]!;

      if (kwTok === "photosynth" || kwTok === "microb") {
        if (!textTok.startsWith(kwTok) || hasDiacritics(textTok)) {
          match = false;
          break;
        }
      } else if (hasDiacritics(kwTok)) {
        // A keyword written WITH diacritics matches only the same words with the same diacritics
        if (textTok !== kwTok) {
          match = false;
          break;
        }
      } else {
        // A keyword written WITHOUT diacritics matches only words that themselves have no diacritics
        if (textTok !== kwTok || hasDiacritics(textTok)) {
          match = false;
          break;
        }
      }
    }
    if (match) return true;
  }
  return false;
}

/** Detect scene from text using conservative token sequence keyword matching in priority order. */
export function detectScene(text: string): { scene: Scene; match: string } | undefined {
  const nfc = text.normalize("NFC");
  const origTokens = tokenizeWords(nfc);
  const lowerTokens = origTokens.map((t) => t.toLowerCase());

  for (const scene of SCENES) {
    const list = SCENE_KEYWORDS[scene];
    for (const kw of list) {
      if (matchesKeywordTokens(origTokens, lowerTokens, kw)) {
        return { scene, match: kw };
      }
    }
  }
  return undefined;
}

export interface DeckSceneResolution {
  scene: Scene | "none";
  why: string;
}

/** Resolve the deck scene: explicit deck setting, course inheritance, or auto detection. */
export function resolveDeckScene(
  deck: { title?: string; subtitle?: string; scene?: string; slides?: Array<{ type: string; title?: string }> },
  courseScene?: string,
): DeckSceneResolution {
  if (deck.scene && deck.scene !== "auto") {
    if (deck.scene === "none") return { scene: "none", why: "deck: 'none'" };
    if ((SCENES as readonly string[]).includes(deck.scene)) return { scene: deck.scene as Scene, why: "deck" };
  }
  if (courseScene && courseScene !== "auto") {
    if (courseScene === "none") return { scene: "none", why: "course: 'none'" };
    if ((SCENES as readonly string[]).includes(courseScene)) return { scene: courseScene as Scene, why: "course" };
  }
  const secTitles = (deck.slides ?? []).filter((s) => s.type === "section" && s.title).map((s) => s.title!);
  const corpus = [deck.title ?? "", deck.subtitle ?? "", ...secTitles].filter(Boolean).join(" ");
  const found = detectScene(corpus);
  if (found) {
    return { scene: found.scene, why: `auto: '${found.match}'` };
  }
  return { scene: "none", why: "auto: no match" };
}

/** Detect gentle hero icon motion based on icon identifier name. */
export function detectIconMotion(iconId: string | undefined): IconMotion | undefined {
  if (!iconId) return undefined;
  const name = iconId.split(":").pop()?.toLowerCase() ?? "";
  if (/(leaf|plant|tree|flower|seedling|grass)/.test(name)) return "sway";
  if (/(gear|cog|fan|settings)/.test(name)) return "spin";
  if (/(sun)/.test(name)) return "rays";
  if (/(atom|planet|globe|molecule)/.test(name)) return "orbit";
  if (/(drop|water|droplet)/.test(name)) return "ripple";
  if (/(heart|pulse)/.test(name)) return "beat";
  if (/(cloud|rocket|feather|bubble|balloon|fish|airplane)/.test(name)) return "float";
  if (/(flame|fire|lightning|bolt|candle)/.test(name)) return "flicker";
  if (/(book|pencil|notebook|lightbulb|lamp|brain)/.test(name)) return "bob";
  return undefined;
}

export function resolveIconMotion(slideMotion: IconMotion | undefined, iconId: string | undefined): IconMotion | undefined {
  if (slideMotion) return slideMotion === "none" ? undefined : slideMotion;
  return detectIconMotion(iconId);
}

/** Fast, deterministic PRNG seeded from a string (scene name + deck title). */
export function seedPrng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/* ───────────────────────── 12 Scene Renderers ───────────────────────── */

function renderLeaves(rand: () => number): string {
  // 5 light shafts from top-left at ~28 degrees
  const shafts = [
    '<polygon class="lv-sh lv-sh1" points="-60,-40 80,-40 680,950 480,950" />',
    '<polygon class="lv-sh lv-sh2" points="80,-40 240,-40 920,950 720,950" />',
    '<polygon class="lv-sh lv-sh3" points="240,-40 420,-40 1200,950 980,950" />',
    '<polygon class="lv-sh lv-sh4" points="400,-40 560,-40 1440,950 1240,950" />',
    '<polygon class="lv-sh lv-sh5" points="540,-40 680,-40 1660,950 1480,950" />',
  ].join("");

  const farSvg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<defs><linearGradient id="lv-sgrad" x1="0" y1="0" x2="0.6" y2="1">` +
    `<stop offset="0%" stop-color="var(--g1)" stop-opacity="0.22" />` +
    `<stop offset="50%" stop-color="var(--accent)" stop-opacity="0.08" />` +
    `<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" /></linearGradient>` +
    `<linearGradient id="lv-sgrad-light" x1="0" y1="0" x2="0.6" y2="1">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.65" />` +
    `<stop offset="45%" stop-color="#fffbe8" stop-opacity="0.25" />` +
    `<stop offset="100%" stop-color="#fffbe8" stop-opacity="0" /></linearGradient></defs>` +
    `<g class="lv-shafts">${shafts}</g></svg>`;

  // 7 leaf silhouettes on the right (top-right and bottom-right)
  const leafDefs = [
    { x: 1540, y: -20, r: 135, s: 0.95, cls: "lf1" },
    { x: 1620, y: 140, r: 160, s: 1.15, cls: "lf2" },
    { x: 1460, y: 60, r: 142, s: 0.85, cls: "lf3" },
    { x: 1580, y: 280, r: 175, s: 1.05, cls: "lf4" },
    { x: 1520, y: 680, r: -140, s: 1.0, cls: "lf5" },
    { x: 1610, y: 820, r: -160, s: 1.2, cls: "lf6" },
    { x: 1420, y: 870, r: -125, s: 0.85, cls: "lf7" },
  ];

  const leaves = leafDefs
    .map((l) => {
      return (
        `<g class="lv-lf ${l.cls}" transform="translate(${l.x} ${l.y}) rotate(${l.r}) scale(${l.s})">` +
        `<path class="lv-blade" d="M0,0 C60,-80 160,-90 220,-80 C170,-25 90,15 0,0 Z" />` +
        `<path class="lv-rib" d="M0,0 Q110,-45 220,-80" />` +
        `<path class="lv-v" d="M50,-20 Q80,-45 100,-75" />` +
        `<path class="lv-v" d="M100,-38 Q130,-58 160,-80" />` +
        `<path class="lv-v" d="M150,-55 Q175,-68 200,-80" />` +
        `<path class="lv-v" d="M60,-15 Q95, -5 130,-22" />` +
        `<path class="lv-v" d="M110,-32 Q140,-20 175,-42" />` +
        `</g>`
      );
    })
    .join("");

  // ~20 motes rising slowly and twinkling
  const motes = Array.from({ length: 20 }, (_, i) => {
    const cx = Math.round(500 + rand() * 1050);
    const cy = Math.round(300 + rand() * 550);
    const r = (1.5 + rand() * 2).toFixed(1);
    return `<circle class="lv-mt mt${(i % 5) + 1}" cx="${cx}" cy="${cy}" r="${r}" />`;
  }).join("");

  const nearSvg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<g class="lv-leaves">${leaves}</g><g class="lv-motes">${motes}</g></svg>`;

  return (
    `<i class="scn scn-leaves scn-lv-far" style="--dx: 1.5; --dy: 1;" aria-hidden="true">${farSvg}</i>` +
    `<i class="scn scn-leaves scn-lv-near" style="--dx: 4.5; --dy: 2.5;" aria-hidden="true">${nearSvg}</i>`
  );
}

function organicCellPath(cx: number, cy: number, r: number, rand: () => number): string {
  const n = 6;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const rad = r * (0.88 + rand() * 0.24);
    pts.push([cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad]);
  }
  let d = `M ${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 5.5;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 5.5;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 5.5;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 5.5;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + " Z";
}

function renderCells(rand: () => number): string {
  // Far bokeh cells
  const bokeh = [
    '<circle class="cl-bk bk1" cx="1260" cy="190" r="160" />',
    '<circle class="cl-bk bk2" cx="1490" cy="650" r="210" />',
    '<circle class="cl-bk bk3" cx="1020" cy="520" r="140" />',
  ].join("");

  const farSvg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<g class="cl-bokeh">${bokeh}</g></svg>`;

  // 8 organic cells on the right with varied sizes (r: 44..112)
  const cellPositions = [
    { cx: 1220, cy: 190, r: 76, cls: "c1" },
    { cx: 1420, cy: 250, r: 105, cls: "c2" },
    { cx: 1040, cy: 380, r: 52, cls: "c3" },
    { cx: 1280, cy: 460, r: 112, cls: "c4" },
    { cx: 1480, cy: 470, r: 65, cls: "c5" },
    { cx: 1140, cy: 680, r: 84, cls: "c6" },
    { cx: 1370, cy: 730, r: 94, cls: "c7" },
    { cx: 1010, cy: 640, r: 44, cls: "c8" },
  ];

  const defs =
    `<defs>` +
    `<radialGradient id="cl-inner-glow" cx="42%" cy="40%" r="58%">` +
    `<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22" />` +
    `<stop offset="68%" stop-color="var(--g1)" stop-opacity="0.10" />` +
    `<stop offset="100%" stop-color="var(--g2)" stop-opacity="0.30" /></radialGradient>` +
    `</defs>`;

  const cells = cellPositions
    .map((c) => {
      const membPath = organicCellPath(c.cx, c.cy, c.r, rand);
      const nucPath = organicCellPath(c.cx, c.cy, Math.round(c.r * 0.28), rand);
      const dot1X = c.cx + Math.round(c.r * 0.35);
      const dot1Y = c.cy - Math.round(c.r * 0.25);
      const dot2X = c.cx - Math.round(c.r * 0.3);
      const dot2Y = c.cy + Math.round(c.r * 0.32);
      const dot3X = c.cx + Math.round(c.r * 0.2);
      const dot3Y = c.cy + Math.round(c.r * 0.4);
      return (
        `<g class="cl-cell ${c.cls}">` +
        `<path class="cl-membrane" d="${membPath}" fill="url(#cl-inner-glow)" />` +
        `<path class="cl-nucleus" d="${nucPath}" />` +
        `<ellipse class="cl-organelle" cx="${dot1X}" cy="${dot1Y}" rx="4" ry="2.5" transform="rotate(25 ${dot1X} ${dot1Y})" />` +
        `<ellipse class="cl-organelle" cx="${dot2X}" cy="${dot2Y}" rx="3.5" ry="2" transform="rotate(-35 ${dot2X} ${dot2Y})" />` +
        `<circle class="cl-organelle" cx="${dot3X}" cy="${dot3Y}" r="3" />` +
        `</g>`
      );
    })
    .join("");

  // Large blurred cell in bottom-right foreground corner for depth of field
  const fgCellPath = organicCellPath(1540, 840, 210, rand);
  const fgCell = `<path class="cl-fg-cell" d="${fgCellPath}" fill="url(#cl-inner-glow)" stroke="color-mix(in oklab, var(--g2) 65%, transparent)" stroke-width="2" />`;

  const nearSvg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `${defs}` +
    `<g class="cl-group">${cells}</g>` +
    `${fgCell}</svg>`;

  return (
    `<i class="scn scn-cells scn-cl-far" style="--dx: 1.6; --dy: 1;" aria-hidden="true">${farSvg}</i>` +
    `<i class="scn scn-cells scn-cl-near" style="--dx: 4.2; --dy: 2.6;" aria-hidden="true">${nearSvg}</i>`
  );
}

function renderDna(rand: () => number): string {
  // Long double helix on the right third at -18 degrees
  // One period of 224px has 8 rungs at 28px
  const rungs: string[] = [];
  const strand1Pts: string[] = [];
  const strand2Pts: string[] = [];
  const amp = 65;
  const period = 224;
  const count = 10; // 10 periods = 2240px

  for (let k = 0; k < count * 8; k++) {
    const y = k * 28;
    const phi = (y / period) * Math.PI * 2;
    const x1 = Math.sin(phi) * amp;
    const x2 = -x1;
    const colorCls = k % 2 === 0 ? "rung-c2" : "rung-c3";
    rungs.push(`<line class="dna-rung ${colorCls}" x1="${x1.toFixed(1)}" y1="${y}" x2="${x2.toFixed(1)}" y2="${y}" />`);
    strand1Pts.push(`${x1.toFixed(1)},${y}`);
    strand2Pts.push(`${x2.toFixed(1)},${y}`);
  }

  const helixPattern =
    `<g class="dna-loop">` +
    rungs.join("") +
    `<path class="dna-strand dna-back" d="M ${strand2Pts.join(" L ")}" />` +
    `<path class="dna-strand dna-front" d="M ${strand1Pts.join(" L ")}" />` +
    `</g>`;

  const farSvg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<g transform="translate(1420 -200) rotate(-18) scale(0.65)" class="dna-helix-far">${helixPattern}</g></svg>`;

  const nearSvg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<g transform="translate(1260 -300) rotate(-18)" class="dna-helix-near">${helixPattern}</g></svg>`;

  return (
    `<i class="scn scn-dna scn-dna-far" style="--dx: 1.4; --dy: 0.9;" aria-hidden="true">${farSvg}</i>` +
    `<i class="scn scn-dna scn-dna-near" style="--dx: 4.4; --dy: 2.2;" aria-hidden="true">${nearSvg}</i>`
  );
}

function renderQuantum(rand: () => number): string {
  // Interference rings: two sources at (1180,260) and (1380,640); each emits 7 rings
  // circle of r=520 scaled 0->1 around its source over 14 s, linear, infinite, staggered 2 s with negative delays
  const ringsA = Array.from({ length: 7 }, (_, i) => {
    const delay = -(i * 2);
    return `<circle class="qm-ring qm-ra" cx="1180" cy="260" r="520" style="animation-delay: ${delay}s;" vector-effect="non-scaling-stroke" />`;
  }).join("");

  const ringsB = Array.from({ length: 7 }, (_, i) => {
    const delay = -(i * 2 + 1);
    return `<circle class="qm-ring qm-rb" cx="1380" cy="640" r="520" style="animation-delay: ${delay}s;" vector-effect="non-scaling-stroke" />`;
  }).join("");

  // Bloch sphere centred (1240,470), r=150
  // Outline 1.5px --g2 at .7, dashed equator ellipse rx150 ry42, dashed vertical axis,
  // meridian ellipse turning by scaleX 1 -> -1 -> 1 (16 s ease-in-out),
  // state arrow (line + small dot tip) from centre towards (+95,-105) precessing by scaleX oscillation around centre's x (12 s).
  const bx = 1240;
  const by = 470;
  const br = 150;
  const bloch =
    `<g class="qm-bloch" transform="translate(${bx} ${by})">` +
    `<circle class="qm-b-circle" cx="0" cy="0" r="${br}" />` +
    `<ellipse class="qm-b-eq" cx="0" cy="0" rx="${br}" ry="42" />` +
    `<line class="qm-b-axis" x1="0" y1="${-br - 22}" x2="0" y2="${br + 22}" />` +
    `<circle class="qm-b-pole" cx="0" cy="${-br}" r="3" />` +
    `<circle class="qm-b-pole" cx="0" cy="${br}" r="3" />` +
    `<ellipse class="qm-b-meridian" cx="0" cy="0" rx="${br}" ry="${br}" />` +
    `<g class="qm-b-arrow-wrap"><line class="qm-b-arrow" x1="0" y1="0" x2="95" y2="-105" />` +
    `<circle class="qm-b-tip" cx="95" cy="-105" r="4" /></g>` +
    `</g>`;

  // Probability cloud: 40 dots, Gaussian around sphere centre (sigma 110), r 1.5-3, twinkling .15-.6
  const cloudDots: string[] = [];
  for (let i = 0; i < 40; i++) {
    const u1 = Math.max(1e-6, rand());
    const u2 = rand();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
    const cx = Math.round(bx + z0 * 110);
    const cy = Math.round(by + z1 * 110);
    const r = (1.5 + rand() * 1.5).toFixed(1);
    cloudDots.push(`<circle class="qm-dot qmd${(i % 8) + 1}" cx="${cx}" cy="${cy}" r="${r}" />`);
  }

  // Mask the ring group with horizontal fade: transparent left of x=720, full right of x=1040
  const defs =
    `<defs>` +
    `<linearGradient id="qm-fade-grad" x1="0%" y1="0%" x2="100%" y2="0%">` +
    `<stop offset="0%" stop-color="#000000" />` +
    `<stop offset="45%" stop-color="#000000" />` +
    `<stop offset="65%" stop-color="#ffffff" />` +
    `<stop offset="100%" stop-color="#ffffff" />` +
    `</linearGradient>` +
    `<mask id="qm-ring-mask">` +
    `<rect x="0" y="0" width="1600" height="900" fill="url(#qm-fade-grad)" />` +
    `</mask>` +
    `</defs>`;

  const svg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `${defs}` +
    `<g class="qm-rings" mask="url(#qm-ring-mask)">${ringsA}${ringsB}</g>` +
    `<g class="qm-cloud">${cloudDots.join("")}</g>` +
    `${bloch}</svg>`;

  return `<i class="scn scn-quantum" style="--dx: 3.8; --dy: 2.2;" aria-hidden="true">${svg}</i>`;
}

function renderWaves(rand: () => number): string {
  // Smooth mathematical sine waves sampled at 800 points (step 4px over 3200px)
  // Wavelengths are harmonics of 1600px (400, 533.33, 320, 800) for seamless loop
  function sinePath(baseY: number, amp: number, wavelength: number, phase: number): string {
    const totalW = 3200;
    const step = 4;
    let d = `M 0,${(baseY + Math.sin(phase) * amp).toFixed(2)}`;
    for (let x = step; x <= totalW; x += step) {
      const y = baseY + Math.sin((x / wavelength) * Math.PI * 2 + phase) * amp;
      d += ` L ${x},${y.toFixed(2)}`;
    }
    return d;
  }

  const w1 = sinePath(570, 20, 400, 0);
  const w2 = sinePath(625, 28, 533.3333, 1.2);
  const w3 = sinePath(680, 22, 320, 2.5);
  const w4 = sinePath(735, 26, 800, 0.6) + " L 3200,950 L 0,950 Z";

  const svg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<defs><linearGradient id="wv-surf" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="var(--b2)" stop-opacity="0.32" />` +
    `<stop offset="55%" stop-color="var(--b1)" stop-opacity="0.14" />` +
    `<stop offset="100%" stop-color="var(--b1)" stop-opacity="0.02" /></linearGradient></defs>` +
    `<g class="wv-wrap">` +
    `<path class="wv-path wv-p1" d="${w1}" />` +
    `<path class="wv-path wv-p2" d="${w2}" />` +
    `<path class="wv-path wv-p3" d="${w3}" />` +
    `<path class="wv-path wv-p4" d="${w4}" />` +
    `</g></svg>`;

  return `<i class="scn scn-waves" style="--dx: 3.2; --dy: 1.8;" aria-hidden="true">${svg}</i>`;
}

function renderMolecules(rand: () => number): string {
  // Hexagonal lattice in the top right corner
  const hexLines: string[] = [];
  const s = 30; // hex side
  const h = s * Math.sqrt(3);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = 1240 + col * (s * 3) + (row % 2 ? s * 1.5 : 0);
      const cy = 40 + row * (h * 0.5);
      hexLines.push(
        `<polygon class="mol-hex" points="${cx + s},${cy} ${cx + s / 2},${cy + h / 2} ${cx - s / 2},${cy + h / 2} ${cx - s},${cy} ${cx - s / 2},${cy - h / 2} ${cx + s / 2},${cy - h / 2}" />`,
      );
    }
  }

  const defs =
    `<defs>` +
    // H: highlight at 30% 30%, body colour --fg mix ~85%, darker rim
    `<radialGradient id="mol-sh-h" cx="30%" cy="30%" r="70%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />` +
    `<stop offset="30%" stop-color="color-mix(in oklab, var(--fg) 85%, #ffffff)" stop-opacity="0.92" />` +
    `<stop offset="70%" stop-color="color-mix(in oklab, var(--fg) 85%, #888888)" stop-opacity="0.90" />` +
    `<stop offset="100%" stop-color="color-mix(in oklab, var(--fg) 60%, #000000)" stop-opacity="0.95" />` +
    `</radialGradient>` +
    // C: highlight at 30% 30%, body colour --fg mix ~45%, darker rim
    `<radialGradient id="mol-sh-c" cx="30%" cy="30%" r="70%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.65" />` +
    `<stop offset="30%" stop-color="color-mix(in oklab, var(--fg) 60%, #ffffff)" stop-opacity="0.88" />` +
    `<stop offset="65%" stop-color="color-mix(in oklab, var(--fg) 45%, #000000)" stop-opacity="0.92" />` +
    `<stop offset="100%" stop-color="color-mix(in oklab, var(--fg) 25%, #000000)" stop-opacity="0.98" />` +
    `</radialGradient>` +
    // O: highlight at 30% 30%, body colour --red muted toward --fg, darker rim
    `<radialGradient id="mol-sh-o" cx="30%" cy="30%" r="70%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.70" />` +
    `<stop offset="30%" stop-color="color-mix(in oklab, color-mix(in oklab, var(--red) 75%, var(--fg)) 80%, #ffffff)" stop-opacity="0.92" />` +
    `<stop offset="68%" stop-color="color-mix(in oklab, var(--red) 75%, var(--fg))" stop-opacity="0.94" />` +
    `<stop offset="100%" stop-color="color-mix(in oklab, color-mix(in oklab, var(--red) 75%, var(--fg)) 40%, #000000)" stop-opacity="0.98" />` +
    `</radialGradient>` +
    `</defs>`;

  // 1. Benzene at (1340, 200): hexagon r=70 with alternating double bonds and 6 short C-H bonds, in focus, rotating 120s
  const bzPts: Array<{ x: number; y: number }> = [];
  const bzHPts: Array<{ x: number; y: number }> = [];
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    bzPts.push({ x: +(70 * Math.cos(ang)).toFixed(1), y: +(70 * Math.sin(ang)).toFixed(1) });
    bzHPts.push({ x: +(88 * Math.cos(ang)).toFixed(1), y: +(88 * Math.sin(ang)).toFixed(1) });
  }
  const bzBonds: string[] = [];
  for (let k = 0; k < 6; k++) {
    const p1 = bzPts[k]!;
    const p2 = bzPts[(k + 1) % 6]!;
    if (k % 2 === 0) {
      // Double bond: outer and inner parallel line
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const mLen = Math.hypot(mx, my);
      const nx = -(mx / mLen) * 6;
      const ny = -(my / mLen) * 6;
      bzBonds.push(`<line class="mol-bond" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" />`);
      bzBonds.push(`<line class="mol-bond-d" x1="${+(p1.x + nx).toFixed(1)}" y1="${+(p1.y + ny).toFixed(1)}" x2="${+(p2.x + nx).toFixed(1)}" y2="${+(p2.y + ny).toFixed(1)}" />`);
    } else {
      bzBonds.push(`<line class="mol-bond" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" />`);
    }
    // C-H bond
    const hp = bzHPts[k]!;
    bzBonds.push(`<line class="mol-bond" x1="${p1.x}" y1="${p1.y}" x2="${hp.x}" y2="${hp.y}" />`);
  }
  const bzAtoms =
    bzHPts.map((hp) => `<circle class="mol-atom" cx="${hp.x}" cy="${hp.y}" r="8" fill="url(#mol-sh-h)" />`).join("") +
    bzPts.map((cp) => `<circle class="mol-atom" cx="${cp.x}" cy="${cp.y}" r="13" fill="url(#mol-sh-c)" />`).join("");

  const molBenzene =
    `<g transform="translate(1340 200)"><g class="mol-float mol-f1"><g class="mol-rot mol-rot-1">` +
    bzBonds.join("") +
    bzAtoms +
    `</g></g></g>`;

  // 2. Water at (1060, 330): O r=22, two H r=13 at 104.5°, bond 60, in focus, floating
  const wHalf = (104.5 / 2) * (Math.PI / 180);
  const wBond = 60;
  const wH1x = +(-wBond * Math.sin(wHalf)).toFixed(1);
  const wH1y = +(wBond * Math.cos(wHalf) - 18).toFixed(1);
  const wH2x = +(wBond * Math.sin(wHalf)).toFixed(1);
  const wH2y = wH1y;
  const wOy = -18;

  const molWater =
    `<g transform="translate(1060 330)"><g class="mol-float mol-f2"><g class="mol-rot mol-rot-2">` +
    `<line class="mol-bond" x1="0" y1="${wOy}" x2="${wH1x}" y2="${wH1y}" />` +
    `<line class="mol-bond" x1="0" y1="${wOy}" x2="${wH2x}" y2="${wH2y}" />` +
    `<circle class="mol-atom" cx="0" cy="${wOy}" r="22" fill="url(#mol-sh-o)" />` +
    `<circle class="mol-atom" cx="${wH1x}" cy="${wH1y}" r="13" fill="url(#mol-sh-h)" />` +
    `<circle class="mol-atom" cx="${wH2x}" cy="${wH2y}" r="13" fill="url(#mol-sh-h)" />` +
    `</g></g></g>`;

  // 3. CO2 at (1450, 520): O=C=O linear, C r=16, O r=20, double bonds drawn as two parallel lines, bond 70, in focus
  const molCO2 =
    `<g transform="translate(1450 520)"><g class="mol-float mol-f3"><g class="mol-rot mol-rot-3">` +
    `<line class="mol-bond-d" x1="-70" y1="-3.5" x2="0" y2="-3.5" />` +
    `<line class="mol-bond-d" x1="-70" y1="3.5" x2="0" y2="3.5" />` +
    `<line class="mol-bond-d" x1="0" y1="-3.5" x2="70" y2="-3.5" />` +
    `<line class="mol-bond-d" x1="0" y1="3.5" x2="70" y2="3.5" />` +
    `<circle class="mol-atom" cx="0" cy="0" r="16" fill="url(#mol-sh-c)" />` +
    `<circle class="mol-atom" cx="-70" cy="0" r="20" fill="url(#mol-sh-o)" />` +
    `<circle class="mol-atom" cx="70" cy="0" r="20" fill="url(#mol-sh-o)" />` +
    `</g></g></g>`;

  // 4. CH4 at (1150, 640): C r=18, 4 H r=11 in tetrahedral projection (one H behind, partly hidden), 1px blur
  const molCH4 =
    `<g transform="translate(1150 640)"><g class="mol-float mol-f4"><g class="mol-rot mol-rot-4 mol-blur-1">` +
    `<line class="mol-bond" x1="0" y1="0" x2="16" y2="18" />` +
    `<circle class="mol-atom" cx="16" cy="18" r="11" fill="url(#mol-sh-h)" />` +
    `<line class="mol-bond" x1="0" y1="0" x2="0" y2="-48" />` +
    `<line class="mol-bond" x1="0" y1="0" x2="-44" y2="28" />` +
    `<line class="mol-bond" x1="0" y1="0" x2="44" y2="28" />` +
    `<circle class="mol-atom" cx="0" cy="0" r="18" fill="url(#mol-sh-c)" />` +
    `<circle class="mol-atom" cx="0" cy="-48" r="11" fill="url(#mol-sh-h)" />` +
    `<circle class="mol-atom" cx="-44" cy="28" r="11" fill="url(#mol-sh-h)" />` +
    `<circle class="mol-atom" cx="44" cy="28" r="11" fill="url(#mol-sh-h)" />` +
    `</g></g></g>`;

  // 5. Small chain C-C-O with hydrogens at (1430, 780): scale .6, 3px blur
  const molChain =
    `<g transform="translate(1430 780)"><g class="mol-float mol-f5"><g transform="scale(0.6)"><g class="mol-rot mol-rot-5 mol-blur-3">` +
    `<line class="mol-bond" x1="-36" y1="12" x2="0" y2="-12" />` +
    `<line class="mol-bond" x1="0" y1="-12" x2="36" y2="12" />` +
    // H on C1 (-36, 12)
    `<line class="mol-bond" x1="-36" y1="12" x2="-54" y2="4" />` +
    `<line class="mol-bond" x1="-36" y1="12" x2="-42" y2="32" />` +
    `<line class="mol-bond" x1="-36" y1="12" x2="-36" y2="-10" />` +
    `<circle class="mol-atom" cx="-54" cy="4" r="8" fill="url(#mol-sh-h)" />` +
    `<circle class="mol-atom" cx="-42" cy="32" r="8" fill="url(#mol-sh-h)" />` +
    `<circle class="mol-atom" cx="-36" cy="-10" r="8" fill="url(#mol-sh-h)" />` +
    // H on C2 (0, -12)
    `<line class="mol-bond" x1="0" y1="-12" x2="0" y2="-32" />` +
    `<line class="mol-bond" x1="0" y1="-12" x2="-14" y2="-24" />` +
    `<circle class="mol-atom" cx="0" cy="-32" r="8" fill="url(#mol-sh-h)" />` +
    `<circle class="mol-atom" cx="-14" cy="-24" r="8" fill="url(#mol-sh-h)" />` +
    // H on O (36, 12)
    `<line class="mol-bond" x1="36" y1="12" x2="54" y2="24" />` +
    `<circle class="mol-atom" cx="54" cy="24" r="8" fill="url(#mol-sh-h)" />` +
    // C and O atoms
    `<circle class="mol-atom" cx="-36" cy="12" r="14" fill="url(#mol-sh-c)" />` +
    `<circle class="mol-atom" cx="0" cy="-12" r="14" fill="url(#mol-sh-c)" />` +
    `<circle class="mol-atom" cx="36" cy="12" r="17" fill="url(#mol-sh-o)" />` +
    `</g></g></g></g>`;

  // 6. Far water at (980, 120): scale .5, 3px blur
  const molFarWater =
    `<g transform="translate(980 120)"><g class="mol-float mol-f6"><g transform="scale(0.5)"><g class="mol-rot mol-rot-6 mol-blur-3">` +
    `<line class="mol-bond" x1="0" y1="${wOy}" x2="${wH1x}" y2="${wH1y}" />` +
    `<line class="mol-bond" x1="0" y1="${wOy}" x2="${wH2x}" y2="${wH2y}" />` +
    `<circle class="mol-atom" cx="0" cy="${wOy}" r="22" fill="url(#mol-sh-o)" />` +
    `<circle class="mol-atom" cx="${wH1x}" cy="${wH1y}" r="13" fill="url(#mol-sh-h)" />` +
    `<circle class="mol-atom" cx="${wH2x}" cy="${wH2y}" r="13" fill="url(#mol-sh-h)" />` +
    `</g></g></g></g>`;

  const svg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `${defs}` +
    `<g class="mol-lattice">${hexLines.join("")}</g>` +
    `<g class="mol-group">${molBenzene}${molWater}${molCO2}${molCH4}${molChain}${molFarWater}</g></svg>`;

  return `<i class="scn scn-molecules" style="--dx: 3.6; --dy: 2.2;" aria-hidden="true">${svg}</i>`;
}

function renderCircuit(rand: () => number): string {
  // Lower right chip package centered at (1380, 680)
  const chipX = 1380;
  const chipY = 680;
  const chipW = 110;
  const chipH = 110;
  const pins: string[] = [];
  for (let k = 0; k < 6; k++) {
    const offset = -40 + k * 16;
    pins.push(`<line class="cir-pin" x1="${chipX + offset}" y1="${chipY - chipH / 2 - 10}" x2="${chipX + offset}" y2="${chipY - chipH / 2}" />`);
    pins.push(`<line class="cir-pin" x1="${chipX + offset}" y1="${chipY + chipH / 2}" x2="${chipX + offset}" y2="${chipY + chipH / 2 + 10}" />`);
    pins.push(`<line class="cir-pin" x1="${chipX - chipW / 2 - 10}" y1="${chipY + offset}" x2="${chipX - chipW / 2}" y2="${chipY + offset}" />`);
    pins.push(`<line class="cir-pin" x1="${chipX + chipW / 2}" y1="${chipY + offset}" x2="${chipX + chipW / 2 + 10}" y2="${chipY + offset}" />`);
  }

  // 14 orthogonal PCB traces with 45 degree chamfers
  const traces = [
    { d: "M 1620,120 L 1420,120 L 1340,200 L 1340,380", pulse: true, pClass: "cp1" },
    { d: "M 1620,220 L 1480,220 L 1410,290 L 1410,500 L 1380,530", pulse: false, pClass: "" },
    { d: "M 1620,340 L 1520,340 L 1450,410 L 1450,600", pulse: true, pClass: "cp2" },
    { d: "M 1120,40 L 1120,140 L 1190,210 L 1290,210", pulse: false, pClass: "" },
    { d: "M 1260,40 L 1260,110 L 1320,170 L 1520,170", pulse: true, pClass: "cp3" },
    { d: "M 1020,300 L 1140,300 L 1210,370 L 1210,520 L 1260,570 L 1260,630", pulse: true, pClass: "cp4" },
    { d: "M 980,480 L 1090,480 L 1160,550 L 1280,550", pulse: false, pClass: "" },
    { d: "M 1040,640 L 1180,640 L 1220,680 L 1310,680", pulse: true, pClass: "cp5" },
    { d: "M 1620,520 L 1520,520 L 1470,570 L 1470,640", pulse: false, pClass: "" },
    { d: "M 1620,780 L 1500,780 L 1450,730 L 1440,730", pulse: true, pClass: "cp6" },
    { d: "M 1150,860 L 1220,790 L 1310,790 L 1350,750", pulse: false, pClass: "" },
    { d: "M 1380,860 L 1380,750", pulse: false, pClass: "" },
    { d: "M 1480,860 L 1480,790 L 1430,740", pulse: false, pClass: "" },
    { d: "M 1620,640 L 1540,640 L 1500,680 L 1450,680", pulse: false, pClass: "" },
  ];

  const traceElements = traces
    .map((tr) => {
      const lastCoord = tr.d.split(" ").pop() ?? "0,0";
      const [px, py] = lastCoord.split(",");
      const pad = px && py ? `<circle class="cir-pad" cx="${px}" cy="${py}" r="3.5" />` : "";
      const pulseEl = tr.pulse ? `<path class="cir-pulse ${tr.pClass}" d="${tr.d}" />` : "";
      return `<path class="cir-trace" d="${tr.d}" />${pad}${pulseEl}`;
    })
    .join("");

  const chip =
    `<g class="cir-chip" transform="translate(${chipX} ${chipY})">` +
    `<rect class="cir-body" x="${-chipW / 2}" y="${-chipH / 2}" width="${chipW}" height="${chipH}" rx="8" />` +
    `<circle class="cir-dot" cx="${-chipW / 2 + 14}" cy="${-chipH / 2 + 14}" r="4" />` +
    `</g>` +
    pins.join("");

  const svg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<g class="cir-group">${traceElements}${chip}</g></svg>`;

  return `<i class="scn scn-circuit" style="--dx: 3.5; --dy: 2;" aria-hidden="true">${svg}</i>`;
}

function renderNetwork(rand: () => number): string {
  // 28 nodes, concentrated on the right (x: 820..1520), keeping left calm
  const nodes: Array<{ x: number; y: number; r: number; fire?: boolean }> = [];
  const nodeCount = 28;
  for (let i = 0; i < nodeCount; i++) {
    const x = Math.round(820 + rand() * 700);
    const y = Math.round(120 + rand() * 660);
    const r = +(3.5 + rand() * 2.5).toFixed(1);
    const fire = i % 7 === 0;
    nodes.push({ x, y, r, fire });
  }

  // Connect each node to 2 nearest neighbors
  const edges: Array<{ x1: number; y1: number; x2: number; y2: number; pulse?: boolean }> = [];
  const edgeKeys = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    const dists: Array<{ j: number; d: number }> = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const b = nodes[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 280) dists.push({ j, d });
    }
    dists.sort((p, q) => p.d - q.d);
    for (const near of dists.slice(0, 2)) {
      const k1 = Math.min(i, near.j);
      const k2 = Math.max(i, near.j);
      const key = `${k1}-${k2}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        const b = nodes[near.j]!;
        edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, pulse: edgeKeys.size % 4 === 0 });
      }
    }
  }

  const edgeElements = edges
    .map((e, idx) => {
      const line = `<line class="net-edge" x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" />`;
      const pulse = e.pulse ? `<line class="net-pulse np${(idx % 6) + 1}" x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" />` : "";
      return line + pulse;
    })
    .join("");

  const nodeElements = nodes
    .map((n, idx) => {
      const cls = n.fire ? `net-node net-fire nf${(idx % 4) + 1}` : "net-node";
      return `<circle class="${cls}" cx="${n.x}" cy="${n.y}" r="${n.r}" />`;
    })
    .join("");

  const svg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<g class="net-edges">${edgeElements}</g>` +
    `<g class="net-nodes">${nodeElements}</g></svg>`;

  return `<i class="scn scn-network" style="--dx: 3.8; --dy: 2.2;" aria-hidden="true">${svg}</i>`;
}

function renderCode(rand: () => number): string {
  // Abstract editor window on the right: x 1060 to 1540 (width 480), y 160 to 740 (height 580)
  const wx = 1060;
  const wy = 160;
  const ww = 480;
  const wh = 580;

  // Window frame & traffic lights
  const frame =
    `<rect class="cd-win" x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="12" />` +
    `<circle class="cd-dot d1" cx="${wx + 22}" cy="${wy + 22}" r="5" />` +
    `<circle class="cd-dot d2" cx="${wx + 38}" cy="${wy + 22}" r="5" />` +
    `<circle class="cd-dot d3" cx="${wx + 54}" cy="${wy + 22}" r="5" />` +
    `<line class="cd-div" x1="${wx}" y1="${wy + 44}" x2="${wx + ww}" y2="${wy + 44}" />`;

  // 16 lines of code token bars (repeated twice for seamless loop)
  const lineTemplates = [
    [{ w: 55, c: "c2" }, { w: 90, c: "fg" }, { w: 40, c: "c3" }],
    [{ w: 75, c: "fg", ind: 1 }, { w: 120, c: "c3" }],
    [{ w: 45, c: "c2", ind: 1 }, { w: 85, c: "fg" }, { w: 60, c: "c2" }],
    [{ w: 110, c: "fg", ind: 2 }, { w: 45, c: "c3" }],
    [{ w: 90, c: "fg", ind: 2 }, { w: 75, c: "c2" }],
    [{ w: 60, c: "c2", ind: 1 }, { w: 70, c: "fg" }],
    [{ w: 80, c: "fg", ind: 2 }],
    [],
    [{ w: 65, c: "c2" }, { w: 110, c: "fg" }, { w: 50, c: "c3" }],
    [{ w: 95, c: "fg", ind: 1 }, { w: 65, c: "c2" }],
    [{ w: 50, c: "c2", ind: 1 }, { w: 80, c: "fg" }, { w: 90, c: "c3" }],
    [{ w: 130, c: "fg", ind: 2 }],
    [{ w: 70, c: "c2", ind: 2 }, { w: 55, c: "fg" }],
    [{ w: 85, c: "fg", ind: 1 }, { w: 40, c: "c3" }],
    [{ w: 45, c: "c2" }, { w: 60, c: "fg" }],
    [],
  ];

  function renderBlock(startY: number, hasCaret: boolean): string {
    const bars: string[] = [];
    const lineH = 28;
    lineTemplates.forEach((tokens, idx) => {
      const y = startY + idx * lineH;
      let curX = wx + 36;
      tokens.forEach((t, tIdx) => {
        const ind = (t.ind ?? 0) * 24;
        const x = curX + (tIdx === 0 ? ind : 10);
        bars.push(`<rect class="cd-tok ${t.c}" x="${x}" y="${y}" width="${t.w}" height="7" rx="3.5" />`);
        curX = x + t.w;
      });
      if (hasCaret && idx === 4) {
        bars.push(`<rect class="cd-caret" x="${curX + 12}" y="${y - 3}" width="2.5" height="14" rx="1" />`);
      }
    });
    return bars.join("");
  }

  const block1 = renderBlock(0, true);
  const block2 = renderBlock(16 * 28, false);

  const svg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<defs><clipPath id="cd-clip"><rect x="${wx}" y="${wy + 45}" width="${ww}" height="${wh - 45}" /></clipPath></defs>` +
    `${frame}` +
    `<g clip-path="url(#cd-clip)"><g class="cd-scroller" transform="translate(0 ${wy + 65})">` +
    `${block1}${block2}` +
    `</g></g></svg>`;

  return `<i class="scn scn-code" style="--dx: 3.5; --dy: 2;" aria-hidden="true">${svg}</i>`;
}

function renderOrbits(rand: () => number): string {
  // Center star off the right edge at (1700, 450)
  const cx = 1700;
  const cy = 450;

  const defs =
    `<defs>` +
    `<radialGradient id="orb-star-glow" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%" stop-color="var(--g1)" stop-opacity="0.55" />` +
    `<stop offset="45%" stop-color="var(--g1)" stop-opacity="0.22" />` +
    `<stop offset="80%" stop-color="var(--g1)" stop-opacity="0.05" />` +
    `<stop offset="100%" stop-color="var(--g1)" stop-opacity="0" />` +
    `</radialGradient>` +
    `<radialGradient id="orb-sh-c4" cx="32%" cy="30%" r="68%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.75" />` +
    `<stop offset="35%" stop-color="var(--c4)" stop-opacity="0.95" />` +
    `<stop offset="100%" stop-color="color-mix(in oklab, var(--c4) 30%, #000000)" stop-opacity="1" />` +
    `</radialGradient>` +
    `<radialGradient id="orb-sh-acc2" cx="32%" cy="30%" r="68%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.75" />` +
    `<stop offset="35%" stop-color="var(--accent2)" stop-opacity="0.95" />` +
    `<stop offset="100%" stop-color="color-mix(in oklab, var(--accent2) 30%, #000000)" stop-opacity="1" />` +
    `</radialGradient>` +
    `<radialGradient id="orb-sh-c3" cx="32%" cy="30%" r="68%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.75" />` +
    `<stop offset="35%" stop-color="var(--c3)" stop-opacity="0.95" />` +
    `<stop offset="100%" stop-color="color-mix(in oklab, var(--c3) 30%, #000000)" stop-opacity="1" />` +
    `</radialGradient>` +
    `<radialGradient id="orb-sh-c2" cx="32%" cy="30%" r="68%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.75" />` +
    `<stop offset="35%" stop-color="var(--c2)" stop-opacity="0.95" />` +
    `<stop offset="100%" stop-color="color-mix(in oklab, var(--c2) 30%, #000000)" stop-opacity="1" />` +
    `</radialGradient>` +
    `</defs>`;

  const starGlow = `<circle class="orb-star" cx="${cx}" cy="${cy}" r="260" />`;

  // 4 orbits centred on star, in a group rotated -14°
  // ellipses rx 260/420/600/820, ry = 0.32*rx, stroke --fg at ~18%, 1.5px, outer two dashed "4 10"
  // planets travel ON exact ellipses with offset-path, periods 40/70/110/160 s, radii 4, 7, 12 (tilted ring rx 22 ry 6), 9
  const orbits = [
    { rx: 260, ry: +(260 * 0.32).toFixed(1), dur: 40, delay: -3, pr: 4, sh: "url(#orb-sh-c4)", dashed: false, ring: false },
    { rx: 420, ry: +(420 * 0.32).toFixed(1), dur: 70, delay: -64, pr: 7, sh: "url(#orb-sh-acc2)", dashed: false, ring: false },
    { rx: 600, ry: +(600 * 0.32).toFixed(1), dur: 110, delay: -9, pr: 12, sh: "url(#orb-sh-c3)", dashed: true, ring: true },
    { rx: 820, ry: +(820 * 0.32).toFixed(1), dur: 160, delay: -148, pr: 9, sh: "url(#orb-sh-c2)", dashed: true, ring: false },
  ];

  const orbitElements = orbits
    .map((o, idx) => {
      const trackCls = o.dashed ? "orb-track dashed" : "orb-track";
      const pathD = `M ${cx - o.rx},${cy} a ${o.rx},${o.ry} 0 1,0 ${o.rx * 2},0 a ${o.rx},${o.ry} 0 1,0 ${-o.rx * 2},0`;
      const ringEl = o.ring
        ? `<ellipse cx="0" cy="0" rx="22" ry="6" fill="none" stroke="color-mix(in oklab, var(--c3) 70%, transparent)" stroke-width="1.5" transform="rotate(-18)" />`
        : "";
      return (
        `<ellipse class="${trackCls}" cx="${cx}" cy="${cy}" rx="${o.rx}" ry="${o.ry}" />` +
        `<g class="orb-pw pw${idx + 1}" style="offset-path: path('${pathD}'); animation-duration: ${o.dur}s; animation-delay: ${o.delay}s;">` +
        `<circle cx="0" cy="0" r="${o.pr}" fill="${o.sh}" />` +
        `${ringEl}` +
        `</g>`
      );
    })
    .join("");

  const svg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `${defs}` +
    `${starGlow}` +
    `<g class="orb-system" transform="rotate(-14 ${cx} ${cy})">${orbitElements}</g></svg>`;

  return `<i class="scn scn-orbits" style="--dx: 2.8; --dy: 1.6;" aria-hidden="true">${svg}</i>`;
}

function renderGeometry(rand: () => number): string {
  // Center of main circular construction at (1260, 450)
  const gx = 1260;
  const gy = 450;
  const gr = 190;

  // Background grid
  const gridLines: string[] = [];
  for (let x = 860; x <= 1560; x += 70) {
    gridLines.push(`<line class="geo-grid" x1="${x}" y1="80" x2="${x}" y2="820" />`);
  }
  for (let y = 100; y <= 800; y += 70) {
    gridLines.push(`<line class="geo-grid" x1="860" y1="${y}" x2="1560" y2="${y}" />`);
  }

  // Equilateral triangle inscribed in circle (side: gr * sqrt(3))
  const tPts = [
    `${gx},${gy - gr}`,
    `${(gx + gr * Math.cos(Math.PI / 6)).toFixed(1)},${(gy + gr * Math.sin(Math.PI / 6)).toFixed(1)}`,
    `${(gx - gr * Math.cos(Math.PI / 6)).toFixed(1)},${(gy + gr * Math.sin(Math.PI / 6)).toFixed(1)}`,
  ].join(" ");

  // Sine curve along horizontal axis
  const sinePath =
    `M 860,680 ` +
    `Q 945,630 1030,680 T 1200,680 T 1370,680 T 1540,680`;

  const svg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<g class="geo-grid-wrap">${gridLines.join("")}</g>` +
    `<line class="geo-axis" x1="860" y1="680" x2="1540" y2="680" />` +
    `<path class="geo-sine" d="${sinePath}" />` +
    `<line class="geo-tangent" x1="980" y1="${gy - gr}" x2="1540" y2="${gy - gr}" />` +
    `<circle class="geo-circle" cx="${gx}" cy="${gy}" r="${gr}" />` +
    `<polygon class="geo-tri" points="${tPts}" transform-origin="${gx} ${gy}" />` +
    `<circle class="geo-pt" cx="${gx}" cy="${gy}" r="4" />` +
    `<circle class="geo-pt" cx="${gx}" cy="${gy - gr}" r="4.5" />` +
    `</svg>`;

  return `<i class="scn scn-geometry" style="--dx: 3.4; --dy: 2;" aria-hidden="true">${svg}</i>`;
}

function renderInk(rand: () => number): string {
  const defs =
    `<defs>` +
    `<radialGradient id="ink-cloud-grad" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%" stop-color="var(--ink-tint)" stop-opacity="1" />` +
    `<stop offset="50%" stop-color="var(--ink-tint)" stop-opacity="0.65" />` +
    `<stop offset="80%" stop-color="var(--ink-tint)" stop-opacity="0.2" />` +
    `<stop offset="100%" stop-color="var(--ink-tint)" stop-opacity="0" />` +
    `</radialGradient>` +
    `<mask id="ink-stroke-mask">` +
    `<path class="ink-mask-stroke" d="M 1050,710 C 1190,530 1370,830 1530,650" fill="none" stroke="#ffffff" stroke-width="60" stroke-linecap="round" pathLength="700" />` +
    `</mask>` +
    `</defs>`;

  // Three ink clouds on the right half, each 4-6 overlapping elongated blobs with radial-gradient fills, blurred 28-48px
  const cloud1 =
    `<g class="ink-cloud ic1">` +
    `<ellipse cx="1330" cy="240" rx="145" ry="85" transform="rotate(25 1330 240)" fill="url(#ink-cloud-grad)" />` +
    `<ellipse cx="1350" cy="225" rx="120" ry="70" transform="rotate(-35 1350 225)" fill="url(#ink-cloud-grad)" />` +
    `<ellipse cx="1310" cy="265" rx="130" ry="75" transform="rotate(70 1310 265)" fill="url(#ink-cloud-grad)" />` +
    `<ellipse cx="1360" cy="270" rx="110" ry="60" transform="rotate(-15 1360 270)" fill="url(#ink-cloud-grad)" />` +
    `<ellipse cx="1295" cy="220" rx="95" ry="55" transform="rotate(45 1295 220)" fill="url(#ink-cloud-grad)" />` +
    `</g>`;

  const cloud2 =
    `<g class="ink-cloud ic2">` +
    `<ellipse cx="1410" cy="560" rx="160" ry="90" transform="rotate(-20 1410 560)" fill="url(#ink-cloud-grad)" />` +
    `<ellipse cx="1370" cy="535" rx="130" ry="75" transform="rotate(40 1370 535)" fill="url(#ink-cloud-grad)" />` +
    `<ellipse cx="1450" cy="590" rx="135" ry="80" transform="rotate(-55 1450 590)" fill="url(#ink-cloud-grad)" />` +
    `<ellipse cx="1430" cy="530" rx="105" ry="65" transform="rotate(15 1430 530)" fill="url(#ink-cloud-grad)" />` +
    `<ellipse cx="1380" cy="600" rx="90" ry="55" transform="rotate(-30 1380 600)" fill="url(#ink-cloud-grad)" />` +
    `</g>`;

  const cloud3 =
    `<g class="ink-cloud ic3">` +
    `<ellipse cx="1140" cy="660" rx="135" ry="80" transform="rotate(30 1140 660)" fill="url(#ink-cloud-grad)" />` +
    `<ellipse cx="1110" cy="635" rx="110" ry="65" transform="rotate(-40 1110 635)" fill="url(#ink-cloud-grad)" />` +
    `<ellipse cx="1170" cy="685" rx="120" ry="70" transform="rotate(65 1170 685)" fill="url(#ink-cloud-grad)" />` +
    `<ellipse cx="1150" cy="630" rx="95" ry="55" transform="rotate(-15 1150 630)" fill="url(#ink-cloud-grad)" />` +
    `<ellipse cx="1095" cy="675" rx="85" ry="50" transform="rotate(50 1095 675)" fill="url(#ink-cloud-grad)" />` +
    `</g>`;

  // S-shaped flourish ~700px long drawn as a FILLED tapered outline built from centreline
  // with width w(t) = 4 + 26*sin(pi t)^0.8
  const p0 = { x: 1050, y: 710 };
  const p1 = { x: 1190, y: 530 };
  const p2 = { x: 1370, y: 830 };
  const p3 = { x: 1530, y: 650 };

  const N = 80;
  const leftPts: Array<{ x: number; y: number }> = [];
  const rightPts: Array<{ x: number; y: number }> = [];
  const s1Pts: Array<{ x: number; y: number }> = [];
  const s2Pts: Array<{ x: number; y: number }> = [];
  const s3Pts: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const it = 1 - t;
    const bx = it * it * it * p0.x + 3 * it * it * t * p1.x + 3 * it * t * t * p2.x + t * t * t * p3.x;
    const by = it * it * it * p0.y + 3 * it * it * t * p1.y + 3 * it * t * t * p2.y + t * t * t * p3.y;

    const dx = 3 * it * it * (p1.x - p0.x) + 6 * it * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
    const dy = 3 * it * it * (p1.y - p0.y) + 6 * it * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const w = 4 + 26 * Math.pow(Math.sin(Math.PI * t), 0.8);
    const h = w / 2;

    leftPts.push({ x: +(bx + nx * h).toFixed(1), y: +(by + ny * h).toFixed(1) });
    rightPts.push({ x: +(bx - nx * h).toFixed(1), y: +(by - ny * h).toFixed(1) });

    if (t >= 0.12 && t <= 0.88) {
      const off = w / 3;
      s1Pts.push({ x: +(bx + nx * off).toFixed(1), y: +(by + ny * off).toFixed(1) });
    }
    if (t >= 0.08 && t <= 0.92) {
      const off = -w / 3;
      s2Pts.push({ x: +(bx + nx * off).toFixed(1), y: +(by + ny * off).toFixed(1) });
    }
    if (t >= 0.22 && t <= 0.78) {
      const off = w / 6;
      s3Pts.push({ x: +(bx + nx * off).toFixed(1), y: +(by + ny * off).toFixed(1) });
    }
  }

  let outlineD = `M ${leftPts[0]!.x},${leftPts[0]!.y}`;
  for (let i = 1; i <= N; i++) {
    outlineD += ` L ${leftPts[i]!.x},${leftPts[i]!.y}`;
  }
  for (let i = N; i >= 0; i--) {
    outlineD += ` L ${rightPts[i]!.x},${rightPts[i]!.y}`;
  }
  outlineD += " Z";

  const strand1D = `M ${s1Pts.map((p) => `${p.x},${p.y}`).join(" L ")}`;
  const strand2D = `M ${s2Pts.map((p) => `${p.x},${p.y}`).join(" L ")}`;
  const strand3D = `M ${s3Pts.map((p) => `${p.x},${p.y}`).join(" L ")}`;

  const brushStroke =
    `<g class="ink-brush" mask="url(#ink-stroke-mask)">` +
    `<path class="ink-brush-body" d="${outlineD}" />` +
    `<path class="ink-dry-strand" stroke-width="1.2" d="${strand1D}" />` +
    `<path class="ink-dry-strand" stroke-width="1.0" d="${strand2D}" />` +
    `<path class="ink-dry-strand" stroke-width="0.8" d="${strand3D}" />` +
    `</g>`;

  const svg =
    `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `${defs}` +
    `<g class="ink-clouds">${cloud1}${cloud2}${cloud3}</g>` +
    `${brushStroke}` +
    `</svg>`;

  return `<i class="scn scn-ink" style="--dx: 3.2; --dy: 1.8;" aria-hidden="true">${svg}</i>`;
}

/** Render HTML markup for a given scene, deterministic per scene + title. */
export function renderSceneLayers(scene: Scene, seedTitle: string): string {
  const rand = seedPrng(scene + ":" + seedTitle);
  switch (scene) {
    case "leaves":
      return renderLeaves(rand);
    case "cells":
      return renderCells(rand);
    case "dna":
      return renderDna(rand);
    case "quantum":
      return renderQuantum(rand);
    case "waves":
      return renderWaves(rand);
    case "molecules":
      return renderMolecules(rand);
    case "circuit":
      return renderCircuit(rand);
    case "network":
      return renderNetwork(rand);
    case "code":
      return renderCode(rand);
    case "orbits":
      return renderOrbits(rand);
    case "geometry":
      return renderGeometry(rand);
    case "ink":
      return renderInk(rand);
  }
}
