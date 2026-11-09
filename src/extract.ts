import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { tryParse, swatch, type Swatch } from "./color.js";
import { fail } from "./errors.js";

// Gom màu từ CSS / JS / HTML bằng regex — đủ cho token màu, không cần parser.
// Bỏ qua: tên màu chữ (red, white…: quá nhiễu trong JS), color-mix(), var().

export interface Found {
  swatch: Swatch;
  /** Cách viết gốc đầu tiên, vd "#3b82f6", "oklch(0.7 0.2 30)". */
  raw: string;
  /** Tên token/khoá đứng trước màu: "--ltc-fg", "NO_LINK_COLOR", "good"… */
  names: string[];
  /** file:dòng lần gặp đầu. */
  where: string;
  count: number;
  /** Số lần là giá trị của `color:` (màu chữ): không tính khi đoán nền trang. */
  fgUses?: number;
}

/** Một lần gán màu cho một tên token, kèm khối `{…}` chứa nó (để ghép cặp theo tên không lẫn theme sáng/tối). */
export interface TokenDef {
  /** Tên gốc như trong file: "--on-primary", "primaryForeground". */
  name: string;
  hex: string;
  /** "file#offset của `{` gần nhất bao ngoài" — "file#0" khi ở ngoài mọi khối. */
  scope: string;
  where: string;
}

export interface Extracted {
  colors: Found[];
  /** Mọi lần gán màu có tên (không gộp trùng): nguồn của quy tắc 8-pairs. */
  tokens: TokenDef[];
  /** Màu có alpha < 1 (lớp phủ) — đếm riêng, không chấm. */
  translucent: number;
  files: number;
  inputs: string[];
}

const SCAN_EXT = new Set([".css", ".scss", ".sass", ".less", ".styl", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".html", ".htm", ".vue", ".svelte", ".astro"]);
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", ".nuxt", "out", "vendor", ".turbo", ".cache"]);
const MAX_BYTES = 2_000_000;

