import { defineConfig } from "tsup";

// Script dev — build vào build/ (gitignore), KHÔNG vào dist/ (gói publish).
export default defineConfig({
  entry: { skill: "scripts/skill.ts" },
  outDir: "build/scripts",
  format: ["esm"],
  platform: "node",
  target: "node20",
  clean: true,
  silent: true,
});
