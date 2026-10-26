import { apca, Color, hueDist, meanHue, round, swatch, wcag, type Swatch } from "./color.js";
import type { Found } from "./extract.js";

// 7 nguyên tắc (kb: nguyen-tac-tao-bang-mau-dep-va-skill-palette-theo-axi) thành phép chấm.
// Dùng chung cho `analyze` (chấm màu gom được) và `generate` (tự chấm kết quả của mình).

export type Kind = "neutral" | "muted" | "accent" | "tint";
export type Mode = "dark" | "light";

export interface Item extends Swatch {
  raw: string;
  kind: Kind;
  /** APCA Lc có dấu so với nền. */
  lc: number;
  wcag: number;
  names: string[];
  where: string;
  count: number;
}

export interface Issue {
  hex: string;
  rule: string;
  detail: string;
}

export interface RuleResult {
  rule: string;
  status: "pass" | "fail" | "n/a";
}

export interface Analysis {
  bg: Swatch;
  bgSource: "flag" | "inferred" | "assumed";
  mode: Mode;
  items: Item[];
  issues: Issue[];
  rules: RuleResult[];
  summary: Record<string, string>;
}

/** Ngưỡng — đổi ở đây là đổi cả analyze lẫn generate. */
export const T = {
  neutralMaxC: 0.08, // dưới mức này là trung tính
  tintMaxC: 0.065, // trung tính nhuốm: C 0.01–0.06 (+ làm tròn)
  tintHueTol: 25, // lệch hue so với hue chung của trung tính
  mutedMaxC: 0.04, // xám giữa (L 0.4–0.85) có C thấp: icon mờ, trạng thái tắt
  darkBg: [0.13, 0.2] as const,
  lightBgMin: 0.93,
  darkBand: [0.7, 0.8] as const,
  lightBand: [0.45, 0.7] as const,
  textLc: 60, // chữ nội dung
  accentLc: 45, // icon nét, chữ lớn
  visibleLc: 15, // dưới mức này coi như vô hình
} as const;

export const RULES = ["2-tint", "3-bg", "4-band", "5-scale", "6-meaning", "7-contrast", "7-gamut"] as const;

const f2 = (n: number): string => n.toFixed(2);
const lcs = (n: number): string => String(Math.round(n));

/** Nền: lấy màu trung tính tối/sáng gặp nhiều nhất; không có ⇒ giả định trắng. */
export function inferBg(found: Found[]): { bg: Swatch; source: "inferred" | "assumed" } {
  const cands = found.filter((f) => f.swatch.c < T.neutralMaxC && (f.swatch.l < 0.3 || f.swatch.l > 0.9));
  if (!cands.length) return { bg: swatch(new Color("#ffffff")), source: "assumed" };
  const darkN = cands.filter((f) => f.swatch.l < 0.3).reduce((n, f) => n + f.count, 0);
  const lightN = cands.filter((f) => f.swatch.l > 0.9).reduce((n, f) => n + f.count, 0);
  const side = cands.filter((f) => (darkN >= lightN ? f.swatch.l < 0.3 : f.swatch.l > 0.9));
  side.sort((a, b) => b.count - a.count || Math.abs(a.swatch.l - 0.18) - Math.abs(b.swatch.l - 0.18));
  return { bg: side[0]!.swatch, source: "inferred" };
}

export function classify(s: Swatch, lc: number): Kind {
  if (s.c < T.neutralMaxC) return s.l > 0.4 && s.l < 0.85 && s.c < T.mutedMaxC ? "muted" : "neutral";
  return Math.abs(lc) >= T.visibleLc ? "accent" : "tint";
}

const SEMANTIC: Array<{ re: RegExp; label: string; ok: (h: number) => boolean }> = [
  { re: /(?:^|-)(success|good|positive|online)(?:-|$)/, label: "success = green (hue 120–185)", ok: (h) => h >= 120 && h <= 185 },
  { re: /(?:^|-)(warn|warning|caution|pending)(?:-|$)/, label: "warning = yellow/orange (hue 35–110)", ok: (h) => h >= 35 && h <= 110 },
  { re: /(?:^|-)(error|danger|bad|poor|fail|failed|critical|destructive|offline)(?:-|$)/, label: "error = red (hue 345–40)", ok: (h) => h >= 345 || h <= 40 },
  { re: /(?:^|-)(info|notice)(?:-|$)/, label: "info = blue (hue 190–275)", ok: (h) => h >= 190 && h <= 275 },
];

