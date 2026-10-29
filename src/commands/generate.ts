import { choiceFlag, numFlag, parseCommandArgs } from "../args.js";
import { apca, Color, cssOklch, fmtOklch, maxChroma, oklch, round, solveLc, swatch, toHex, wcag, type Swatch } from "../color.js";
import { fail } from "../errors.js";
import type { Found } from "../extract.js";
import { PRESETS, type Preset, type PresetToken } from "../presets.js";
import { analyzePalette, rulesLine, T, type Mode } from "../rules.js";
import { VERSION } from "../version.js";
import { assertFields, commandLine, renderList, type Row } from "../views.js";
import { seedOf } from "./scale.js";

export const GENERATE_HELP = `usage: palette-axi generate --seed <hue|color> [--mode dark|light|both] [--roles a,b] [--lc <n>] [--format toon|css|tailwind|json]
       palette-axi generate --preset neon-dark|cockpit [--mode …] [--roles a,b] [--format …]
description: Build a theme by the 7 rules: neutrals tinted with the seed hue, a not-black background with a corner glow, accents on one lightness band at equal APCA contrast with max in-gamut chroma, meaning-coded status colors. The result is re-scored with the analyze rules
flags[6]:
  --seed <hue|color>: hue angle (262) or a color whose hue is the primary ("#22d3ee")
  --mode dark|light|both: default dark with --seed; with --preset, default is every available mode (cockpit: both). both = light :root + dark under prefers-color-scheme / [data-theme=dark]
  --roles a,b: accents to build (default primary,ok,warn,bad,info). Named hues: red orange amber yellow lime green teal cyan sky blue indigo violet purple fuchsia pink; custom: brand=310
  --lc <n>: target |APCA Lc| of accents on bg (default 60), kept inside the band
  --preset neon-dark|cockpit: a real theme with its weak colors fixed and listed in fixed[]. neon-dark = lan-topo-card neon (dark only; blue/red into the band, secondary text to Lc 60). cockpit = cockpit-tools light + dark (default both; warm paper bg tinted, status colors and muted text readable, dark hover brighter) with its principles[] and gradient/alpha vars in --format css
  --format toon|css|tailwind|json: css = custom properties, tailwind = v4 @theme block, json = tokens
fields: token,hex,oklch,role,lc,wcag,css (neutrals default token,hex,oklch,role; accents token,hex,oklch,lc)
examples:
  palette-axi generate --seed 262 --mode dark
  palette-axi generate --seed "#22d3ee" --mode both --format css > tokens.css
  palette-axi generate --preset neon-dark --format tailwind
  palette-axi generate --preset cockpit --format css > cockpit.css
`;

const HUES: Record<string, number> = {
  ok: 150, warn: 75, bad: 25, info: 240,
  red: 25, orange: 55, amber: 75, yellow: 95, lime: 130, green: 150, teal: 180, cyan: 205, sky: 230, blue: 255, indigo: 275, violet: 295, purple: 305, fuchsia: 325, pink: 350,
};
const ALIAS: Record<string, string> = { success: "ok", good: "ok", warning: "warn", error: "bad", danger: "bad", notice: "info" };
const DEFAULT_ROLES = ["primary", "ok", "warn", "bad", "info"];
const FIELDS = ["token", "hex", "oklch", "role", "lc", "wcag", "css"] as const;
const ROLE_TEXT: Record<string, string> = { primary: "seed hue", ok: "success", warn: "warning", bad: "error", info: "info" };

export interface Token {
  token: string;
  s: Swatch;
  role: string;
  lc: number;
  wcag: number;
  from?: string;
}

export interface Theme {
  mode: Mode;
  neutrals: Token[];
  accents: Token[];
  fixed: Array<{ token: string; from: string; to: string; why: string }>;
  /** Biến CSS thêm của preset; thay --bg-gradient mặc định. */
  css?: Record<string, string>;
}

const sw = (c: Color): Swatch => swatch(new Color(toHex(c)));

function measure(token: string, s: Swatch, role: string, bg: Color): Token {
  const c = new Color(s.hex);
  return { token, s, role, lc: apca(c, bg), wcag: wcag(c, bg) };
}

