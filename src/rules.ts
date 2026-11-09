import { apca, Color, hueDist, meanHue, round, swatch, tryParse, wcag, type Swatch } from "./color.js";
import { fail } from "./errors.js";
import type { Found, TokenDef } from "./extract.js";

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
  status: "pass" | "fail" | "n/a" | "ignored";
}

export interface AnalyzeOptions {
  /** Quy tắc bỏ qua (`--ignore`): không chấm, không ra issue, `--strict` không tính. */
  ignore?: readonly string[];
  /** Cặp chữ:nền khai tay (`--pair`), mỗi vế là tên token hoặc một màu. */
  pairs?: ReadonlyArray<{ fg: string; bg: string }>;
}

export interface Analysis {
  bg: Swatch;
  bgSource: "flag" | "inferred" | "assumed";
  mode: Mode;
  items: Item[];
  issues: Issue[];
  rules: RuleResult[];
  summary: Record<string, string>;
  /** Cặp chữ–nền ghép theo tên token (quy tắc 8). */
  pairs: Pair[];
  /** Hue chung của trung tính (undefined nếu toàn xám thuần): gợi ý `generate --seed` khi nền không có sắc. */
  neutralHue?: number;
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

export const RULES = ["2-tint", "3-bg", "4-band", "5-scale", "6-meaning", "7-contrast", "7-gamut", "8-pairs"] as const;

/** Ngưỡng 8-pairs: chữ đặt trên mặt màu = "content text" của lệnh contrast (APCA và WCAG cùng đạt). */
export const PAIR = { lc: 60, wcag: 4.5 } as const;
/** Thành phần giao diện không phải chữ (vòng focus, viền ô nhập): WCAG 1.4.11, 3:1. */
export const NONTEXT_WCAG = 3;
/** Màu nhấn dùng cho icon, chữ lớn: sàn WCAG 3:1 bên cạnh |Lc| ≥ 45. */
export const ACCENT_WCAG = 3;
const STATES = ["", "-hover", "-pressed", "-active"];
const FILLS = ["-subtle", "-bg", "-soft", "-container", "-background"];
/**
 * Token chữ trần: `ink`, `fg`, `muted`, `text-secondary`… Không ghép cặp theo tên (giữ số đo đối chiếu
 * lan-topo-card / Fluent Blue), mà chấm như chữ trên nền trang ở quy tắc 7, chỉ với token cùng khối với nền.
 */
const BARE_TEXT = /^(?:ink|text|fg|muted|dim|body|copy|(?:text|fg|ink)-(?:primary|secondary|tertiary|muted|subtle|dim|body))$/;
/** Chữ màu trên mặt nhạt của nó: `ok-ink` trên `ok-bg` (quy ước Apollo). */
const FILL_TEXT = /^(.+)-ink$/;
/** Tên nền trạng thái / màu trạng thái: thuộc quy tắc 6, không phải trung tính của bảng. */
const STATUS = /(?:^|-)(?:ok|success|good|positive|online|warn|warning|caution|pending|error|danger|bad|poor|fail|failed|critical|destructive|offline|info|notice)(?:-|$)/;
/** Vòng focus, viền ô nhập: cần 3:1 (WCAG 1.4.11). Viền trang trí, đường kẻ không bắt buộc ⇒ không chấm. */
const NONTEXT = /(?:^|-)(?:focus|ring|focus-ring|outline|input-border|field-border|control-border)(?:-|$)/;
/** Tên nền trang: `bg`, `background`, `paper`, `page-bg`, `bg-primary`… */
const BG_NAME = /^(?:(?:app|page|ui|base|color|ltc)-)?(?:bg|background|paper|canvas)(?:-(?:primary|base|default|page|app|1|100))?$/;

export interface Pair {
  fg: TokenDef;
  bg: TokenDef;
  lc: number;
  wcag: number;
}

/**
 * Tên token (đã qua `words`) ⇒ các tên nền mà nó nằm lên, theo quy ước phổ biến:
 * `on-X` / `X-foreground` trên `X` và trạng thái `X-hover|pressed|active` (Material, shadcn, Fluent Blue);
 * `foreground` trên `background`; `X-text` trên mặt nhạt `X-subtle|bg|soft|container|background`.
 * `X-text` KHÔNG ghép với `X`: trong Fluent Blue/Ant `primary-text` là chữ màu trên surface.
 */
const isLabel = (key: string): boolean => /(?:^|-)on-/.test(key) || /(?:^|-)foreground$/.test(key);

function pairTargets(key: string): string[] {
  let m = /^(.*?)(?:^|-)on-(.+)$/.exec(key);
  if (m) {
    const p = m[1] ? `${m[1]}-` : "";
    return STATES.map((s) => `${p}${m![2]}${s}`);
  }
  m = /^(.*)-foreground$/.exec(key);
  if (m) return STATES.map((s) => `${m![1]}${s}`);
  m = /^(.*?)(?:^|-)foreground$/.exec(key);
  if (m) return [`${m[1] ? `${m[1]}-` : ""}background`];
  m = FILL_TEXT.exec(key);
  if (m) return FILLS.map((f) => `${m![1]}${f}`);
  m = /^(.*)-text$/.exec(key);
  if (m) return FILLS.map((f) => `${m![1]}${f}`);
  return [];
}

/**
 * Token chữ (không phải nhãn on-X / X-foreground, đã có 8-pairs chấm trên mặt của nó). Không tính `X-fg`,
 * `X-dim` (vd `--ltc-dim`): chúng vẫn qua phép chấm trung tính như trước để giữ số đo đối chiếu.
 */
const isTextName = (key: string): boolean => !isLabel(key) && (BARE_TEXT.test(key) || FILL_TEXT.test(key) || /-text$/.test(key));

/**
 * Tên đang là MẶT NỀN của một nhãn (`muted` khi có `muted-foreground`, `secondary` khi có `on-secondary`):
 * trong shadcn/Material `muted` là nền, không phải chữ ⇒ không ghép nó làm chữ, không chấm như chữ.
 */
function fillKeys(tokens: TokenDef[]): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    const key = words(t.name);
    if (isLabel(key)) for (const target of pairTargets(key)) out.add(target);
  }
  return out;
}

