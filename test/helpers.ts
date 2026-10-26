import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const root = join(import.meta.dirname, "..");
export const BIN = join(root, "dist", "bin", "palette-axi.js");
export const fixture = (name: string): string => join(import.meta.dirname, "fixtures", name);

/** Chạy đúng file bin đã build (global-setup build trước cả suite): stdout + mã thoát thật. */
export function run(args: string[], cwd = root): { out: string; code: number } {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8" });
  return { out: r.stdout, code: r.status ?? -1 };
}

/** Lấy dòng `key: value` cấp đầu của output TOON (bỏ nháy bao ngoài). */
export function field(out: string, key: string): string | undefined {
  const line = out.split("\n").find((l) => l.startsWith(`${key}: `));
  return line?.slice(key.length + 2).replace(/^"(.*)"$/, "$1");
}
