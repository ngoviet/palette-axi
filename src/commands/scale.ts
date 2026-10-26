import { choiceFlag, parseCommandArgs } from "../args.js";
import { apca, Color, cssOklch, fmtOklch, maxChroma, oklch, parseOrFail, round, swatch, toHex, wcag, type Swatch } from "../color.js";
import { fail } from "../errors.js";
import { commandLine, q, renderList, type Row } from "../views.js";

export const SCALE_HELP = `usage: palette-axi scale <color|hue> [--steps 11|12] [--mode light|dark] [--bg <color>] [--format toon|css]
description: One hue as a full ramp whose chroma peaks mid-scale and tapers at both ends (rule 5), each step with its role
args:
  <color|hue>: seed color ("#3b82f6", oklch(…)) or a hue angle 0–360 (chroma 0.20)
flags[4]:
  --steps 11: Tailwind-style 50…950 (default) · --steps 12: Radix-style 1…12, step 9 = the seed
  --mode light|dark: for 12 steps, which end is the app background (default light)
  --bg <color>: measure lc/wcag against this (default: step 1 for 12 steps, white for 11)
  --format css: print custom properties --<name>-<step> instead of TOON
fields: step,hex,oklch,role (default) + lc,wcag,l,c,h
examples:
  palette-axi scale "#3b82f6"
  palette-axi scale 150 --steps 12 --mode dark
`;

// L và hệ số chroma (so với đỉnh) đo trên bảng màu Tailwind v4 (trung bình các sắc).
const TW: Array<[step: string, l: number, k: number, role: string]> = [
  ["50", 0.97, 0.06, "light bg tint"],
  ["100", 0.935, 0.13, "light bg tint"],
  ["200", 0.885, 0.24, "light border, chip bg"],
  ["300", 0.81, 0.43, "light border, disabled"],
  ["400", 0.71, 0.67, "accent on dark bg"],
  ["500", 0.63, 0.87, "base"],
  ["600", 0.55, 1, "solid bg, accent on light bg"],
  ["700", 0.49, 0.99, "solid hover, text on light"],
  ["800", 0.43, 0.81, "text on light"],
  ["900", 0.38, 0.6, "heading on light"],
  ["950", 0.28, 0.37, "dark surface tint"],
];

// Vai trò từng bậc theo Radix Colors; L của bậc 9/10 lấy theo màu hạt giống.
const RADIX_ROLE = ["app bg", "subtle bg", "element bg", "element bg hover", "element bg active", "subtle border", "border, focus ring", "border hover", "solid bg (seed)", "solid bg hover", "low-contrast text", "high-contrast text"];
const RADIX_LIGHT = { l: [0.993, 0.982, 0.955, 0.925, 0.89, 0.85, 0.795, 0.73, NaN, NaN, 0.5, 0.3], k: [0.02, 0.06, 0.14, 0.22, 0.3, 0.38, 0.48, 0.62, 1, 1, 0.75, 0.4] };
const RADIX_DARK = { l: [0.18, 0.205, 0.25, 0.285, 0.32, 0.365, 0.425, 0.5, NaN, NaN, 0.78, 0.93], k: [0.1, 0.14, 0.26, 0.34, 0.4, 0.46, 0.55, 0.7, 1, 1, 0.7, 0.25] };

export interface Step {
  step: string;
  s: Swatch;
  role: string;
}

/** Seed: màu ⇒ giữ L/C/H; số ⇒ hue, C 0.20, L 0.62. */
export function seedOf(input: string, what = "seed"): { l: number; c: number; h: number; label: string } {
  if (/^\d+(\.\d+)?$/.test(input) && Number(input) <= 360) return { l: 0.62, c: 0.2, h: Number(input) % 360, label: `hue ${input}` };
  const s = swatch(parseOrFail(input, what));
  if (s.achromatic) fail(`${what}: ${input} is a grey (no hue); pass a hue angle or a colored seed`, "VALIDATION_ERROR");
  return { l: s.l, c: Math.max(s.c, 0.03), h: s.h, label: s.hex };
}

const mk = (l: number, c: number, h: number): Swatch => swatch(new Color(toHex(oklch(l, Math.min(c, maxChroma(l, h)), h))));