// `#` đứng sau chữ/số/& (entity "&#x110;", id "a#b") không phải màu.
const HEX = /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const FUNC = /\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(\s*[^()]*\)/gi;
// Tên đứng ngay trước: `--x: `, `name: "`, `NAME = "`, `"key": "`.
// `obj.poor : "#94a3b8"` là nhánh ternary, không phải khoá ⇒ bỏ tên đứng sau dấu chấm.
const NAME_BEFORE = /(?<![\w$.#-])(--[\w-]+|[A-Za-z_$][\w$-]*)["']?\s*[:=]\s*["'`]?\s*$/;
// Tên thuộc tính CSS chung chung — không mang nghĩa, không ghi làm tên.
const GENERIC = new Set(["color", "background", "background-color", "border", "border-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "fill", "stroke", "outline", "outline-color", "box-shadow", "text-shadow", "filter", "accent-color", "caret-color", "--c", "c", "value", "default"]);

export function extractFromText(source: string, file: string, into: Map<string, Found>, stats: { translucent: number }, tokens?: TokenDef[]): void {
  // Màu nằm trong chú thích /* … */ là tài liệu, không phải màu đang dùng. Thay bằng khoảng
  // trắng (giữ xuống dòng) để số dòng không lệch.
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const lineOf = (off: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= off) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const matches: Array<{ raw: string; index: number }> = [];
  for (const m of text.matchAll(HEX)) matches.push({ raw: m[0], index: m.index });
  for (const m of text.matchAll(FUNC)) matches.push({ raw: m[0], index: m.index });
  matches.sort((a, b) => a.index - b.index);
  // Khối `{…}` bao ngoài từng màu: đi một lượt qua text song song với matches (đã xếp theo vị trí).
  // `:root {}` và `[data-theme=dark] {}` thành hai scope ⇒ `--on-primary` sáng không ghép với `--primary` tối.
  const stack: number[] = [];
  let pos = 0;
  const scopeAt = (index: number): string => {
    for (; pos < index; pos++) {
      const ch = text.charCodeAt(pos);
      if (ch === 123) stack.push(pos);
      else if (ch === 125) stack.pop();
    }
    return `${file}#${stack.length ? stack[stack.length - 1]! : 0}`;
  };
  for (const { raw, index } of matches) {
    const scope = scopeAt(index);
    if (raw.includes("${") || raw.includes("var(")) continue;
    const color = tryParse(raw);
    if (!color) continue;
    const s = swatch(color);
    if (s.alpha < 1) {
      stats.translucent++;
      continue;
    }
    const line = lineOf(index);
    const prefix = text.slice(lineStarts[line]!, index);
    const m = NAME_BEFORE.exec(prefix);
    // `cond ? x : "#94a3b8"` — x là nhánh ternary, không phải tên.
    const name = m && !/\?\s*$/.test(prefix.slice(0, m.index)) ? m[1] : undefined;
    const where = `${file}:${line + 1}`;
    addFound(into, s, raw, name, where, m?.[1] === "color");
    if (tokens && name && !GENERIC.has(name)) tokens.push({ name, hex: s.hex, scope, where });
  }
}

function addFound(into: Map<string, Found>, s: Swatch, raw: string, name: string | undefined, where: string, fg = false): void {
  // Trùng hex nhưng ngoài gamut (oklch kẹp ra cùng hex) vẫn tách riêng.
  const key = s.inGamut ? s.hex : `${s.hex}|${raw}`;
  const named = name && !GENERIC.has(name) ? name : undefined;
  const prev = into.get(key);
  if (prev) {
    prev.count++;
    if (fg) prev.fgUses = (prev.fgUses ?? 0) + 1;
    if (named && !prev.names.includes(named)) prev.names.push(named);
  } else {
    into.set(key, { swatch: s, raw, names: named ? [named] : [], where, count: 1, ...(fg ? { fgUses: 1 } : {}) });
  }
}

function walk(dir: string, out: string[], max: number): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries.sort()) {
    if (out.length >= max) return;
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!SKIP_DIR.has(e) && !e.startsWith(".")) walk(p, out, max);
    } else if (SCAN_EXT.has(extname(e).toLowerCase()) && !e.endsWith(".min.js") && st.size <= MAX_BYTES) out.push(p);
  }
}

/**
 * Đầu vào: file, thư mục (đệ quy, bỏ node_modules/dist/build…) hoặc màu viết thẳng.
 * Màu viết thẳng được ghi `where: arg`.
 */
export function extract(inputs: string[], opts: { maxFiles?: number; cwd?: string } = {}): Extracted {
  const cwd = opts.cwd ?? process.cwd();
  const map = new Map<string, Found>();
  const stats = { translucent: 0 };
  const tokens: TokenDef[] = [];
  let files = 0;
  for (const input of inputs) {
    let st;
    try {
      st = statSync(input);
    } catch {
      st = undefined;
    }
    if (!st) {
      const color = tryParse(input);
      if (color) {
        const s = swatch(color);
        if (s.alpha < 1) stats.translucent++;
        else addFound(map, s, input, undefined, "arg");
        continue;
      }
      fail(`not a file, directory or color: ${input}`, "NOT_FOUND", ["Pass a file, a directory, or colors like \"#3b82f6\" (quoted)"]);
    }
    const list: string[] = [];
    if (st.isDirectory()) walk(input, list, opts.maxFiles ?? 5000);
    else list.push(input);
    for (const f of list) {
      files++;
      // Đường dẫn như người dùng gõ (`src/x.css`); home quét cwd tuyệt đối ⇒ rút về tương đối.
      const shown = opts.cwd ? relative(cwd, f) || f : f;
      extractFromText(readFileSync(f, "utf8"), shown.replaceAll("\\", "/"), map, stats, tokens);
    }
  }
  return { colors: [...map.values()], tokens, translucent: stats.translucent, files, inputs };
}
