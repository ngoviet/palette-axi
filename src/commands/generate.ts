import { choiceFlag, numFlag, parseCommandArgs } from "../args.js";
import { apca, Color, cssOklch, fmtOklch, maxChroma, oklch, round, solveLc, swatch, toHex, wcag, type Swatch } from "../color.js";
import { fail } from "../errors.js";
import type { Found } from "../extract.js";
import { PRESETS, type PresetToken } from "../presets.js";
import { analyzePalette, rulesLine, T, type Mode } from "../rules.js";
import { VERSION } from "../version.js";
import { assertFields, commandLine, renderList, type Row } from "../views.js";
import { seedOf } from "./scale.js";

export const GENERATE_HELP = `usage: palette-axi generate --seed <hue|color> [--mode dark|light|both] [--roles a,b] [--lc <n>] [--format toon|css|tailwind|json]
       palette-axi generate --preset neon-dark [--roles a,b] [--format …]
description: Build a theme by the 7 rules: neutrals tinted with the seed hue, a not-black background with a corner glow, accents on one lightness band at equal APCA contrast with max in-gamut chroma, meaning-coded status colors. The result is re-scored with the analyze rules
flags[6]:
  --seed <hue|color>: hue angle (262) or a color whose hue is the primary ("#22d3ee")
  --mode dark|light|both: default dark; both = light :root + dark under prefers-color-scheme / [data-theme=dark]
  --roles a,b: accents to build (default primary,ok,warn,bad,info). Named hues: red orange amber yellow lime green teal cyan sky blue indigo violet purple fuchsia pink; custom: brand=310
  --lc <n>: target |APCA Lc| of accents on bg (default 60), kept inside the band
  --preset neon-dark: the lan-topo-card neon theme with its 3 weak colors fixed (blue/red into the band, secondary text to Lc 60)
  --format toon|css|tailwind|json: css = custom properties, tailwind = v4 @theme block, json = tokens
fields: token,hex,oklch,role,lc,wcag,css (neutrals default token,hex,oklch,role; accents token,hex,oklch,lc)
examples:
  palette-axi generate --seed 262 --mode dark
  palette-axi generate --seed "#22d3ee" --mode both --format css > tokens.css
  palette-axi generate --preset neon-dark --format tailwind
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

/** Preset: giữ nguyên màu gốc, chỉ sửa token có `fix`. */
export function buildPreset(name: string, only?: string[]): Theme {
  const preset = PRESETS[name];
  if (!preset) fail(`unknown preset: ${name}`, "VALIDATION_ERROR", [`Presets: ${Object.keys(PRESETS).join(", ")}`]);
  const bgTok = preset.neutrals.find((t) => t.token === "bg")!;
  const bg = new Color(bgTok.hex);
  const fixed: Theme["fixed"] = [];
  const apply = (t: PresetToken): Token => {
    const orig = swatch(new Color(t.hex));
    let s = orig;
    if (t.fix === "band") {
      const l = T.darkBand[0] + 0.02;
      s = sw(oklch(l, Math.min(orig.c, maxChroma(l, orig.h)), orig.h));
    } else if (t.fix === "text") {
      s = sw(solveLc(bg, orig.h, 62, { cMax: orig.c }).color);
    }
    const tok = measure(t.token, s, t.role, bg);
    if (t.fix) {
      const before = Math.round(apca(new Color(orig.hex), bg));
      fixed.push({
        token: t.token,
        from: `${orig.hex} L ${orig.l.toFixed(3)} Lc ${before}`,
        to: `${s.hex} L ${s.l.toFixed(3)} Lc ${Math.round(tok.lc)}`,
        why: t.fix === "band" ? `below band L ${T.darkBand[0].toFixed(2)}–${T.darkBand[1].toFixed(2)}` : `text under Lc ${T.textLc}`,
      });
      tok.from = orig.hex;
    }
    return tok;
  };
  let acc = preset.accents;
  if (only) {
    const unknown = only.filter((o) => !acc.some((a) => a.token === o));
    if (unknown.length) fail(`--roles: not in preset ${name}: ${unknown.join(", ")}`, "VALIDATION_ERROR", [`Tokens: ${acc.map((a) => a.token).join(", ")}`]);
    acc = acc.filter((a) => only.includes(a.token));
  }
  return { mode: preset.mode, neutrals: preset.neutrals.map(apply), accents: acc.map(apply), fixed };
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

function renderCss(themes: Theme[], header: string): string {
  if (themes.length === 1) return `${header}\n:root {\n  color-scheme: ${themes[0]!.mode};\n${cssVars(themes[0]!, "  ")}\n  --bg-gradient: ${GRADIENT};\n}\n`;
  const [light, dark] = themes as [Theme, Theme];
  return `${header}
:root, [data-theme="light"] {
  color-scheme: light;
${cssVars(light, "  ")}
  --bg-gradient: ${GRADIENT};
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${cssVars(dark, "    ")}
  }
}
[data-theme="dark"] {
  color-scheme: dark;
${cssVars(dark, "  ")}
}
`;
}

function renderTailwind(themes: Theme[], header: string): string {
  const first = themes[0]!;
  let s = `${header}\n/* Tailwind v4: classes bg-bg, text-fg, text-dim, border-border, text-primary… */\n@theme {\n${cssVars(first, "  ", "color-")}\n}\n`;
  if (themes.length === 2) s += `@media (prefers-color-scheme: dark) {\n  :root {\n${cssVars(themes[1]!, "    ", "color-")}\n  }\n}\n`;
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
  if (presetName) {
    const mode = choiceFlag(p, "mode", ["dark", "light", "both"] as const, "dark");
    if (mode !== "dark") fail(`preset ${presetName} has a dark mode only`, "VALIDATION_ERROR", ["Use --seed <hue> --mode light|both for a light theme"]);
    if (p.str("lc") !== undefined) fail("--lc does not apply to a preset (its colors are fixed)", "VALIDATION_ERROR");
    const only = p.str("roles")?.split(",").map((r) => r.trim()).filter(Boolean);
    themes = [buildPreset(presetName, only)];
    seedLine = `preset ${presetName}: ${PRESETS[presetName]!.source}`;
  } else {
    const mode = choiceFlag(p, "mode", ["dark", "light", "both"] as const, "dark");
    const seed = seedOf(seedRaw!);
    const target = numFlag(p, "lc", 60, 30, 100);
    const roles = parseRoles(p.str("roles"), seed.h);
    const modes: Mode[] = mode === "both" ? ["light", "dark"] : [mode];
    themes = modes.map((m) => buildTheme(seed.h, m, roles, target));
    seedLine = `${seed.label} ⇒ hue ${Math.round(seed.h)}, accents at |Lc| ${target}`;
  }

  const header = `/* palette-axi ${VERSION} · ${commandLine("generate", args)} */`;
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
  if (themes.length === 1) Object.assign(out, { mode: themes[0]!.mode }, block(themes[0]!));
  else for (const t of themes) out[t.mode] = block(t);
  const base = commandLine("palette-axi generate", args.filter((a, i) => a !== "--format" && args[i - 1] !== "--format"));
  help.push(`Run \`${base} --format css > tokens.css\` (or tailwind, json) to write the tokens`);
  help.push("Run `palette-axi analyze <your css>` after wiring the tokens to re-check the real UI");
  if (!presetName) help.push(`Run \`palette-axi scale ${themes[0]!.accents[0]?.s.hex ? `"${themes[0]!.accents[0].s.hex}"` : "<color>"} --steps 12 --mode ${themes[themes.length - 1]!.mode}\` for a full ramp of one accent`);
  return { ...out, help };
}
