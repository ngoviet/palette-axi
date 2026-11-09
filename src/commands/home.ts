import { homedir } from "node:os";
import { parseCommandArgs } from "../args.js";
import { extract } from "../extract.js";
import { PRESETS } from "../presets.js";
import { analyzePalette, rulesLine } from "../rules.js";

export const HOME_HELP = `usage: palette-axi home
description: Quick palette check of the current directory (first 400 style/script files, same rules as analyze) plus the commands to go further. Same as running with no arguments
`;

export function homeHeader(description: string): Record<string, unknown> {
  const bin = process.argv[1] ?? "";
  const home = homedir();
  return { bin: bin.startsWith(home) ? `~${bin.slice(home.length)}` : bin, description };
}

export async function homeView(args: string[], cwd = process.cwd()): Promise<Record<string, unknown>> {
  parseCommandArgs("home", args);
  const ex = extract([cwd], { maxFiles: 400, cwd });
  const a = analyzePalette(ex.colors, undefined, ex.tokens);
  const out: Record<string, unknown> = {};
  if (!a.items.length) {
    out["here"] = `0 colors found in ${ex.files} files under ${cwd}`;
  } else {
    out["here"] = `${a.items.length} colors in ${ex.files} files, bg ${a.bg.hex} (${a.mode}, inferred)`;
    out["rules"] = rulesLine(a.rules);
    out["issues"] = a.issues.length ? `${a.issues.length} (${[...new Set(a.issues.map((i) => i.rule))].join(", ")})` : "0 issues found";
  }
  out["presets"] = Object.keys(PRESETS).join(", ");
  out["help"] = [
    a.items.length ? "Run `palette-axi analyze . --bg \"<your bg>\"` for every issue and color" : "Run `palette-axi analyze <file|dir>` on a stylesheet or a built bundle",
    "Run `palette-axi generate --seed <hue|color> --mode dark` to build a theme by the palette rules",
    "Run `palette-axi contrast \"<fg>\" \"<bg>\"` for APCA + WCAG of one pair",
    "Run `palette-axi --help` for every command",
  ];
  return out;
}
