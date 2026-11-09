import Color from "colorjs.io";
import { fail } from "./errors.js";

// Lõi màu: mọi phép tính trong OKLCH (nguyên tắc 1), hex chỉ ở bước xuất.
// Tương phản và ánh xạ gamut dùng sẵn của Color.js (APCA 0.0.98G, WCAG 2.1, CSS Color 4).

export interface Swatch {
  /** Hex 6 chữ số sau khi kẹp vào sRGB. */
  hex: string;
  l: number;
  c: number;
  /** Hue độ; màu xám (C < 0.005) để 0 và `achromatic` = true. */
  h: number;
  achromatic: boolean;
  /** Hue đo được kể cả khi C rất nhỏ (xám nhuốm nhẹ như #f4f6f8, C 0.003 H 248); NaN nếu không có. */
  rawHue: number;
  alpha: number;
  /** Màu gốc có nằm trong sRGB không (hex luôn có; oklch()/lab() có thể không). */
  inGamut: boolean;
}

const BARE_HEX = /^[0-9a-f]{3}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i;

/** Đọc một màu CSS bất kỳ; nhận cả hex không dấu # (shell coi `#…` là chú thích). */
export function tryParse(input: string): Color | undefined {
  const s = input.trim();
  try {
    const c = new Color(BARE_HEX.test(s) ? `#${s}` : s);
    // CSS Color 4 `none` (Color.js: null) = 0. Chuỗi (`rgb(a,b,c)` trong mã JS) không phải màu.
    if (!c.coords || c.coords.some((x) => x !== null && (typeof x !== "number" || Number.isNaN(x)))) {
      return undefined;
    }
    if (c.coords.some((x) => x === null)) c.coords = c.coords.map((x) => x ?? 0) as typeof c.coords;
    return c;
  } catch {
    return undefined;
  }
}

export function parseOrFail(input: string, what: string): Color {
  const c = tryParse(input);
  if (!c) {
    fail(`${what}: cannot read "${input}" as a color`, "VALIDATION_ERROR", [
      "Use #rrggbb (quote it: the shell treats # as a comment), rrggbb, rgb(), hsl() or oklch(L C H)",
    ]);
  }
  return c;
}

export function swatch(color: Color): Swatch {
  const ok = color.to("oklch");
  const [l = 0, c = 0, hRaw] = ok.coords as [number, number, number];
  const achromatic = !(c >= 0.005) || Number.isNaN(hRaw);
  return {
    hex: toHex(color),
    l,
    c: Number.isNaN(c) ? 0 : c,
    h: achromatic ? 0 : ((hRaw % 360) + 360) % 360,
    achromatic,
    rawHue: Number.isNaN(hRaw) || !(c >= 0.0015) ? NaN : ((hRaw % 360) + 360) % 360,
    alpha: color.alpha === undefined || Number.isNaN(Number(color.alpha)) ? 1 : Number(color.alpha),
    inGamut: color.inGamut("srgb", { epsilon: 0.0001 }),
  };
}

export function oklch(l: number, c: number, h: number): Color {
  return new Color("oklch", [l, c, h]);
}

/** Hex sau khi ánh xạ gamut theo CSS Color 4 (giữ L và H, giảm C). */
export function toHex(color: Color): string {
  return color.to("srgb").toGamut({ method: "css" }).toString({ format: "hex", collapse: false });
}

/** "0.623 0.188 260" — gọn cho TOON. */
export function fmtOklch(s: Pick<Swatch, "l" | "c" | "h">): string {
  return `${s.l.toFixed(3)} ${s.c.toFixed(3)} ${Math.round(s.h)}`;
}

/**
 * "oklch(0.623 0.188 259.8)" — cho CSS, luôn nằm trong sRGB SAU khi làm tròn. Màu đã kẹp gamut nằm sát
 * mép; làm tròn chroma lên (0.1936 → 0.194) đẩy nó ra ngoài ⇒ `analyze` chính CSS này báo 7-gamut.
 * Vì vậy chroma làm tròn xuống, rồi giảm từng 0.001 tới khi vào gamut.
 */
