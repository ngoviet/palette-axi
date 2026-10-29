import { ANALYZE_HELP, analyzeCommand } from "./commands/analyze.js";
import { CONTRAST_HELP, contrastCommand } from "./commands/contrast.js";
import { GENERATE_HELP, generateCommand } from "./commands/generate.js";
import { HOME_HELP } from "./commands/home.js";
import { SCALE_HELP, scaleCommand } from "./commands/scale.js";

export const DESCRIPTION =
  "Audit and generate UI color palettes in OKLCH: tinted neutrals, accents on one lightness band, APCA + WCAG contrast, sRGB gamut";

export interface CommandSpec {
  /** Dạng gọi ngắn cho bảng lệnh. */
  usage: string;
  summary: string;
  help: string;
  /** home được cli.ts xử lý riêng (cần header). */
  run?: (args: string[]) => Promise<Record<string, unknown> | string>;
}

/** NGUỒN DUY NHẤT cho --help, dispatch và skill/SKILL.md (npm run skill:build). */
export const COMMANDS: Record<string, CommandSpec> = {
  home: { usage: "home", summary: "quick palette check of the current directory + next commands (same as no arguments)", help: HOME_HELP },
  analyze: { usage: "analyze <file|dir|color…> [--bg c] [--strict]", summary: "collect colors from CSS/JS/HTML, measure OKLCH + APCA + WCAG vs the background, list issues per rule", help: ANALYZE_HELP, run: analyzeCommand },
  contrast: { usage: "contrast <fg> <bg> [--size px] [--weight n]", summary: "WCAG ratio, APCA Lc, pass/fail per use, nearest same-hue color that passes", help: CONTRAST_HELP, run: contrastCommand },
  generate: { usage: "generate --seed <hue|color> [--mode dark|light|both] [--roles a,b] [--preset neon-dark|cockpit] [--format toon|css|tailwind|json]", summary: "build a theme by the 7 rules (tinted neutrals, accents at equal contrast), re-scored by analyze", help: GENERATE_HELP, run: generateCommand },
  scale: { usage: "scale <color|hue> [--steps 11|12] [--mode light|dark] [--bg c] [--format toon|css]", summary: "one hue as a Tailwind 50–950 or Radix 1–12 ramp, chroma tapered at both ends, role per step", help: SCALE_HELP, run: scaleCommand },
};

export function topLevelHelp(): string {
  const cmds = Object.values(COMMANDS);
  return `usage: palette-axi <command> [args] [flags]
description: ${DESCRIPTION}
commands[${cmds.length}]:
${cmds.map((c) => `  ${c.usage}: ${c.summary}`).join("\n")}
flags[4]:
  --fields a,b: only these output columns
  --limit <n>: rows to show
  --full: no row limit
  --help: help for a command
notes[3]:
  Quote hex colors ("#3b82f6") or drop the # (3b82f6): an unquoted #… is a shell comment
  Lc is APCA (signed: negative = light text on dark); WCAG 2 ratio is always reported next to it
  Exit 0 ok, 1 failed (analyze --strict with issues: ISSUES_FOUND), 2 bad usage
help[2]:
  Run \`palette-axi\` with no arguments to check the current directory
  Run \`palette-axi <command> --help\` for command details
`;
}
