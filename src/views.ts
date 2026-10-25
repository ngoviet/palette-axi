import type { GlobalFlags } from "./args.js";
import { fail } from "./errors.js";

export type Cell = string | number | boolean;
export type Row = Record<string, Cell>;

export interface ListSpec {
  /** Khoá TOON của bảng, vd "colors", "steps". */
  key: string;
  rows: Row[];
  /** Cột mặc định (gọn). --fields chọn trong `available`. */
  fields: readonly string[];
  available: readonly string[];
  /** Lệnh gợi ý khi bị cắt bớt, vd `palette-axi analyze src`. */
  command: string;
  limit?: number;
}

/**
 * Bảng theo quy ước AXI: cột gọn + giới hạn dòng; bị cắt ⇒ `count: 20 of 57 total` kèm help;
 * rỗng ⇒ `0 <key> found` (không bao giờ in rỗng). --full bỏ giới hạn, --limit đổi số dòng.
 */
export function renderList(spec: ListSpec, flags: GlobalFlags): { out: Record<string, unknown>; help: string[] } {
  const fields = flags.fields?.length ? flags.fields : spec.fields;
  assertFields(fields, spec.available);
  const limit = flags.full ? Infinity : (flags.limit ?? spec.limit ?? 20);
  const shown = spec.rows.slice(0, limit).map((r) => {
    const o: Row = {};
    for (const f of fields) o[f] = r[f] ?? "";
    return o;
  });
  const total = spec.rows.length;
  const out: Record<string, unknown> = {};
  if (shown.length < total) out[`${spec.key}_count`] = `${shown.length} of ${total} total`;
  out[spec.key] = total === 0 ? `0 ${spec.key} found` : shown;
  const help: string[] = [];
  if (shown.length < total) help.push(`Run \`${spec.command} --limit ${total}\` (or --full) to list all ${total}`);
  return { out, help };
}

/**
 * Dựng lại lệnh để gợi ý trong help[]: bỏ --limit/--full cũ (help sẽ tự thêm), bọc nháy đối số có
 * khoảng trắng hoặc ký tự shell (`#` không bọc sẽ thành chú thích).
 */
export function commandLine(prefix: string, args: string[]): string {
  const kept: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--full") continue;
    if (args[i] === "--limit") {
      i++;
      continue;
    }
    const a = args[i]!;
    kept.push(/^[\w./:@,=-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
  }
  return [prefix, ...kept].join(" ");
}

/** Kiểm --fields TRƯỚC khi làm việc nặng. */
export function assertFields(fields: readonly string[] | undefined, available: readonly string[]): void {
  const unknown = (fields ?? []).filter((f) => !available.includes(f));
  if (unknown.length) {
    fail(`unknown field: ${unknown.join(", ")}`, "VALIDATION_ERROR", [`Available fields: ${available.join(", ")}`]);
  }
}

/** Hex để in trong help[]: luôn bọc nháy vì `#` là chú thích của shell. */
export const q = (hex: string): string => `"${hex}"`;
