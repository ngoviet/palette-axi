import { parseArgs } from "node:util";
import { fail } from "./errors.js";

export interface FlagSpec {
  type: "string" | "boolean";
  hint: string;
}

/** Flag toàn cục — mọi lệnh đều nhận. */
export const GLOBAL_FLAGS = {
  fields: { type: "string", hint: "--fields a,b" },
  full: { type: "boolean", hint: "--full" },
  limit: { type: "string", hint: "--limit <n>" },
  help: { type: "boolean", hint: "--help" },
} as const satisfies Record<string, FlagSpec>;

export interface GlobalFlags {
  fields?: string[];
  full: boolean;
  limit?: number;
}

export interface ParsedArgs {
  positionals: string[];
  global: GlobalFlags;
  str: (k: string) => string | undefined;
  bool: (k: string) => boolean;
}

/**
 * Flag lạ / thiếu giá trị / thừa đối số ⇒ VALIDATION_ERROR (exit 2) kèm danh sách flag hợp lệ.
 * `min` thiếu ⇒ cũng exit 2 kèm usage của lệnh.
 */
export function parseCommandArgs(
  command: string,
  args: string[],
  extra: Record<string, FlagSpec> = {},
  positionals: { min?: number; max?: number; usage?: string } = {},
): ParsedArgs {
  const specs: Record<string, FlagSpec> = { ...GLOBAL_FLAGS, ...extra };
  const valid = Object.values(specs).map((s) => s.hint);
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args,
      options: Object.fromEntries(Object.entries(specs).map(([k, s]) => [k, { type: s.type }])),
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    fail(`${command}: ${(e as Error).message.split("\n")[0]}`, "VALIDATION_ERROR", [`Valid flags: ${valid.join(", ")}`]);
  }
  const usageHelp = [`Run \`palette-axi ${command} --help\` for usage`];
  const { min = 0, max = min } = positionals;
  if (parsed.positionals.length < min) {
    fail(`${command}: missing argument${positionals.usage ? ` (${positionals.usage})` : ""}`, "VALIDATION_ERROR", [
      "Quote hex colors: the shell drops an unquoted #rrggbb as a comment (or write rrggbb)",
      ...usageHelp,
    ]);
  }
  if (parsed.positionals.length > max) {
    fail(`${command}: unexpected argument ${parsed.positionals[max]}`, "VALIDATION_ERROR", usageHelp);
  }
  const v = parsed.values as Record<string, string | boolean | undefined>;
  const str = (k: string): string | undefined => (typeof v[k] === "string" ? (v[k] as string) : undefined);
  const fields = str("fields");
  const limitRaw = str("limit");
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limitRaw !== undefined && (!Number.isInteger(limit) || limit! < 1)) {
    fail(`${command}: --limit must be a positive integer`, "VALIDATION_ERROR");
  }
  return {
    positionals: parsed.positionals,
    str,
    bool: (k) => v[k] === true,
    global: {
      ...(fields ? { fields: fields.split(",").map((f) => f.trim()).filter(Boolean) } : {}),
      full: v["full"] === true,
      ...(limit !== undefined ? { limit } : {}),
    },
  };
}

/** Số thực trong [min, max] từ flag, hoặc giá trị mặc định. */
export function numFlag(p: ParsedArgs, name: string, def: number, min: number, max: number): number {
  const raw = p.str(name);
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) fail(`--${name} must be a number from ${min} to ${max}`, "VALIDATION_ERROR");
  return n;
}

/** Một giá trị trong danh sách cho phép; sai ⇒ exit 2 kèm danh sách. */
export function choiceFlag<T extends string>(p: ParsedArgs, name: string, choices: readonly T[], def: T): T {
  const raw = p.str(name);
  if (raw === undefined) return def;
  if (!choices.includes(raw as T)) fail(`--${name} must be one of: ${choices.join(", ")}`, "VALIDATION_ERROR");
  return raw as T;
}