/**
 * Ghép cặp chữ–nền theo tên. Nền tìm trước trong cùng khối `{…}`; không có thì lấy định nghĩa
 * duy nhất của tên đó trong cùng file (vd `:root` định nghĩa `--primary`, khối tối chỉ đè `--on-primary`).
 * Tên có nhiều định nghĩa khác khối mà không cùng khối với chữ ⇒ bỏ (không đoán theme).
 */
export function findPairs(tokens: TokenDef[]): Pair[] {
  const byScope = new Map<string, Map<string, TokenDef>>();
  const byFile = new Map<string, Map<string, TokenDef[]>>();
  for (const t of tokens) {
    const key = words(t.name);
    if (!byScope.has(t.scope)) byScope.set(t.scope, new Map());
    byScope.get(t.scope)!.set(key, t);
    const file = t.scope.slice(0, t.scope.lastIndexOf("#"));
    if (!byFile.has(file)) byFile.set(file, new Map());
    const f = byFile.get(file)!;
    if (!f.has(key)) f.set(key, []);
    f.get(key)!.push(t);
  }
  const pairs: Pair[] = [];
  const seen = new Set<string>();
  const fills = fillKeys(tokens);
  for (const fg of tokens) {
    const file = fg.scope.slice(0, fg.scope.lastIndexOf("#"));
    const key = words(fg.name);
    if (!isLabel(key) && fills.has(key)) continue;
    for (const target of pairTargets(key)) {
      let bg = byScope.get(fg.scope)?.get(target);
      if (!bg) {
        const defs = byFile.get(file)?.get(target) ?? [];
        if (new Set(defs.map((d) => d.hex)).size === 1) bg = defs[0];
      }
      if (!bg || bg === fg) continue;
      const id = `${fg.where}|${bg.where}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const fc = new Color(fg.hex);
      const bc = new Color(bg.hex);
      pairs.push({ fg, bg, lc: apca(fc, bc), wcag: wcag(fc, bc) });
    }
  }
  return pairs;
}

// So trên số đã làm tròn như khi in ra: 4.497 in "4.5:1" thì không báo trượt.
export const pairFails = (p: Pair): boolean => Math.round(Math.abs(p.lc)) < PAIR.lc || round(p.wcag, 2) < PAIR.wcag;

const f2 = (n: number): string => n.toFixed(2);
const lcs = (n: number): string => String(Math.round(n));

/**
 * Nền: token tên `bg`/`background`/`paper`… nếu có; không thì trung tính tối/sáng gặp nhiều nhất.
 * Hoà số lần: nền tối lấy màu gần L 0.18, nền sáng lấy màu SÁNG NHẤT (trước đây cũng lấy gần 0.18 ⇒
 * chọn nhầm `--info-bg` thay vì `--paper` trắng). Nền trạng thái (`ok-bg`…) không bao giờ là nền trang.
 */
export function inferBg(found: Found[]): { bg: Swatch; source: "inferred" | "assumed" } {
  // Lần dùng làm `color:` là màu chữ, không phải nền: `a { color: #fff }` ba lần không biến trang thành nền trắng.
  const asBg = (f: Found): Found => ({ ...f, count: f.count - (f.fgUses ?? 0) });
  const all = found
    .map(asBg)
    .filter((f) => f.count > 0 && f.swatch.c < T.neutralMaxC && (f.swatch.l < 0.3 || f.swatch.l > 0.9));
  const plain = all.filter((f) => !f.names.some((n) => STATUS.test(words(n))));
  const pool = plain.length ? plain : all;
  if (!pool.length) return { bg: swatch(new Color("#ffffff")), source: "assumed" };
  const named = pool.filter((f) => f.names.some((n) => BG_NAME.test(words(n))));
  const cands = named.length ? named : pool;
  const darkN = cands.filter((f) => f.swatch.l < 0.3).reduce((n, f) => n + f.count, 0);
  const lightN = cands.filter((f) => f.swatch.l > 0.9).reduce((n, f) => n + f.count, 0);
  const dark = darkN >= lightN;
  const side = cands.filter((f) => (dark ? f.swatch.l < 0.3 : f.swatch.l > 0.9));
  const tie = (s: Swatch): number => (dark ? Math.abs(s.l - 0.18) : 1 - s.l);
  side.sort((a, b) => b.count - a.count || tie(a.swatch) - tie(b.swatch));
  return { bg: side[0]!.swatch, source: "inferred" };
}

export function classify(s: Swatch, lc: number): Kind {
  if (s.c < T.neutralMaxC) return s.l > 0.4 && s.l < 0.85 && s.c < T.mutedMaxC ? "muted" : "neutral";
  return Math.abs(lc) >= T.visibleLc ? "accent" : "tint";
}

const SEMANTIC: Array<{ re: RegExp; label: string; ok: (h: number) => boolean }> = [
  { re: /(?:^|-)(ok|success|good|positive|online)(?:-|$)/, label: "success = green (hue 120–185)", ok: (h) => h >= 120 && h <= 185 },
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

/** Một vế của `--pair`: tên token (có hoặc không `--`) hoặc một màu. */
function pairSide(spec: string, tokens: TokenDef[]): TokenDef[] {
  const key = words(spec.replace(/^--/, ""));
  const defs = tokens.filter((t) => words(t.name) === key);
  if (defs.length) return defs;
  const c = tryParse(spec);
  if (c) return [{ name: spec, hex: swatch(c).hex, scope: "--pair#0", where: "--pair" }];
  fail(`--pair: ${spec} is neither a token in the files nor a color`, "VALIDATION_ERROR", [
    "Use token names as written in the CSS (--ok-ink:--ok-bg or ok-ink:ok-bg) or colors (1e5a3a:e3f5ea)",
  ]);
}

/** Cặp khai tay: chữ ghép với nền cùng khối `{}` nếu có, không thì với mọi định nghĩa của nền. */
export function manualPairs(specs: ReadonlyArray<{ fg: string; bg: string }>, tokens: TokenDef[]): Pair[] {
  const out: Pair[] = [];
  for (const spec of specs) {
    const fgs = pairSide(spec.fg, tokens);
    const bgs = pairSide(spec.bg, tokens);
    for (const fg of fgs) {
      const same = bgs.filter((b) => b.scope === fg.scope);
      const targets = same.length ? same : [...new Map(bgs.map((b) => [b.hex, b])).values()];
      for (const bg of targets) {
        const fc = new Color(fg.hex);
        const bc = new Color(bg.hex);
        out.push({ fg, bg, lc: apca(fc, bc), wcag: wcag(fc, bc) });
      }
    }
  }
  return out;
}

const isWhite = (s: Swatch): boolean => s.l >= 0.995 && s.c < 0.005;
const scaleStep = /-(?:50|[1-9]00|950|[1-9]|1[0-2])$/;

export function analyzePalette(found: Found[], bgOpt?: Color, tokens: TokenDef[] = [], opts: AnalyzeOptions = {}): Analysis {
  const ignore = new Set(opts.ignore ?? []);
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
  // Cặp chữ–nền tính trước: token chữ đã có mặt nền riêng thì quy tắc 8 chấm, không so với nền trang nữa.
  const pairList = [...findPairs(tokens), ...manualPairs(opts.pairs ?? [], tokens)];
  const pairs = [...new Map(pairList.map((p) => [`${p.fg.where}|${p.fg.hex}|${p.bg.where}|${p.bg.hex}`, p])).values()];
  const pairedFg = new Set(pairs.map((p) => words(p.fg.name)));
  const fills = fillKeys(tokens);
  const keysOf = (i: Item): string[] => i.names.map(words);
  // Nền/màu trạng thái (`ok-bg`, `error-bg`): cố ý mang sắc riêng ⇒ thuộc quy tắc 6, không chấm như trung tính.
  const isStatus = (i: Item): boolean => i.names.length > 0 && keysOf(i).every((k) => STATUS.test(k));

  // 2 — trung tính nhuốm cùng một hue.
  let before = issues.length;
  const neutrals = all.filter((i) => i.kind === "neutral");
  const greys = all.filter((i) => (i.kind === "neutral" || i.kind === "muted") && !isStatus(i));
  const tinted = greys.filter((i) => i.c >= 0.01);
  const domHue = dominantHue(tinted);
  for (const n of greys) {
    if (n.c > T.tintMaxC) issues.push({ hex: n.hex, rule: "2-tint", detail: `C ${n.c.toFixed(3)} > 0.06 for a neutral` });
    else if (domHue !== undefined && n.c >= 0.01 && hueDist(n.h, domHue) > T.tintHueTol) {
      issues.push({ hex: n.hex, rule: "2-tint", detail: `hue ${Math.round(n.h)} vs neutral hue ${Math.round(domHue)}` });
    } else if (domHue !== undefined && n.c < 0.005 && !isWhite(n)) {
      // Xám rất sáng giữ được ít chroma trong hex (#f4f6f8: C 0.003 H 248) — vẫn là nhuốm nếu đúng sắc.
      const faint = Number.isFinite(n.rawHue) && hueDist(n.rawHue, domHue) <= T.tintHueTol;
      if (!faint) issues.push({ hex: n.hex, rule: "2-tint", detail: `untinted grey: tint to hue ${Math.round(domHue)} at C 0.01–0.06` });
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
      // `on-success`, `destructive-foreground` là màu chữ đặt TRÊN mặt trạng thái (thường trắng/đen):
      // không mang sắc của trạng thái — quy tắc 8-pairs chấm chúng.
      if (isLabel(words(n))) continue;
      const s = SEMANTIC.find((x) => x.re.test(words(n)));
      if (!s) continue;
      semanticSeen++;
      if (!s.ok(i.h) || i.achromatic) issues.push({ hex: i.hex, rule: "6-meaning", detail: `token ${n} is hue ${Math.round(i.h)}; expected ${s.label}` });
    }
  }
  mark("6-meaning", semanticSeen > 0, before);

  // 7 — tương phản (APCA, báo kèm WCAG 2) và gamut.
  before = issues.length;
  const flagged = new Set(ignore.has("4-band") ? [] : issues.filter((x) => x.rule === "4-band").map((x) => x.hex));
  // Vai trò theo tên trước, nhóm màu sau: chữ xám nhạt (C < 0.04, L 0.4–0.85) rơi vào nhóm "muted" vốn
  // không được chấm ⇒ trước đây `--ink: #8b95a1` (2.64:1) lọt hẳn.
  const textNames = (i: Item): string[] => i.names.filter((n) => isTextName(words(n)) && !fills.has(words(n)));
  const isNonText = (i: Item): boolean => keysOf(i).some((k) => NONTEXT.test(k));
  // Khối `{}` chứa nền trang: chữ của khối khác (theme tối trong cùng file) không đem so với nền sáng này.
  const bgScopes = new Set(tokens.filter((t) => t.hex === bg.hex).map((t) => t.scope));
  const onPage = (i: Item, names: string[]): boolean => {
    if (!bgScopes.size) return true;
    const defs = tokens.filter((t) => t.hex === i.hex && names.includes(t.name));
    return !defs.length || defs.some((d) => bgScopes.has(d.scope));
  };
  let textual = 0;
  for (const i of all) {
    if (i.hex === bg.hex && i.lc === 0) continue;
    const abs = Math.abs(i.lc);
    const tn = textNames(i);
    if (tn.length) {
      const free = tn.filter((n) => !pairedFg.has(words(n)));
      if (!free.length || !onPage(i, free)) continue; // đã có mặt nền riêng (quy tắc 8) hoặc thuộc theme khác
      textual++;
      if (Math.round(abs) < PAIR.lc || round(i.wcag, 2) < PAIR.wcag) {
        issues.push({ hex: i.hex, rule: "7-contrast", detail: `${free[0]} is text: Lc ${lcs(i.lc)}, ${f2(i.wcag)}:1 on bg < Lc ${PAIR.lc} + ${PAIR.wcag}:1` });
      }
    } else if (isNonText(i)) {
      textual++;
      if (round(i.wcag, 2) < NONTEXT_WCAG) {
        issues.push({ hex: i.hex, rule: "7-contrast", detail: `${i.names.find((n) => NONTEXT.test(words(n)))} is a focus ring or input border: ${f2(i.wcag)}:1 < ${NONTEXT_WCAG}:1 (WCAG 1.4.11)` });
      }
    } else if (i.kind === "neutral" && abs >= 30) {
      textual++;
      if (abs < T.textLc) issues.push({ hex: i.hex, rule: "7-contrast", detail: `Lc ${lcs(i.lc)} < ${T.textLc} for content text; ${f2(i.wcag)}:1` });
    } else if (i.kind === "accent") {
      textual++;
      if ((abs < T.accentLc || round(i.wcag, 2) < ACCENT_WCAG) && !flagged.has(i.hex)) {
        issues.push({ hex: i.hex, rule: "7-contrast", detail: `Lc ${lcs(i.lc)}, ${f2(i.wcag)}:1 < Lc ${T.accentLc} + ${ACCENT_WCAG}:1 for icons and large text` });
      }
    } else if (i.kind === "muted" && onPage(i, i.names)) {
      // Xám giữa (icon mờ, trạng thái tắt) vẫn phải thấy được: dưới 3:1 thì cả icon cũng trượt WCAG 1.4.11.
      textual++;
      if (round(i.wcag, 2) < NONTEXT_WCAG) {
        issues.push({ hex: i.hex, rule: "7-contrast", detail: `muted grey ${f2(i.wcag)}:1 < ${NONTEXT_WCAG}:1, too faint even for icons; Lc ${lcs(i.lc)}` });
      }
    }
  }
  mark("7-contrast", textual > 0, before);
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

  // 8 — chữ trên đúng mặt nền của nó (on-X trên X, X-text trên X-subtle…), không chỉ trên nền trang.
  before = issues.length;
  for (const p of pairs.filter(pairFails)) {
    issues.push({
      hex: p.fg.hex,
      rule: "8-pairs",
      detail: `${p.fg.name} on ${p.bg.name} ${p.bg.hex}: Lc ${lcs(p.lc)}, ${f2(p.wcag)}:1 < Lc ${PAIR.lc} + ${PAIR.wcag}:1 (${p.fg.where})`,
    });
  }
  mark("8-pairs", pairs.length > 0, before);
  if (pairs.length) summary["pairs"] = `${pairs.length} text/fill pairs by token name, ${pairs.filter(pairFails).length} below Lc ${PAIR.lc} + ${PAIR.wcag}:1`;

  const kept = issues.filter((i) => !ignore.has(i.rule));
  const rules = RULES.map((rule) => ({ rule, status: ignore.has(rule) ? ("ignored" as const) : (status[rule] ?? "n/a") }));
  return { bg, bgSource: bgOpt ? "flag" : inferred!.source, mode, items: all, issues: kept, rules, summary, pairs, ...(domHue !== undefined ? { neutralHue: domHue } : {}) };
}

/**
 * Cụm ≥5 màu cùng hue (±10°, C ≥ 0.03) trải L ≥ 0.4, xếp theo L tăng dần. Chỉ màu nhấn và token tên dạng
 * bậc thang (`blue-500`, `gray-9`): trung tính nhuốm cùng sắc với màu nhấn không phải một thang (trước
 * đây `generate --lc 75` tự chấm trượt 5-scale vì gom bg/surface/border với primary).
 */
function findRamps(items: Item[]): Item[][] {
  const pool = items
    .filter((i) => i.c >= 0.03 && (i.kind === "accent" || i.kind === "tint" || i.names.some((n) => scaleStep.test(words(n)))))
    .sort((a, b) => a.h - b.h);
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
  const ignored = rules.filter((r) => r.status === "ignored").map((r) => r.rule);
  const scored = applicable.filter((r) => r.status !== "ignored");
  return (
    `${passed}/${scored.length} rules passed` +
    (failed.length ? `, failed: ${failed.join(" ")}` : "") +
    (na.length ? `, n/a: ${na.join(" ")}` : "") +
    (ignored.length ? `, ignored: ${ignored.join(" ")}` : "")
  );
}

export { round };
