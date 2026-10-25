import { runAxiCli, type AxiCliCommand } from "axi-sdk-js";
import { homeHeader, homeView } from "./commands/home.js";
import { COMMANDS, DESCRIPTION, topLevelHelp } from "./registry.js";
import { VERSION } from "./version.js";

export interface MainOptions {
  argv?: string[];
  stdout?: { write: (chunk: string) => unknown };
  cwd?: string;
}

/** Lệnh luôn trả `help: [...]`; mảng rỗng thì bỏ hẳn (TOON in "help: []" là token thừa). */
function dropEmptyHelp(out: Record<string, unknown> | string): Record<string, unknown> | string {
  if (typeof out !== "string" && Array.isArray(out["help"]) && out["help"].length === 0) {
    const { help: _help, ...rest } = out;
    void _help;
    return rest;
  }
  return out;
}

export async function main(options: MainOptions = {}): Promise<void> {
  const commands: Record<string, AxiCliCommand<undefined>> = {
    home: async (args) => ({ ...homeHeader(DESCRIPTION), ...(await homeView(args, options.cwd)) }),
  };
  for (const [name, spec] of Object.entries(COMMANDS)) {
    if (spec.run) commands[name] = async (args) => dropEmptyHelp(await spec.run!(args));
  }
  await runAxiCli({
    description: DESCRIPTION,
    version: VERSION,
    ...(options.argv ? { argv: options.argv } : {}),
    ...(options.stdout ? { stdout: options.stdout } : {}),
    topLevelHelp: topLevelHelp(),
    getCommandHelp: (command) => COMMANDS[command]?.help,
    home: async () => ({ ...homeHeader(DESCRIPTION), ...(await homeView([], options.cwd)) }),
    commands,
  });
}