/** Trung tính (nguyên tắc 2, 3, 7): nền L 0.18 không đen, mặt nổi sáng hơn, chữ theo Lc mục tiêu. */
function neutrals(h: number, mode: Mode): { bg: Color; list: Token[] } {
  const n = (l: number, c: number): Swatch => sw(oklch(l, c, h));
  if (mode === "dark") {
    const bgS = n(0.18, 0.035);
    const bg = new Color(bgS.hex);
    const dim = sw(solveLc(bg, h, 62, { cMax: 0.05 }).color);
    const fg = sw(solveLc(bg, h, 92, { cMax: 0.015 }).color);
    const raw: Array<[string, Swatch, string]> = [
      ["bg-edge", n(0.145, 0.02), "gradient edge"],
      ["bg", bgS, "app background"],
      ["surface", n(0.225, 0.04), "raised panel (+0.045 L)"],
      ["glow", n(0.26, 0.055), "gradient center, raised 2 (+0.08 L)"],
      ["border", n(0.34, 0.05), "border, divider"],
      ["dim", dim, "secondary text (Lc 60+)"],
      ["fg", fg, "primary text (Lc 90+)"],
    ];
    return { bg, list: raw.map(([t, s, r]) => measure(t, s, r, bg)) };
  }
  const bgS = n(0.975, 0.006);
  const bg = new Color(bgS.hex);
  const dim = sw(solveLc(bg, h, 62, { cMax: 0.05 }).color);
  const fg = sw(solveLc(bg, h, 92, { cMax: 0.025 }).color);
  const raw: Array<[string, Swatch, string]> = [
    ["bg-edge", n(0.955, 0.01), "gradient edge"],
    ["bg", bgS, "app background"],
    ["surface", n(0.99, 0.008), "raised panel"],
    ["glow", n(0.985, 0.014), "gradient center"],
    ["border", n(0.88, 0.02), "border, divider"],
    ["dim", dim, "secondary text (Lc 60+)"],
    ["fg", fg, "primary text (Lc 90+)"],
  ];
  return { bg, list: raw.map(([t, s, r]) => measure(t, s, r, bg)) };
}

function parseRoles(raw: string | undefined, seedHue: number): Array<{ token: string; h: number }> {
  const names = raw === undefined ? DEFAULT_ROLES : raw.split(",").map((r) => r.trim()).filter(Boolean);
  if (!names.length) fail("--roles is empty", "VALIDATION_ERROR");
  return names.map((name) => {
    const custom = /^([a-z][\w-]*)=(\d+(?:\.\d+)?)$/i.exec(name);
    if (custom) return { token: custom[1]!, h: Number(custom[2]) % 360 };
    const key = ALIAS[name] ?? name;
    if (key === "primary") return { token: "primary", h: seedHue };
    const h = HUES[key];
    if (h === undefined) {
      fail(`--roles: unknown role: ${name}`, "VALIDATION_ERROR", [`Known: primary, ${Object.keys(HUES).join(", ")}; or name=hue like brand=310`]);
    }
    return { token: key, h };
  });
}

/** Màu nhấn (nguyên tắc 4): cùng |Lc| trên nền, kẹp trong dải L, chroma lớn nhất trong gamut ≤ 0.20. */
function accents(roles: Array<{ token: string; h: number }>, bg: Color, mode: Mode, target: number): Token[] {
  const [lo, hi] = mode === "dark" ? T.darkBand : T.lightBand;
  return roles.map(({ token, h }) => {
    const s = sw(solveLc(bg, h, target, { lo, hi, cMax: 0.2 }).color);
    return measure(token, s, ROLE_TEXT[token] ?? `hue ${Math.round(h)}`, bg);
  });
}

export function buildTheme(seedHue: number, mode: Mode, roles: Array<{ token: string; h: number }>, target: number): Theme {
  const { bg, list } = neutrals(seedHue, mode);
  return { mode, neutrals: list, accents: accents(roles, bg, mode, target), fixed: [] };
}

export function presetOf(name: string): Preset {
  const preset = PRESETS[name];
  if (!preset) fail(`unknown preset: ${name}`, "VALIDATION_ERROR", [`Presets: ${Object.keys(PRESETS).join(", ")}`]);
  return preset;
}

const presetModes = (p: Preset): Mode[] => (["light", "dark"] as const).filter((m) => p.modes[m]);

