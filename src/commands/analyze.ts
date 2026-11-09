import { parseCommandArgs } from "../args.js";
import { fmtOklch, parseOrFail, round } from "../color.js";
import { fail } from "../errors.js";
import { extract } from "../extract.js";
import { analyzePalette, pairFails, RULES, rulesLine, type Analysis } from "../rules.js";
import { assertFields, commandLine, q, renderList, type Row } from "../views.js";

export const ANALYZE_HELP = `usage: palette-axi analyze <file|dir|color…> [--bg <color>] [--pair fg:bg,…] [--ignore rule,…] [--strict]
description: Collect every opaque color from CSS/JS/HTML (or colors given as arguments), split neutrals / muted greys / accents, measure OKLCH, APCA Lc and WCAG 2 against the background, score the palette rules, and check text tokens on their own fills (rule 8). It compares token colors, not rendered pages: run axe or a DOM check too
args:
  <file|dir|color…>: files, directories (recursive; skips node_modules, dist, build, dot-dirs) or colors such as "#3b82f6", 3b82f6, "oklch(0.7 0.15 260)"
flags[6]:
  --bg <color>: background to measure against (default: a token named bg/background/paper, else the most used dark/light neutral)
  --pair fg:bg,…: extra text/fill pairs scored by rule 8, as token names (ok-ink:ok-bg) or colors (1e5a3a:e3f5ea)
  --ignore rule,…: skip these rules (no issues, not counted by --strict), e.g. --ignore 2-tint
  --strict: exit 1 with code ISSUES_FOUND when any rule fails (for CI)
  --fields a,b: color columns (hex,kind,oklch,lc,wcag,l,c,h,name,where,count,raw)
rules[8]:
  2-tint: neutrals share one hue at C 0.01–0.06 (status fills like ok-bg/error-bg and pure white are exempt)
  3-bg: dark bg L 0.13–0.20 (never pure black); light bg L ≥ 0.93
  4-band: accents on one lightness band (dark L 0.70–0.80, light L 0.45–0.70)
  5-scale: in a ramp of ≥5 accents (or tokens named like blue-500) chroma peaks mid-scale and tapers at both ends
  6-meaning: tokens named ok/success/warn/error/info carry green/amber/red/blue hues
  7-contrast: text tokens by name (ink, fg, text, muted, dim, text-secondary…) not paired by rule 8 need Lc 60 + 4.5:1 on bg; focus/ring/input-border need 3:1 (WCAG 1.4.11); other neutrals used as text |Lc| ≥ 60; accents |Lc| ≥ 45 + 3:1
  7-gamut: every color inside sRGB
  8-pairs: text tokens on their own fill, paired by name in the same {} block: on-X and X-foreground on X (+ -hover/-pressed/-active), foreground on background, X-text / X-ink / X-fg on X-subtle/-bg/-soft/-container, bare ink/fg/text/muted/text-secondary on bg/background/paper/surface; each needs Lc 60 + 4.5:1
examples:
  palette-axi analyze src --bg "#0a1122"
  palette-axi analyze styles/base.css --pair ok-ink:ok-bg --ignore 2-tint --strict
  palette-axi analyze "#3b82f6" "#ef4444" "#22c55e" --bg 0a1122
`;

/** `--pair a:b,c:d` ⇒ cặp; mỗi vế là tên token hoặc màu không chứa `:`/`,`. */
function parsePairs(raw: string | undefined): Array<{ fg: string; bg: string }> {
  if (raw === undefined) return [];
  const out = raw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [fg, bg, extra] = s.split(":").map((x) => x.trim());
    if (!fg || !bg || extra !== undefined) fail(`--pair: ${s} is not fg:bg`, "VALIDATION_ERROR", ["Write --pair ok-ink:ok-bg or --pair 1e5a3a:e3f5ea (comma for more pairs)"]);
    return { fg, bg };
  });
  if (!out.length) fail("--pair is empty", "VALIDATION_ERROR");
  return out;
}

function parseIgnore(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = list.filter((r) => !(RULES as readonly string[]).includes(r));
  if (!list.length || unknown.length) fail(`--ignore: unknown rule ${unknown.join(", ") || "(empty)"}`, "VALIDATION_ERROR", [`Rules: ${RULES.join(", ")}`]);
  return list;
}

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
    {
      bg: { type: "string", hint: "--bg <color>" },
      pair: { type: "string", hint: "--pair fg:bg,…" },
      ignore: { type: "string", hint: "--ignore rule,…" },
      strict: { type: "boolean", hint: "--strict" },
    },
    { min: 1, max: Infinity, usage: "a file, directory or color" },
  );
  const bgRaw = p.str("bg");
  const bg = bgRaw === undefined ? undefined : parseOrFail(bgRaw, "--bg");
  // Cờ sai ⇒ báo ngay, trước khi quét cả cây thư mục.
  assertFields(p.global.fields, COLOR_FIELDS);
  const pairs = parsePairs(p.str("pair"));
  const ignore = parseIgnore(p.str("ignore"));
  const ex = extract(p.positionals);
  const a = analyzePalette(ex.colors, bg, ex.tokens, { pairs, ignore });
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
  if (fixable.length < a.issues.length) {
    out["issues_count"] = `${fixable.length} of ${a.issues.length} total`;
    help.push(`Run \`${commandLine("palette-axi analyze", args)} --full\` to list all ${a.issues.length} issues`);
  }
  const list = renderList(
    { key: "palette", rows: colorRows(a), fields: DEFAULT_COLOR_FIELDS, available: COLOR_FIELDS, command: commandLine("palette-axi analyze", args), limit: 30 },
    p.global,
  );
  Object.assign(out, list.out);
  help.push(...list.help);
  const band = a.issues.find((i) => i.rule === "4-band" || i.rule === "7-contrast");
  if (band) help.push(`Run \`palette-axi contrast ${q(band.hex)} ${q(a.bg.hex)}\` for the per-use verdict and a same-hue color that passes`);
  const badPair = ignore.includes("8-pairs") ? undefined : a.pairs.find(pairFails);
  if (badPair) help.push(`Run \`palette-axi contrast ${q(badPair.fg.hex)} ${q(badPair.bg.hex)}\` to fix ${badPair.fg.name} on ${badPair.bg.name}`);
  if (a.issues.some((i) => i.rule === "2-tint" || i.rule === "3-bg")) {
    // Nền xám thuần (#ffffff) không có hue ⇒ `--seed "#ffffff"` lỗi exit 2; dùng hue chung của trung tính.
    const seed = !a.bg.achromatic ? q(a.bg.hex) : a.neutralHue !== undefined ? String(Math.round(a.neutralHue)) : undefined;
    if (seed) help.push(`Run \`palette-axi generate --seed ${seed} --mode ${a.mode}\` for tinted neutrals on this hue`);
  }
  if (!p.bool("strict") && a.issues.length) help.push("Add --strict to exit 1 on issues (CI)");
  help.push("Run `palette-axi analyze <path> --fields hex,kind,lc,name,where` to see where each color is defined");
  if (p.bool("strict") && a.issues.length) {
    fail(`${a.issues.length} palette issue${a.issues.length === 1 ? "" : "s"}: ${rulesLine(a.rules)}`, "ISSUES_FOUND", [
      ...a.issues.slice(0, 10).map((i) => `${i.hex} ${i.rule}: ${i.detail}`),
      `Run \`${commandLine("palette-axi analyze", args.filter((x) => x !== "--strict"))}\` for the full report`,
      `Add --ignore ${a.issues[0]!.rule} to skip a rule your palette breaks on purpose`,
    ]);
  }
  return { ...out, help };
}
