import { numFlag, parseCommandArgs } from "../args.js";
import { apca, Color, fmtOklch, parseOrFail, round, solveLc, swatch, toHex, wcag } from "../color.js";
import { q, renderList, type Row } from "../views.js";

export const CONTRAST_HELP = `usage: palette-axi contrast <fg> <bg> [--size <px>] [--weight <100-900>]
description: WCAG 2.1 ratio and APCA Lc for one text/background pair, a pass/fail per use, and the nearest same-hue color that passes content text
args:
  <fg> <bg>: any CSS color; quote hex ("#e6edf7") or write it without # (e6edf7)
flags[2]:
  --size <px>: font size in CSS px ⇒ one verdict for that text
  --weight <n>: font weight (default 400); ≥700 at ≥18.7px counts as large text
thresholds (APCA Lc, |value|):
  90 body text preferred · 75 body text minimum · 60 content text · 45 large text, headlines, icon strokes · 30 secondary, placeholder, disabled · 15 non-text edges
  WCAG 2: 4.5:1 normal text, 3:1 large text and UI. APCA is a WCAG 3 candidate, so both are reported
examples:
  palette-axi contrast "#8ea3c2" "#0a1122"
  palette-axi contrast e6edf7 0a1122 --size 14
`;

interface Use {
  use: string;
  lc: number;
  wcag: number;
}

const USES: Use[] = [
  { use: "body text, preferred", lc: 90, wcag: 7 },
  { use: "body text, minimum", lc: 75, wcag: 4.5 },
  { use: "content text", lc: 60, wcag: 4.5 },
  { use: "large text, headline, icon stroke", lc: 45, wcag: 3 },
  { use: "secondary, placeholder, disabled", lc: 30, wcag: 0 },
  { use: "non-text edge, divider", lc: 15, wcag: 0 },
];

/** Cỡ chữ ⇒ một mức yêu cầu (rút gọn từ bảng APCA + định nghĩa "large text" của WCAG 2). */
function useFor(size: number, weight: number): Use {
  const large = size >= 24 || (size >= 18.66 && weight >= 700);
  if (large) return USES[3]!;
  if (size < 14 || weight < 300) return { use: `small or thin text (${size}px/${weight})`, lc: 90, wcag: 4.5 };
  return { ...USES[1]!, use: `body text (${size}px/${weight})` };
}

export async function contrastCommand(args: string[]): Promise<Record<string, unknown>> {
  const p = parseCommandArgs(
    "contrast",
    args,
    { size: { type: "string", hint: "--size <px>" }, weight: { type: "string", hint: "--weight <n>" } },
    { min: 2, max: 2, usage: "<fg> <bg>" },
  );
  const fg = parseOrFail(p.positionals[0]!, "fg");
  const bg = parseOrFail(p.positionals[1]!, "bg");
  const fs = swatch(fg);
  const bs = swatch(bg);
  const fgc = new Color(fs.hex);
  const bgc = new Color(bs.hex);
  const ratio = wcag(fgc, bgc);
  const lc = apca(fgc, bgc);
  const abs = Math.abs(lc);
  const pass = (u: Use): boolean => abs >= u.lc && ratio >= u.wcag;
  const out: Record<string, unknown> = {
    fg: `${fs.hex} oklch ${fmtOklch(fs)}`,
    bg: `${bs.hex} oklch ${fmtOklch(bs)}`,
    wcag: `${round(ratio, 2)}:1 (${ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large text only" : "fails AA"})`,
    apca: `Lc ${Math.round(lc)} (${lc < 0 ? "light text on dark" : "dark text on light"})`,
  };
  const help: string[] = [];
  const sizeRaw = p.str("size");
  if (sizeRaw !== undefined) {
    const u = useFor(numFlag(p, "size", 16, 4, 400), numFlag(p, "weight", 400, 100, 900));
    out["verdict"] = `${pass(u) ? "pass" : "fail"}: ${u.use} needs |Lc| ≥ ${u.lc}${u.wcag ? ` and ${u.wcag}:1` : ""}; has ${Math.round(abs)} and ${round(ratio, 2)}:1`;
  } else {
    if (p.str("weight") !== undefined) numFlag(p, "weight", 400, 100, 900);
    const rows: Row[] = USES.map((u) => ({ use: u.use, need: `Lc ${u.lc}${u.wcag ? ` + ${u.wcag}:1` : ""}`, pass: pass(u) ? "yes" : "no" }));
    const list = renderList({ key: "uses", rows, fields: ["use", "need", "pass"], available: ["use", "need", "pass"], command: "palette-axi contrast" }, p.global);
    out["passes"] = `${rows.filter((r) => r.pass === "yes").length}/${rows.length} uses`;
    Object.assign(out, list.out);
  }
  // Gợi ý: cùng hue, chỉ đổi L (và C trong gamut) để đạt chữ nội dung — nền tảng cho lệnh fix (v0.2).
  if (abs < 60 && !fs.achromatic) {
    const s = solveLc(bgc, fs.h, 62, { cMax: Math.max(fs.c, 0.02) });
    const sh = toHex(s.color);
    const ss = swatch(new Color(sh));
    out["suggest"] = `${sh} oklch ${fmtOklch(ss)}: same hue, Lc ${Math.round(apca(new Color(sh), bgc))}, ${round(wcag(new Color(sh), bgc), 2)}:1`;
    help.push(`Run \`palette-axi contrast ${q(sh)} ${q(bs.hex)}\` to confirm the suggested color`);
  }
  if (sizeRaw === undefined) help.push(`Run \`palette-axi contrast ${q(fs.hex)} ${q(bs.hex)} --size 16\` for a verdict at one text size`);
  return { ...out, help };
}
