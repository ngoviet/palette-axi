import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderSkill } from "../src/skill.js";

// npm run skill:build ⇒ ghi skill/SKILL.md; npm run skill:check ⇒ exit 1 nếu file lệch với mã.
const path = join(process.cwd(), "skill", "SKILL.md"); // npm chạy script ở gốc repo
const want = renderSkill();
if (process.argv.includes("--check")) {
  let have = "";
  try {
    have = readFileSync(path, "utf8");
  } catch {
    // thiếu file = lệch
  }
  if (have !== want) {
    console.error("skill/SKILL.md is out of date: run `npm run skill:build`");
    process.exit(1);
  }
  console.log("skill/SKILL.md up to date");
} else {
  writeFileSync(path, want);
  console.log("wrote skill/SKILL.md");
}