export function buildScale(seed: { l: number; c: number; h: number }, steps: 11 | 12, mode: "light" | "dark"): Step[] {
  if (steps === 11) {
    // Đỉnh chroma của thang: lấy C của seed nhưng không thấp hơn 0.12 để thang còn màu.
    const peak = Math.max(seed.c, 0.12);
    return TW.map(([step, l, k, role]) => ({ step, s: mk(l, peak * k, seed.h), role }));
  }
  const t = mode === "dark" ? RADIX_DARK : RADIX_LIGHT;
  const l9 = seed.l;
  const l10 = mode === "dark" ? Math.min(l9 + 0.04, 0.97) : Math.max(l9 - 0.04, 0.05);
  return t.l.map((l, i) => {
    const L = i === 8 ? l9 : i === 9 ? l10 : l;
    return { step: String(i + 1), s: mk(L, seed.c * t.k[i]!, seed.h), role: RADIX_ROLE[i]! };
  });
}

export async function scaleCommand(args: string[]): Promise<Record<string, unknown> | string> {
  const p = parseCommandArgs(
    "scale",
    args,
    {
      steps: { type: "string", hint: "--steps 11|12" },
      mode: { type: "string", hint: "--mode light|dark" },
      bg: { type: "string", hint: "--bg <color>" },
      format: { type: "string", hint: "--format toon|css" },
    },
    { min: 1, max: 1, usage: "<color|hue>" },
  );
  const steps = Number(choiceFlag(p, "steps", ["11", "12"] as const, "11")) as 11 | 12;
  const mode = choiceFlag(p, "mode", ["light", "dark"] as const, "light");
  const format = choiceFlag(p, "format", ["toon", "css"] as const, "toon");
  const seed = seedOf(p.positionals[0]!);
  const scale = buildScale(seed, steps, mode);
  const bgRaw = p.str("bg");
  const bg = bgRaw !== undefined ? swatch(parseOrFail(bgRaw, "--bg")) : steps === 12 ? scale[0]!.s : swatch(new Color("#ffffff"));
  const bgc = new Color(bg.hex);

  if (format === "css") {
    const name = `hue-${Math.round(seed.h)}`;
    return `/* palette-axi scale ${seed.label} --steps ${steps}${steps === 12 ? ` --mode ${mode}` : ""} */\n:root {\n${scale
      .map((x) => `  --${name}-${x.step}: ${cssOklch(x.s)}; /* ${x.s.hex} ${x.role} */`)
      .join("\n")}\n}\n`;
  }

  const rows: Row[] = scale.map((x) => {
    const c = new Color(x.s.hex);
    return { step: Number(x.step), hex: x.s.hex, oklch: fmtOklch(x.s), role: x.role, lc: Math.round(apca(c, bgc)), wcag: round(wcag(c, bgc), 2), l: round(x.s.l, 3), c: round(x.s.c, 3), h: Math.round(x.s.h) };
  });
  const peakIdx = scale.reduce((m, x, i) => (x.s.c > scale[m]!.s.c ? i : m), 0);
  const taper = peakIdx > 0 && peakIdx < scale.length - 1;
  const near = steps === 11 ? scale.reduce((m, x) => (Math.abs(x.s.l - seed.l) < Math.abs(m.s.l - seed.l) ? x : m), scale[0]!) : scale[8]!;
  const dL = near.s.l - seed.l;
  const list = renderList(
    { key: "steps", rows, fields: ["step", "hex", "oklch", "role"], available: ["step", "hex", "oklch", "role", "lc", "wcag", "l", "c", "h"], command: commandLine("palette-axi scale", args) },
    p.global,
  );
  return {
    seed: `${seed.label} oklch ${fmtOklch(seed)}, closest step ${near.step} (ΔL ${Math.abs(dL) < 0.0005 ? "0.000" : dL.toFixed(3)})`,
    scale: `${steps} steps, ${steps === 11 ? "Tailwind 50–950" : `Radix 1–12, ${mode}`}, lc/wcag vs ${bg.hex}`,
    ...list.out,
    check: `chroma peaks at step ${scale[peakIdx]!.step} (${scale[peakIdx]!.s.c.toFixed(3)}), ends ${scale[0]!.s.c.toFixed(3)} / ${scale[scale.length - 1]!.s.c.toFixed(3)} ${taper ? "✓ tapered" : "✗ peak at an end"}`,
    help: [
      ...list.help,
      `Run \`${commandLine("palette-axi scale", args.filter((a) => a !== "--format" && a !== "toon"))} --format css\` for CSS custom properties`,
      `Run \`palette-axi contrast ${q(scale[steps === 11 ? 4 : 10]!.s.hex)} ${q(bg.hex)}\` to check one step as text`,
    ],
  };
}