export function cssOklch(s: Pick<Swatch, "l" | "c" | "h">): string {
  const l = Number(s.l.toFixed(3));
  const h = Number(s.h.toFixed(1));
  let c = Math.floor(s.c * 1000 + 1e-9) / 1000;
  while (c > 0 && !oklch(l, c, h).inGamut("srgb")) c = Math.round((c - 0.001) * 1000) / 1000;
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

export function wcag(fg: Color, bg: Color): number {
  return fg.contrast(bg, "WCAG21");
}

/** APCA Lc có dấu: âm = chữ sáng trên nền tối. Thứ tự Color.js: nền.contrast(chữ). */
export function apca(fg: Color, bg: Color): number {
  return bg.contrast(fg, "APCA");
}

export const round = (n: number, d = 0): number => {
  const k = 10 ** d;
  return Math.round(n * k) / k;
};

/** Chroma lớn nhất còn trong sRGB tại (L, H) — tìm nhị phân. */
export function maxChroma(l: number, h: number, cap = 0.4): number {
  let lo = 0;
  let hi = cap;
  if (oklch(l, hi, h).inGamut("srgb")) return hi;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (oklch(l, mid, h).inGamut("srgb")) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface Solved {
  color: Color;
  lc: number;
  /** false khi trong khoảng L cho phép không đạt được Lc mục tiêu (đã lấy mép gần nhất). */
  reached: boolean;
}

/**
 * Tìm màu có |Lc| = `target` (và tỉ lệ WCAG ≥ `wcag` nếu có) trên nền `bg`, giữ hue, L trong [lo, hi].
 * Chroma tại mỗi L = min(cMax, chroma lớn nhất trong gamut) ⇒ kết quả luôn là màu thật.
 * Tìm nhị phân trên L (|Lc| đơn điệu theo L ở phía xa nền).
 */
export function solveLc(
  bg: Color,
  h: number,
  target: number,
  opts: { lo?: number; hi?: number; cMax?: number; wcag?: number } = {},
): Solved {
  const bgL = swatch(bg).l;
  const dark = bgL < 0.5;
  const lo = opts.lo ?? (dark ? bgL : 0);
  const hi = opts.hi ?? (dark ? 1 : bgL);
  const cMax = opts.cMax ?? 0.2;
  const minWcag = opts.wcag ?? 0;
  const at = (l: number): Color => oklch(l, Math.min(cMax, maxChroma(l, h)), h);
  const lcAt = (l: number): number => Math.abs(apca(at(l), bg));
  // Đạt cả hai ngưỡng: APCA Lc và tỉ lệ WCAG 2 (so trên hex đã kẹp gamut, như khi in ra). Cả hai
  // tăng đơn điệu khi L đi xa nền ⇒ vẫn tìm nhị phân được. Trên nền sáng Lc 60 chỉ ≈ 3.5:1, nên
  // thiếu sàn WCAG thì màu "đạt" vẫn trượt AA.
  const meets = (l: number): boolean => lcAt(l) >= target && (minWcag <= 0 || wcag(new Color(toHex(at(l))), bg) >= minWcag);
  // Phía xa nền (dark: L cao) cho |Lc| lớn.
  const far = dark ? hi : lo;
  const near = dark ? lo : hi;
  if (!meets(far)) return { color: at(far), lc: apca(at(far), bg), reached: false };
  if (meets(near)) return { color: at(near), lc: apca(at(near), bg), reached: lcAt(near) - target < 1 };
  let a = near;
  let b = far;
  for (let i = 0; i < 30; i++) {
    const mid = (a + b) / 2;
    if (meets(mid)) b = mid;
    else a = mid;
  }
  const color = at(b);
  return { color, lc: apca(color, bg), reached: true };
}

/** Khoảng cách hue trên vòng tròn (0–180). */
export function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Hue trung bình vòng tròn, trọng số theo chroma. */
export function meanHue(items: Array<{ h: number; c: number }>): number | undefined {
  let x = 0;
  let y = 0;
  for (const it of items) {
    x += Math.cos((it.h * Math.PI) / 180) * it.c;
    y += Math.sin((it.h * Math.PI) / 180) * it.c;
  }
  if (Math.hypot(x, y) < 1e-9) return undefined;
  return (((Math.atan2(y, x) * 180) / Math.PI) % 360 + 360) % 360;
}

export { Color };
