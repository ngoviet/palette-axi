import { parseCommandArgs } from "../args.js";
import { fmtOklch, parseOrFail, round } from "../color.js";
import { fail } from "../errors.js";
import { extract } from "../extract.js";
import { analyzePalette, pairFails, rulesLine, type Analysis } from "../rules.js";
import { commandLine, q, renderList, type Row } from "../views.js";

export const ANALYZE_HELP = `usage: palette-axi analyze <file|dir|color…> [--bg <color>] [--strict]
description: Collect every opaque color from CSS/JS/HTML (or colors given as arguments), split neutrals / muted greys / accents, measure OKLCH, APCA Lc and WCAG 2 against the background, score the 7 palette rules, and check text tokens on their own fills (rule 8)
args:
  <file|dir|color…>: files, directories (recursive; skips node_modules, dist, build, dot-dirs) or colors such as "#3b82f6", 3b82f6, "oklch(0.7 0.15 260)"
flags[3]:
  --bg <color>: background to measure against (default: the most used dark/light neutral)
  --strict: exit 1 with code ISSUES_FOUND when any rule fails (for CI)
  --fields a,b: color columns (hex,kind,oklch,lc,wcag,l,c,h,name,where,count,raw)
rules[8]:
  2-tint: neutrals share one hue at C 0.01–0.06
  3-bg: dark bg L 0.13–0.20 (never pure black); light bg L ≥ 0.93
  4-band: accents on one lightness band (dark L 0.70–0.80, light L 0.45–0.70)
  5-scale: in a ramp of ≥5 steps chroma peaks mid-scale and tapers at both ends
  6-meaning: tokens named success/warn/error/info carry green/amber/red/blue hues
  7-contrast: text neutrals |Lc| ≥ 60, accents |Lc| ≥ 45 (WCAG 2 ratio reported too)
  7-gamut: every color inside sRGB
  8-pairs: text tokens on their own fill, paired by name in the same {} block: on-X and X-foreground on X (+ -hover/-pressed/-active), foreground on background, X-text on X-subtle/-bg/-soft/-container; each needs Lc 60 + 4.5:1
examples:
  palette-axi analyze src --bg "#0a1122"
  palette-axi analyze "#3b82f6" "#ef4444" "#22c55e" --bg 0a1122
`;

export const COLOR_FIELDS = ["hex", "kind", "oklch", "lc", "wcag", "l", "c", "h", "name", "where", "count", "raw"] as const;
export const DEFAULT_COLOR_FIELDS = ["hex", "kind", "oklch", "lc", "wcag"] as const;

export function colorRows(a: Analysis): Row[] {
  return a.items.map((i) => ({
    hex: i.hex,
    kind: i.kind,
    oklch: fmtOklch(i),
    lc: Math.round(i.lc),
    wcag: round(i.wcag, 2),
    l: round(i.l, 3),
    c: round(i.c, 3),
    h: Math.round(i.h),
    name: i.names.join(" "),
    where: i.where,
    count: i.count,
    raw: i.raw,
  }));
}

export async function analyzeCommand(args: string[]): Promise<Record<string, unknown>> {
  const p = parseCommandArgs(
    "analyze",
    args,
    { bg: { type: "string", hint: "--bg <color>" }, strict: { type: "boolean", hint: "--strict" } },
    { min: 1, max: Infinity, usage: "a file, directory or color" },
  );
  const bgRaw = p.str("bg");
  const bg = bgRaw === undefined ? undefined : parseOrFail(bgRaw, "--bg");
  const ex = extract(p.positionals);
  const a = analyzePalette(ex.colors, bg, ex.tokens);
  const counts = (k: string): number => a.items.filter((i) => i.kind === k).length;
  const kinds = ["neutral", "muted", "accent", "tint"].filter((k) => counts(k)).map((k) => `${counts(k)} ${k}`);
  const source = `${p.positionals.join(" ")} (${ex.files} file${ex.files === 1 ? "" : "s"})`;
  const help: string[] = [];
  if (!a.items.length) {
    help.push("Pass CSS/JS/HTML files or a directory; color names (red, white) and var()/color-mix() are not read");
    return { source, colors: `0 colors found${ex.translucent ? ` (${ex.translucent} translucent skipped)` : ""}`, help };
  }
  const out: Record<string, unknown> = {
    source,
    bg: `${a.bg.hex} oklch ${fmtOklch(a.bg)}, ${a.mode}, ${a.bgSource === "flag" ? "from --bg" : a.bgSource === "inferred" ? "inferred (pass --bg to override)" : "assumed white: no dark/light neutral found"}`,
    colors: `${a.items.length} (${kinds.join(", ")})${ex.translucent ? `, ${ex.translucent} translucent skipped` : ""}`,
  };
  Object.assign(out, a.summary);
  out["rules"] = rulesLine(a.rules);
  const fixable = a.issues.slice(0, p.global.full ? Infinity : 20);
  out["issues"] = a.issues.length ? fixable : "0 issues found";
  if (fixable.length < a.issues.length) out["issues_count"] = `${fixable.length} of ${a.issues.length} total`;
  const list = renderList(
    { key: "palette", rows: colorRows(a), fields: DEFAULT_COLOR_FIELDS, available: COLOR_FIELDS, command: commandLine("palette-axi analyze", args), limit: 30 },
    p.global,
  );
  Object.assign(out, list.out);
  help.push(...list.help);
  const band = a.issues.find((i) => i.rule === "4-band" || i.rule === "7-contrast");
  if (band) help.push(`Run \`palette-axi contrast ${q(band.hex)} ${q(a.bg.hex)}\` for the per-use verdict and a same-hue color that passes`);
  const badPair = a.pairs.find(pairFails);
  if (badPair) help.push(`Run \`palette-axi contrast ${q(badPair.fg.hex)} ${q(badPair.bg.hex)}\` to fix ${badPair.fg.name} on ${badPair.bg.name}`);
  if (a.issues.some((i) => i.rule === "2-tint" || i.rule === "3-bg")) {
    help.push(`Run \`palette-axi generate --seed ${q(a.bg.hex)} --mode ${a.mode}\` for tinted neutrals on this hue`);
  }
  if (!p.bool("strict") && a.issues.length) help.push("Add --strict to exit 1 on issues (CI)");
  help.push("Run `palette-axi analyze <path> --fields hex,kind,lc,name,where` to see where each color is defined");
  if (p.bool("strict") && a.issues.length) {
    fail(`${a.issues.length} palette issue${a.issues.length === 1 ? "" : "s"}: ${rulesLine(a.rules)}`, "ISSUES_FOUND", [
      ...a.issues.slice(0, 10).map((i) => `${i.hex} ${i.rule}: ${i.detail}`),
      `Run \`${commandLine("palette-axi analyze", args.filter((x) => x !== "--strict"))}\` for the full report`,
    ]);
  }
  return { ...out, help };
}
