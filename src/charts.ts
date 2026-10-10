/**
 * Server-side SVG/HTML charts. Elements carry data-a hooks so the runtime can
 * grow bars, draw lines and sweep donut segments when the slide appears.
 */
import { esc } from "./util.js";

export interface ChartSpec {
  kind: "bar" | "hbar" | "line" | "area" | "donut";
  labels: string[];
  series: Array<{ name?: string; values: number[]; color?: string }>;
  unit?: string;
  max?: number;
  highlight?: number;
  lang: string;
}

export const PALETTE = ["var(--accent)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

function niceStep(range: number, ticks = 4): number {
  const rough = range / ticks;
  const pow = 10 ** Math.floor(Math.log10(rough || 1));
  const n = rough / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

function fmt(lang: string, v: number): string {
  try {
    return new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(v);
  } catch {
    return String(v);
  }
}

const decimalsOf = (v: number): number => (Number.isInteger(v) ? 0 : Math.min(2, (String(v).split(".")[1] ?? "").length));

function countSpan(lang: string, v: number, unit = ""): string {
  return `<tspan data-count="${v}" data-dec="${decimalsOf(v)}">${esc(fmt(lang, v))}</tspan>${unit ? `<tspan class="u">${esc(unit)}</tspan>` : ""}`;
}

function gradDefs(id: string, colors: string[], vertical = true): string {
  return colors
    .map(
      (c, i) =>
        `<linearGradient id="${id}-${i}" x1="0" y1="${vertical ? 0 : 0}" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">` +
        `<stop offset="0" stop-color="${c}" stop-opacity="1"/><stop offset="1" stop-color="${c}" stop-opacity="${vertical ? 0.55 : 0.75}"/></linearGradient>`,
    )
    .join("");
}

function topRoundedBar(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return pts.length ? `M${pts[0]![0]},${pts[0]![1]}` : "";
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function renderChart(c: ChartSpec, uid: string, baseDelay: number): string {
  if (c.kind === "hbar") return hbar(c, baseDelay);
  if (c.kind === "donut") return donut(c, uid, baseDelay);
  return xy(c, uid, baseDelay);
}

function xy(c: ChartSpec, uid: string, d0: number): string {
  const W = 1640, H = 600, L = 96, R = 24, T = 56, B = 74;
  const all = c.series.flatMap((s) => s.values);
  const minV = Math.min(0, ...all);
  const maxRaw = c.max ?? Math.max(...all, 0);
  const step = niceStep(maxRaw - minV || 1);
  const top = Math.ceil(maxRaw / step) * step || step;
  const bottom = minV < 0 ? Math.floor(minV / step) * step : 0;
  const y = (v: number) => T + (H - T - B) * (1 - (v - bottom) / (top - bottom));
  const n = c.labels.length;
  const band = (W - L - R) / n;
  const colors = c.series.map((s, i) => s.color ?? PALETTE[i % PALETTE.length]!);
  let grid = "";
  for (let v = bottom; v <= top + 1e-9; v += step) {
    grid += `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${L - 18}" y="${y(v) + 9}" text-anchor="end">${esc(fmt(c.lang, v))}</text>`;
  }
  const labels = c.labels
    .map((lab, i) => {
      const cls = c.highlight === i ? "xl hl" : "xl";
      return `<text class="${cls}" x="${L + band * (i + 0.5)}" y="${H - B + 46}" text-anchor="middle">${esc(lab)}</text>`;
    })
    .join("");
  let marks = "";
  if (c.kind === "bar") {
    const groupW = band * 0.64;
    const bw = groupW / c.series.length;
    c.series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const x = L + band * i + (band - groupW) / 2 + si * bw + bw * 0.08;
        const w = bw * 0.84;
        const y0 = y(Math.max(0, v));
        const h = Math.abs(y(v) - y(0));
        const dim = c.highlight !== undefined && c.highlight !== i ? " dim" : "";
        const delay = d0 + i * 70 + si * 40;
        marks += `<path class="bar${dim}" d="${topRoundedBar(x, y0, w, Math.max(h, 2), 14)}" fill="url(#${uid}-${si})" data-a="bar" data-d="${delay}"/>`;
        marks += `<text class="val${dim}" x="${x + w / 2}" y="${y0 - 16}" text-anchor="middle" data-a="fade" data-d="${delay + 380}">${countSpan(c.lang, v, c.unit)}</text>`;
      });
    });
  } else {
    c.series.forEach((s, si) => {
      const pts = s.values.map((v, i) => [L + band * (i + 0.5), y(v)] as [number, number]);
      const path = smoothPath(pts);
      const delay = d0 + si * 160;
      if (c.kind === "area") {
        const area = `${path}L${pts[pts.length - 1]![0]},${y(bottom)}L${pts[0]![0]},${y(bottom)}Z`;
        marks += `<path class="area" d="${area}" fill="url(#${uid}-a${si})" data-a="fade" data-d="${delay + 500}"/>`;
      }
      marks += `<path class="line" d="${path}" stroke="${colors[si]}" pathLength="1" data-a="draw" data-d="${delay}"/>`;
      pts.forEach(([px, py], i) => {
        const hl = c.highlight === i ? " hl" : "";
        marks += `<circle class="pt${hl}" cx="${px}" cy="${py}" r="${hl ? 12 : 8}" fill="${colors[si]}" data-a="pop" data-d="${delay + 300 + i * 60}"/>`;
        if (c.series.length === 1 || hl)
          marks += `<text class="val${hl}" x="${px}" y="${py - 26}" text-anchor="middle" data-a="fade" data-d="${delay + 360 + i * 60}">${countSpan(c.lang, s.values[i]!, c.unit)}</text>`;
      });
    });
  }
  const areaDefs = c.series
    .map(
      (_, i) =>
        `<linearGradient id="${uid}-a${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors[i]}" stop-opacity=".35"/><stop offset="1" stop-color="${colors[i]}" stop-opacity="0"/></linearGradient>`,
    )
    .join("");
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img"><defs>${gradDefs(uid, colors)}${areaDefs}</defs><g class="grid">${grid}</g><line class="axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>${marks}${labels}</svg>`;
}

function hbar(c: ChartSpec, d0: number): string {
  const s = c.series[0]!;
  const max = c.max ?? Math.max(...s.values, 0) * 1.08;
  const rows = c.labels
    .map((lab, i) => {
      const v = s.values[i] ?? 0;
      const pct = max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0;
      const hl = c.highlight === i ? " hl" : c.highlight !== undefined ? " dim" : "";
      const delay = d0 + i * 90;
      return (
        `<div class="hb-row${hl}" data-a="rise" data-d="${delay}">` +
        `<div class="hb-label">${esc(lab)}</div>` +
        `<div class="hb-track"><div class="hb-fill" style="width:${pct.toFixed(2)}%" data-a="hbar" data-d="${delay + 120}"></div></div>` +
        `<div class="hb-val"><span data-count="${v}" data-dec="${decimalsOf(v)}">${esc(fmt(c.lang, v))}</span>${c.unit ? esc(c.unit) : ""}</div>` +
        `</div>`
      );
    })
    .join("");
  return `<div class="hbars n-${c.labels.length}">${rows}</div>`;
}

function donut(c: ChartSpec, uid: string, d0: number): string {
  const s = c.series[0]!;
  const total = s.values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  let acc = 0;
  const R = 150;
  const segs = s.values
    .map((v, i) => {
      const pct = (Math.max(0, v) / total) * 100;
      const gap = s.values.length > 1 ? 0.6 : 0;
      const seg = `<circle class="seg${c.highlight === i ? " hl" : ""}" cx="200" cy="200" r="${R}" pathLength="100" stroke="${PALETTE[i % PALETTE.length]}" stroke-dasharray="${Math.max(0, pct - gap).toFixed(2)} ${(100 - pct + gap).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" data-a="ring" data-d="${d0 + i * 140}"/>`;
      acc += pct;
      return seg;
    })
    .join("");
  const hi = c.highlight ?? s.values.indexOf(Math.max(...s.values));
  const hiPct = (Math.max(0, s.values[hi] ?? 0) / total) * 100;
  const legend = c.labels
    .map((lab, i) => {
      const pct = (Math.max(0, s.values[i] ?? 0) / total) * 100;
      return `<li data-a="rise" data-d="${d0 + 200 + i * 90}"${i === hi ? ' class="hl"' : ""}><i style="background:${PALETTE[i % PALETTE.length]}"></i><span class="lg-l">${esc(lab)}</span><span class="lg-v">${esc(fmt(c.lang, Math.round(pct * 10) / 10))}%</span></li>`;
    })
    .join("");
  return (
    `<div class="donut"><div class="dn-ring"><svg viewBox="0 0 400 400" role="img"><circle class="dn-track" cx="200" cy="200" r="${R}"/>` +
    `<g transform="rotate(-90 200 200)">${segs}</g></svg>` +
    `<div class="dn-center" data-a="scale" data-d="${d0 + 300}"><div class="dn-big"><span data-count="${Math.round(hiPct * 10) / 10}" data-dec="${hiPct % 1 ? 1 : 0}">${esc(fmt(c.lang, Math.round(hiPct * 10) / 10))}</span>%</div><div class="dn-lab">${esc(c.labels[hi] ?? "")}</div></div></div>` +
    `<ul class="dn-legend">${legend}</ul></div>`
  ).replace(`id="${uid}"`, "");
}