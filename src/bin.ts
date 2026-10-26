#!/usr/bin/env node
// Fast path: `-v`/`--version` trả lời ngay, không nạp cli.ts (SDK, Color.js, lệnh…).
import { tryFastPath } from "axi-sdk-js/fast-path";
import { VERSION } from "./version.js";

if (!tryFastPath(process.argv.slice(2), { version: VERSION })) {
  const { main } = await import("./cli.js");
  await main();
}