/** "NO_LINK_COLOR" / "colorBad" / "--ltc-fg" ⇒ "no-link-color" / "color-bad" / "ltc-fg". */
const words = (name: string): string =>
  name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Hue chung: tâm cụm có tổng chroma lớn nhất (±25°) — vài màu lệch hue không kéo lệch tâm. */
function dominantHue(items: Array<{ h: number; c: number }>): number | undefined {
  let best: Array<{ h: number; c: number }> = [];
  let bestScore = 0;
  for (const it of items) {
    const near = items.filter((x) => hueDist(x.h, it.h) <= T.tintHueTol);
    const score = near.reduce((n, x) => n + x.c, 0);
    if (score > bestScore) {
      bestScore = score;
      best = near;
    }
  }
  return meanHue(best);
}

/** Hue min–max quanh hue trung bình (đúng cả khi vắt qua 0°). */
function hueRange(items: Array<{ h: number; c: number }>): string {
  const center = meanHue(items);
  if (center === undefined || !items.length) return "";
  const offs = items.map((i) => ((i.h - center + 540) % 360) - 180);
  const norm = (x: number): number => Math.round(((center + x) % 360 + 360) % 360);
  return `${norm(Math.min(...offs))}–${norm(Math.max(...offs))}`;
}

export function analyzePalette(found: Found[], bgOpt?: Color): Analysis {
  const inferred = bgOpt ? undefined : inferBg(found);
  const bg = bgOpt ? swatch(bgOpt) : inferred!.bg;
  const bgColor = new Color(bg.hex);
  const mode: Mode = bg.l < 0.5 ? "dark" : "light";
  const items: Item[] = found
    .filter((f) => f.swatch.hex !== bg.hex || !f.swatch.inGamut)
    .map((f) => {
      const fc = new Color(f.swatch.hex);
      const lc = apca(fc, bgColor);
      return { ...f.swatch, raw: f.raw, kind: classify(f.swatch, lc), lc, wcag: wcag(fc, bgColor), names: f.names, where: f.where, count: f.count };
    });
  // Nền được gom từ file vẫn là một trung tính của bảng màu (đếm, chấm nguyên tắc 2).
  const bgFound = found.find((f) => f.swatch.hex === bg.hex && f.swatch.inGamut);
  const all: Item[] = bgFound
    ? [{ ...bg, raw: bgFound.raw, kind: "neutral", lc: 0, wcag: 1, names: bgFound.names, where: bgFound.where, count: bgFound.count }, ...items]
    : items;
  const order: Record<Kind, number> = { neutral: 0, muted: 1, accent: 2, tint: 3 };
  all.sort((a, b) => order[a.kind] - order[b.kind] || a.l - b.l);

  const issues: Issue[] = [];
  const status: Record<string, RuleResult["status"]> = {};
  const mark = (rule: string, applicable: boolean, before: number): void => {
    status[rule] = !applicable ? "n/a" : issues.length > before ? "fail" : "pass";
  };
  const summary: Record<string, string> = {};

  // 2 — trung tính nhuốm cùng một hue.
  let before = issues.length;
  const neutrals = all.filter((i) => i.kind === "neutral");
  const greys = all.filter((i) => i.kind === "neutral" || i.kind === "muted");
  const tinted = greys.filter((i) => i.c >= 0.01);
  const domHue = dominantHue(tinted);
  for (const n of greys) {
    if (n.c > T.tintMaxC) issues.push({ hex: n.hex, rule: "2-tint", detail: `C ${n.c.toFixed(3)} > 0.06 for a neutral` });
    else if (domHue !== undefined && n.c >= 0.01 && hueDist(n.h, domHue) > T.tintHueTol) {
      issues.push({ hex: n.hex, rule: "2-tint", detail: `hue ${Math.round(n.h)} vs neutral hue ${Math.round(domHue)}` });
    } else if (domHue !== undefined && n.c < 0.005) {
      issues.push({ hex: n.hex, rule: "2-tint", detail: `untinted grey: tint to hue ${Math.round(domHue)} at C 0.01–0.06` });
    }
  }
  if (greys.length && domHue === undefined) {
    issues.push({ hex: greys[0]!.hex, rule: "2-tint", detail: `all ${greys.length} neutrals are pure grey: tint them with the primary hue at C 0.01–0.06` });
  }
  mark("2-tint", greys.length > 0, before);
  if (neutrals.length) {
    const nt = neutrals.filter((i) => i.c >= 0.01 && (domHue === undefined || hueDist(i.h, domHue) <= T.tintHueTol));
    const cMax = Math.max(...neutrals.map((i) => i.c));
    summary["neutrals"] = `${neutrals.length}, hue ${hueRange(nt) || "none"}, C ≤${cMax.toFixed(3)}, ${status["2-tint"] === "pass" ? "tinted ✓" : "tinting issues ✗"}`;
  } else summary["neutrals"] = "0 neutrals found";

  // 3 — nền tối không đen tuyền / nền sáng gần trắng.
  before = issues.length;
  if (mode === "dark") {
    const [lo, hi] = T.darkBg;
    if (bg.l < lo) issues.push({ hex: bg.hex, rule: "3-bg", detail: `bg L ${f2(bg.l)} < ${lo}: too close to black; use L ${lo}–${hi}` });
    else if (bg.l > hi) issues.push({ hex: bg.hex, rule: "3-bg", detail: `bg L ${f2(bg.l)} > ${hi}: too light for a dark theme` });
  } else if (bg.l < T.lightBgMin) {
    issues.push({ hex: bg.hex, rule: "3-bg", detail: `bg L ${f2(bg.l)} < ${T.lightBgMin}: too dark for a light theme` });
  }
  mark("3-bg", true, before);

  // 4 — màu nhấn cùng một dải sáng.
  before = issues.length;
  const accents = all.filter((i) => i.kind === "accent");
  const [bLo, bHi] = mode === "dark" ? T.darkBand : T.lightBand;
  let inBand = 0;
  let extra = 0;
  for (const a of accents) {
    if (a.l >= bLo - 0.0005 && a.l <= bHi + 0.0005) inBand++;
    else if (mode === "dark" ? a.l < bLo : a.l > bHi) {
      issues.push({ hex: a.hex, rule: "4-band", detail: `L ${f2(a.l)} ${mode === "dark" ? `< ${f2(bLo)}` : `> ${f2(bHi)}`}; Lc ${lcs(a.lc)}` });
    } else extra++;
  }
  mark("4-band", accents.length > 0, before);
  if (accents.length) {
    const hues = accents.map((a) => Math.round(a.h));
    summary["accents"] =
      `${inBand}/${accents.length} in L ${bLo.toFixed(2)}–${bHi.toFixed(2)}` +
      (extra ? `, ${extra} ${mode === "dark" ? "brighter" : "deeper"} (highlights)` : "") +
      `, hue ${Math.min(...hues)}–${Math.max(...hues)}`;
  } else summary["accents"] = "0 accents found";

  // 5 — thang màu: chroma đỉnh ở giữa, giảm về hai đầu.
  before = issues.length;
  const ramps = findRamps(all);
  for (const r of ramps) {
    const peak = Math.max(...r.map((i) => i.c));
    const ends = [r[0]!, r[r.length - 1]!];
    for (const e of ends) {
      if (e.c >= peak - 1e-6) issues.push({ hex: e.hex, rule: "5-scale", detail: `ramp hue ${Math.round(e.h)}: chroma peaks at the ${e === r[0] ? "dark" : "light"} end; taper both ends` });
    }
  }
  mark("5-scale", ramps.length > 0, before);

  // 6 — mỗi sắc một nghĩa (chỉ chấm được khi token có tên mang nghĩa).
  before = issues.length;
  let semanticSeen = 0;
  for (const i of all) {
    for (const n of i.names) {
      const s = SEMANTIC.find((x) => x.re.test(words(n)));
      if (!s) continue;
      semanticSeen++;
      if (!s.ok(i.h) || i.achromatic) issues.push({ hex: i.hex, rule: "6-meaning", detail: `token ${n} is hue ${Math.round(i.h)}; expected ${s.label}` });
    }
  }
  mark("6-meaning", semanticSeen > 0, before);

  // 7 — tương phản (APCA, báo kèm WCAG 2) và gamut.
  before = issues.length;
  const flagged = new Set(issues.filter((x) => x.rule === "4-band").map((x) => x.hex));
  for (const i of all) {
    const abs = Math.abs(i.lc);
    if (i.kind === "neutral" && abs >= 30 && abs < T.textLc) {
      issues.push({ hex: i.hex, rule: "7-contrast", detail: `Lc ${lcs(i.lc)} < ${T.textLc} for content text; ${f2(i.wcag)}:1` });
    } else if (i.kind === "accent" && abs < T.accentLc && !flagged.has(i.hex)) {
      issues.push({ hex: i.hex, rule: "7-contrast", detail: `Lc ${lcs(i.lc)} < ${T.accentLc} for icons and large text; ${f2(i.wcag)}:1` });
    }
  }
  const textual = all.filter((i) => i.kind === "accent" || (i.kind === "neutral" && Math.abs(i.lc) >= 30));
  mark("7-contrast", textual.length > 0, before);
  if (accents.length) {
    const w = accents.filter((a) => a.wcag >= 4.5).length;
    const p = accents.filter((a) => Math.abs(a.lc) >= T.accentLc).length;
    summary["contrast"] = `accents wcag ≥4.5 ${w}/${accents.length}, apca |Lc| ≥45 ${p}/${accents.length}`;
  }
  before = issues.length;
  for (const i of all) {
    if (!i.inGamut) issues.push({ hex: i.hex, rule: "7-gamut", detail: `${i.raw} is outside sRGB; clamped to ${i.hex}` });
  }
  mark("7-gamut", all.length > 0, before);

  const rules = RULES.map((rule) => ({ rule, status: status[rule] ?? "n/a" }));
  return { bg, bgSource: bgOpt ? "flag" : inferred!.source, mode, items: all, issues, rules, summary };
}