/** Sửa một token theo `fix` (xem presets.ts); nền `bg` dùng chính nó làm nền đo. */
function fixSwatch(t: PresetToken, orig: Swatch, bg: Color, mode: Mode): { s: Swatch; why: string } {
  const [lo, hi] = mode === "dark" ? T.darkBand : T.lightBand;
  const band = `L ${lo.toFixed(2)}–${hi.toFixed(2)}`;
  switch (t.fix) {
    case "band":
      if (mode === "dark") {
        const l = t.to ?? lo + 0.02;
        return { s: sw(oklch(l, Math.min(orig.c, maxChroma(l, orig.h)), orig.h)), why: `${orig.l < lo ? "below" : "moved inside"} band ${band}` };
      }
      return { s: sw(solveLc(bg, orig.h, t.to ?? 60, { lo, hi, cMax: orig.c }).color), why: `above band ${band}, too faint on light bg` };
    case "text": {
      const target = t.to ?? 62;
      const weak = Math.abs(apca(new Color(orig.hex), bg)) < T.textLc;
      return { s: sw(solveLc(bg, orig.h, target, { cMax: orig.c }).color), why: `${weak ? `text under Lc ${T.textLc}` : "text hierarchy"}, target Lc ${target}` };
    }
    case "tint": {
      const h = orig.achromatic ? (t.to ?? 0) : orig.h;
      const l = Math.min(orig.l, 0.99);
      return { s: sw(oklch(l, Math.min(0.007, maxChroma(l, h)), h)), why: "untinted grey (C < 0.005)" };
    }
    case "bg": {
      const [bLo, bHi] = T.darkBg;
      const l = mode === "dark" ? Math.min(Math.max(orig.l, bLo + 0.005), bHi - 0.005) : Math.max(orig.l, T.lightBgMin + 0.01);
      return { s: sw(oklch(l, orig.c, orig.h)), why: mode === "dark" ? `bg L outside ${bLo}–${bHi}` : `bg L under ${T.lightBgMin}` };
    }
    default:
      return { s: orig, why: "" };
  }
}

/** Preset: giữ nguyên màu gốc, chỉ sửa token có `fix`. Nền sửa trước để các token khác đo trên nền mới. */
export function buildPreset(name: string, mode: Mode, only?: string[]): Theme {
  const pm = presetOf(name).modes[mode];
  if (!pm) fail(`preset ${name} has no ${mode} mode`, "VALIDATION_ERROR");
  const fixed: Theme["fixed"] = [];
  const bgTok = pm.neutrals.find((t) => t.token === "bg")!;
  const bgOrig = swatch(new Color(bgTok.hex));
  const bg = new Color(fixSwatch(bgTok, bgOrig, new Color(bgOrig.hex), mode).s.hex);
  const apply = (t: PresetToken): Token => {
    const orig = swatch(new Color(t.hex));
    const { s, why } = fixSwatch(t, orig, bg, mode);
    const tok = measure(t.token, s, t.role, bg);
    if (t.fix) {
      const before = Math.round(apca(new Color(orig.hex), bg));
      fixed.push({
        token: t.token,
        from: `${orig.hex} L ${orig.l.toFixed(3)} C ${orig.c.toFixed(3)} Lc ${before}`,
        to: `${s.hex} L ${s.l.toFixed(3)} C ${s.c.toFixed(3)} Lc ${Math.round(tok.lc)}`,
        why,
      });
      tok.from = orig.hex;
    }
    return tok;
  };
  let acc = pm.accents;
  if (only) {
    const unknown = only.filter((o) => !acc.some((a) => a.token === o));
    if (unknown.length) fail(`--roles: not in preset ${name}: ${unknown.join(", ")}`, "VALIDATION_ERROR", [`Tokens: ${acc.map((a) => a.token).join(", ")}`]);
    acc = acc.filter((a) => only.includes(a.token));
  }
  return { mode, neutrals: pm.neutrals.map(apply), accents: acc.map(apply), fixed, ...(pm.css ? { css: pm.css } : {}) };
}

/** Chấm lại kết quả bằng chính bộ luật của analyze. */
export function scoreTheme(t: Theme): string {
  const all = [...t.neutrals, ...t.accents];
  const found: Found[] = all.map((x) => ({ swatch: x.s, raw: x.s.hex, names: [x.token], where: x.token, count: 1 }));
  const bg = t.neutrals.find((x) => x.token === "bg")!;
  const a = analyzePalette(found, new Color(bg.s.hex));
  return rulesLine(a.rules) + (a.issues.length ? `; ${a.issues.map((i) => `${i.hex} ${i.rule}`).join(", ")}` : "");
}

