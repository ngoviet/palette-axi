import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "../src/registry.js";
import { renderSkill } from "../src/skill.js";
import { VERSION } from "../src/version.js";
import { field, root, run } from "./helpers.js";

describe("contract", () => {
  it("version matches package.json and the fast path answers", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string; scripts?: Record<string, string> };
    expect(VERSION).toBe(pkg.version);
    expect(run(["--version"]).out.trim()).toBe(VERSION);
    const pack = pkg.scripts?.["install:global"] ?? "";
    expect(pack).toContain(`palette-axi-${VERSION}.tgz`);
  });

  it("skill/SKILL.md is generated from the registry", () => {
    expect(readFileSync(join(root, "skill", "SKILL.md"), "utf8")).toBe(renderSkill());
  });

  it("every command has its own --help", () => {
    for (const name of Object.keys(COMMANDS)) {
      const { out, code } = run([name, "--help"]);
      expect(code, name).toBe(0);
      expect(out, name).toContain(`usage: palette-axi ${name}`);
    }
  });

  it("unknown flags fail loud with exit 2 and the valid flags", () => {
    const { out, code } = run(["contrast", "fff", "000", "--bogus"]);
    expect(code).toBe(2);
    expect(out).toContain("code: VALIDATION_ERROR");
    expect(out).toContain("--size <px>");
  });

  it("a missing color (dropped #… comment) is exit 2 with a quoting hint", () => {
    const { out, code } = run(["contrast", "fff"]);
    expect(code).toBe(2);
    expect(out).toContain("Quote hex colors");
  });

  it("unknown --fields is exit 2 with the available fields", () => {
    const { out, code } = run(["analyze", "#3b82f6", "--fields", "nope"]);
    expect(code).toBe(2);
    expect(out).toContain("Available fields: hex, kind");
  });

  it("a missing path is NOT_FOUND, exit 1", () => {
    const { out, code } = run(["analyze", "no-such-file.css"]);
    expect(code).toBe(1);
    expect(out).toContain("code: NOT_FOUND");
  });

  it("no arguments shows content (a check of the current directory), not help", () => {
    const dir = mkdtempSync(join(tmpdir(), "palette-home-"));
    writeFileSync(join(dir, "a.css"), ":root{--bg:#0a1122;--fg:#e6edf7;--ok:#22c55e}");
    const { out, code } = run([], dir);
    expect(code).toBe(0);
    expect(out).toContain("bin: ");
    expect(field(out, "here")).toMatch(/^3 colors in 1 files, bg #0a1122/);
    expect(out).toContain("help[");
  });

  it("no arguments succeeds in directories with JS/TS code without crashing on non-numeric color calls", () => {
    const { out, code } = run([], root);
    expect(code).toBe(0);
    expect(out).toContain("bin: ");
    expect(out).toContain("rules: ");
  });

  it("an empty directory says so", () => {
    const dir = mkdtempSync(join(tmpdir(), "palette-empty-"));
    expect(field(run([], dir).out, "here")).toMatch(/^0 colors found in 0 files/);
    expect(field(run(["analyze", dir]).out, "colors")).toBe("0 colors found");
  });
});

describe("analyze: extraction", () => {
  const dir = mkdtempSync(join(tmpdir(), "palette-ex-"));
  writeFileSync(
    join(dir, "theme.css"),
    `/* old: #ff00ff */
:root {
  --bg: #0a1122;
  --text: rgb(230 237 247);
  --overlay: rgba(255, 255, 255, 0.1);
  --success: oklch(0.72 0.19 150);
  --danger: #3b82f6;
  --wide: oklch(0.7 0.35 150);
}
`,
  );
  writeFileSync(join(dir, "app.js"), `const s = "&#x110;ây"; const c = q.poor ? x : "#94a3b8"; export const NO_LINK = "#ef4444";\n`);
  const { out } = run(["analyze", ".", "--bg", "0a1122", "--fields", "hex,name,where"], dir);

  it("skips comments, counts translucent overlays apart, ignores HTML entities", () => {
    expect(out).not.toContain("#ff00ff");
    expect(out).not.toContain("#000110");
    expect(field(out, "colors")).toMatch(/, 1 translucent skipped$/);
  });

  it("records token names and where each color is defined, never a ternary branch", () => {
    expect(out).toContain('#ef4444,NO_LINK,"app.js:1"');
    expect(out).toContain('#94a3b8,"","app.js:1"');
    expect(out).toContain('#e6edf7,"--text","theme.css:4"');
  });

  it("flags a semantic name on the wrong hue (rule 6) and out-of-gamut colors (rule 7)", () => {
    expect(out).toContain("token --danger is hue 260; expected error = red");
    expect(out).toMatch(/7-gamut,oklch\(0\.7 0\.35 150\) is outside sRGB; clamped to #/);
  });

  it("accepts colors as arguments, with or without #", () => {
    const r = run(["analyze", "3b82f6", "#ef4444", "oklch(0.75 0.15 150)", "--bg", "#0a1122"]);
    expect(field(r.out, "colors")).toBe("3 (3 accent)");
  });
});