/** Cụm ≥5 màu cùng hue (±10°, C ≥ 0.03) trải L ≥ 0.4, xếp theo L tăng dần. */
function findRamps(items: Item[]): Item[][] {
  const pool = items.filter((i) => i.c >= 0.03).sort((a, b) => a.h - b.h);
  if (pool.length < 5) return [];
  const clusters: Item[][] = [];
  let cur: Item[] = [pool[0]!];
  for (let k = 1; k < pool.length; k++) {
    if (pool[k]!.h - pool[k - 1]!.h <= 10) cur.push(pool[k]!);
    else {
      clusters.push(cur);
      cur = [pool[k]!];
    }
  }
  clusters.push(cur);
  // Nối cụm đầu và cuối nếu vắt qua 0°.
  if (clusters.length > 1 && pool[0]!.h + 360 - pool[pool.length - 1]!.h <= 10) clusters[0] = [...clusters.pop()!, ...clusters[0]!];
  return clusters
    .filter((c) => c.length >= 5)
    .map((c) => c.sort((a, b) => a.l - b.l))
    .filter((c) => c[c.length - 1]!.l - c[0]!.l >= 0.4);
}

export function rulesLine(rules: RuleResult[]): string {
  const applicable = rules.filter((r) => r.status !== "n/a");
  const passed = applicable.filter((r) => r.status === "pass").length;
  const failed = applicable.filter((r) => r.status === "fail").map((r) => r.rule);
  const na = rules.filter((r) => r.status === "n/a").map((r) => r.rule);
  return `${passed}/${applicable.length} rules passed` + (failed.length ? `, failed: ${failed.join(" ")}` : "") + (na.length ? `, n/a: ${na.join(" ")}` : "");
}

export { round };