function rowsOf(list: Token[]): Row[] {
  return list.map((x) => ({ token: x.token, hex: x.s.hex, oklch: fmtOklch(x.s), role: x.role, lc: Math.round(x.lc), wcag: round(x.wcag, 2), css: cssOklch(x.s) }));
}

const GRADIENT = "radial-gradient(120% 140% at 0% 0%, var(--glow) 0%, var(--bg) 55%, var(--bg-edge) 100%)";

function cssVars(t: Theme, indent: string, prefix = ""): string {
  return [...t.neutrals, ...t.accents].map((x) => `${indent}--${prefix}${x.token}: ${cssOklch(x.s)}; /* ${x.s.hex} */`).join("\n");
}

/** Biến thêm: của preset nếu có, không thì --bg-gradient mặc định (chỉ ở khối đầu, nó tham chiếu var()). */
function extraVars(t: Theme, indent: string, first: boolean): string {
  const extra = t.css ?? (first ? { "bg-gradient": GRADIENT } : {});
  const tokens = new Set([...t.neutrals, ...t.accents].map((x) => x.token));
  return Object.entries(extra)
    .filter(([, v]) => [...v.matchAll(/var\(\s*--([\w-]+)/g)].every((m) => tokens.has(m[1]!)))
    .map(([k, v]) => `\n${indent}--${k}: ${v};`).join("");
}

function renderCss(themes: Theme[], header: string): string {
  if (themes.length === 1) return `${header}\n:root {\n  color-scheme: ${themes[0]!.mode};\n${cssVars(themes[0]!, "  ")}${extraVars(themes[0]!, "  ", true)}\n}\n`;
  const [light, dark] = themes as [Theme, Theme];
  return `${header}
:root, [data-theme="light"] {
  color-scheme: light;
${cssVars(light, "  ")}${extraVars(light, "  ", true)}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${cssVars(dark, "    ")}${extraVars(dark, "    ", false)}
  }
}
[data-theme="dark"] {
  color-scheme: dark;
${cssVars(dark, "  ")}${extraVars(dark, "  ", false)}
}
`;
}

function renderTailwind(themes: Theme[], header: string): string {
  const first = themes[0]!;
  let s = `${header}\n/* Tailwind v4: classes bg-bg, text-fg, text-dim, border-border, text-primary… */\n@theme {\n${cssVars(first, "  ", "color-")}\n}\n`;
  // Giống --format css: tối theo hệ điều hành trừ khi ép sáng, và ép tối bằng [data-theme="dark"].
  if (themes.length === 2) {
    const dark = themes[1]!;
    s += `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${cssVars(dark, "    ", "color-")}\n  }\n}\n`;
    s += `[data-theme="dark"] {\n${cssVars(dark, "  ", "color-")}\n}\n`;
  }
  return s;
}

function renderJson(themes: Theme[]): string {
  const obj: Record<string, unknown> = {};
  for (const t of themes) {
    obj[t.mode] = Object.fromEntries([...t.neutrals, ...t.accents].map((x) => [x.token, { hex: x.s.hex, oklch: cssOklch(x.s), lc: Math.round(x.lc), wcag: round(x.wcag, 2), role: x.role }]));
  }
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export async function generateCommand(args: string[]): Promise<Record<string, unknown> | string> {
  const p = parseCommandArgs("generate", args, {
    seed: { type: "string", hint: "--seed <hue|color>" },
    mode: { type: "string", hint: "--mode dark|light|both" },
    roles: { type: "string", hint: "--roles a,b" },
    lc: { type: "string", hint: "--lc <n>" },
    preset: { type: "string", hint: "--preset neon-dark" },
    format: { type: "string", hint: "--format toon|css|tailwind|json" },
  });
  const format = choiceFlag(p, "format", ["toon", "css", "tailwind", "json"] as const, "toon");
  const presetName = p.str("preset");
  const seedRaw = p.str("seed");
  if (presetName && seedRaw) fail("--preset and --seed: pick one", "VALIDATION_ERROR", ["A preset already fixes every hue; use --seed to build a new theme"]);
  if (!presetName && !seedRaw) {
    fail("generate: missing --seed (or --preset)", "VALIDATION_ERROR", [
      "Run `palette-axi generate --seed 262` (a hue) or `--seed \"#22d3ee\"` (a color)",
      `Presets: ${Object.keys(PRESETS).join(", ")}`,
    ]);
  }
  if (p.global.fields) assertFields(p.global.fields, FIELDS);
  let themes: Theme[];
  let seedLine: string;
  let principles: string[] | undefined;
  if (presetName) {
    const preset = presetOf(presetName);
    const have = presetModes(preset);
    // Mặc định: mọi chế độ preset có (neon-dark: dark; cockpit: both).
    const mode = choiceFlag(p, "mode", ["dark", "light", "both"] as const, have.length === 2 ? "both" : have[0]!);
    const want: Mode[] = mode === "both" ? ["light", "dark"] : [mode];
    const missing = want.filter((m) => !have.includes(m));
    if (missing.length) {
      fail(`preset ${presetName} has no ${missing.join(", ")} mode`, "VALIDATION_ERROR", [`Modes: ${have.join(", ")}; or use --seed <hue> --mode ${missing[0]} to build one`]);
    }
    if (p.str("lc") !== undefined) fail("--lc does not apply to a preset (its colors are fixed)", "VALIDATION_ERROR");
    const only = p.str("roles")?.split(",").map((r) => r.trim()).filter(Boolean);
    themes = want.map((m) => buildPreset(presetName, m, only));
    seedLine = `preset ${presetName}: ${preset.source}`;
    principles = preset.principles;
  } else {
    const mode = choiceFlag(p, "mode", ["dark", "light", "both"] as const, "dark");
    const seed = seedOf(seedRaw!);
    const target = numFlag(p, "lc", 60, 30, 100);
    const roles = parseRoles(p.str("roles"), seed.h);
    const modes: Mode[] = mode === "both" ? ["light", "dark"] : [mode];
    themes = modes.map((m) => buildTheme(seed.h, m, roles, target));
    seedLine = `${seed.label} ⇒ hue ${Math.round(seed.h)}, accents at |Lc| ${target}`;
  }

  const header = principles
    ? `/* palette-axi ${VERSION} · ${commandLine("generate", args)}\n * Principles of ${presetName}:\n${principles.map((x) => ` * - ${x}`).join("\n")}\n */`
    : `/* palette-axi ${VERSION} · ${commandLine("generate", args)} */`;
  if (format === "css") return renderCss(themes, header);
  if (format === "tailwind") return renderTailwind(themes, header);
  if (format === "json") return renderJson(themes);

  const help: string[] = [];
  const block = (t: Theme): Record<string, unknown> => {
    const nf = p.global.fields ?? ["token", "hex", "oklch", "role"];
    const af = p.global.fields ?? ["token", "hex", "oklch", "lc"];
    const n = renderList({ key: "neutrals", rows: rowsOf(t.neutrals), fields: nf, available: FIELDS, command: "palette-axi generate" }, { ...p.global, full: true });
    const a = renderList({ key: "accents", rows: rowsOf(t.accents), fields: af, available: FIELDS, command: "palette-axi generate" }, { ...p.global, full: true });
    const o: Record<string, unknown> = { ...n.out, ...a.out };
    if (t.fixed.length) o["fixed"] = t.fixed;
    o["check"] = scoreTheme(t);
    return o;
  };
  const out: Record<string, unknown> = { seed: seedLine };
  if (principles) out["principles"] = principles;
  if (themes.length === 1) Object.assign(out, { mode: themes[0]!.mode }, block(themes[0]!));
  else for (const t of themes) out[t.mode] = block(t);
  const base = commandLine("palette-axi generate", args, ["--format"]);
  help.push(`Run \`${base} --format css > tokens.css\` (or tailwind, json) to write the tokens`);
  help.push("Run `palette-axi analyze <your css>` after wiring the tokens to re-check the real UI");
  if (!presetName) help.push(`Run \`palette-axi scale ${themes[0]!.accents[0]?.s.hex ? `"${themes[0]!.accents[0].s.hex}"` : "<color>"} --steps 12 --mode ${themes[themes.length - 1]!.mode}\` for a full ramp of one accent`);
  return { ...out, help };
}
