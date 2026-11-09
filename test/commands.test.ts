import { describe, expect, it } from "vitest";
import { field, run } from "./helpers.js";

interface JsonToken {
  hex: string;
  oklch: string;
  lc: number;
  wcag: number;
}
const lOf = (t: JsonToken): number => Number(/oklch\(([\d.]+)/.exec(t.oklch)![1]);

describe("contrast", () => {
  it("gives a verdict per use and a same-hue suggestion that passes content text", () => {
    const { out, code } = run(["contrast", "8ea3c2", "0a1122"]);
    expect(code).toBe(0);
    expect(field(out, "apca")).toBe("Lc -51 (light text on dark)");
    expect(out).toContain('content text,"Lc 60 + 4.5:1",no');
    expect(field(out, "passes")).toBe("3/6 uses");
    const suggest = field(out, "suggest")!;
    expect(suggest).toMatch(/same hue, Lc -6[0-9]/);
    const hex = /^(#[0-9a-f]{6})/.exec(suggest)![1]!;
    expect(field(run(["contrast", hex, "0a1122"]).out, "passes")).toBe("4/6 uses");
  });

  it("--size picks one requirement", () => {
    expect(field(run(["contrast", "e6edf7", "0a1122", "--size", "14"]).out, "verdict")).toMatch(/^pass: body text \(14px\/400\) needs \|Lc\| ≥ 75/);
    expect(field(run(["contrast", "8ea3c2", "0a1122", "--size", "32"]).out, "verdict")).toMatch(/^pass: large text/);
    expect(field(run(["contrast", "8ea3c2", "0a1122", "--size", "12"]).out, "verdict")).toMatch(/^fail: small or thin text/);
  });
});

describe("generate", () => {
  for (const mode of ["dark", "light"] as const) {
    it(`${mode}: accents land on the band at max chroma and the result passes its own rules`, () => {
      const { out, code } = run(["generate", "--seed", "262", "--mode", mode]);
      expect(code).toBe(0);
      expect(field(out, "check")).not.toContain("failed");
      const json = JSON.parse(run(["generate", "--seed", "262", "--mode", mode, "--format", "json"]).out) as Record<string, Record<string, JsonToken>>;
      const t = json[mode]!;
      const [lo, hi] = mode === "dark" ? [0.7, 0.8] : [0.45, 0.7];
      for (const role of ["primary", "ok", "warn", "bad", "info"]) {
        expect(lOf(t[role]!), role).toBeGreaterThanOrEqual(lo - 0.001);
        expect(lOf(t[role]!), role).toBeLessThanOrEqual(hi + 0.001);
        expect(Math.abs(t[role]!.lc), role).toBeGreaterThanOrEqual(45);
      }
      expect(Math.abs(t["dim"]!.lc)).toBeGreaterThanOrEqual(60);
      expect(Math.abs(t["fg"]!.lc)).toBeGreaterThanOrEqual(90);
      if (mode === "dark") {
        expect(lOf(t["bg"]!)).toBeGreaterThanOrEqual(0.13);
        expect(lOf(t["bg"]!)).toBeLessThanOrEqual(0.2);
      }
    });
  }

  it("a hex seed sets the primary hue; custom roles take name=hue", () => {
    const { out } = run(["generate", "--seed", "#22d3ee", "--roles", "primary,ok,brand=310", "--fields", "token,oklch"]);
    expect(out).toContain("accents[3]{token,oklch}:");
    expect(out).toMatch(/primary,0\.\d+ 0\.\d+ 212/);
    expect(out).toMatch(/brand,0\.\d+ 0\.\d+ 310/);
  });

  it("--mode both --format css writes light :root and a dark override", () => {
    const { out } = run(["generate", "--seed", "150", "--mode", "both", "--format", "css"]);
    expect(out).toContain(':root, [data-theme="light"] {');
    expect(out).toContain("@media (prefers-color-scheme: dark)");
    expect(out).toContain('[data-theme="dark"] {');
    expect(out).toMatch(/--bg-gradient: radial-gradient\(/);
    expect(out).not.toContain("help");
  });

  it("--format tailwind writes a v4 @theme block", () => {
    expect(run(["generate", "--seed", "30", "--format", "tailwind"]).out).toMatch(/@theme \{\n {2}--color-bg-edge: oklch\(/);
  });

  it("preset neon-dark fixes the 3 weak lan-topo-card colors and passes every rule", () => {
    const { out } = run(["generate", "--preset", "neon-dark"]);
    expect(out).toContain("fixed[3]{token,from,to,why}:");
    // generate không sinh token chữ-trên-nền ⇒ 8-pairs n/a.
    expect(field(out, "check")).toBe("7/7 rules passed, n/a: 8-pairs");
    const t = (JSON.parse(run(["generate", "--preset", "neon-dark", "--format", "json"]).out) as Record<string, Record<string, JsonToken>>)["dark"]!;
    for (const k of ["info", "bad"]) {
      expect(lOf(t[k]!), k).toBeGreaterThanOrEqual(0.7);
      expect(lOf(t[k]!), k).toBeLessThanOrEqual(0.8);
    }
    expect(Math.abs(t["dim"]!.lc)).toBeGreaterThanOrEqual(60);
    expect(t["ok"]!.hex).toBe("#22c55e"); // màu không có lỗi giữ nguyên
    expect(t["fg"]!.hex).toBe("#e6edf7");
  });

  it("rejects contradictory flags with exit 2", () => {
    expect(run(["generate"]).code).toBe(2);
    expect(run(["generate", "--seed", "1", "--preset", "neon-dark"]).code).toBe(2);
    expect(run(["generate", "--preset", "neon-dark", "--mode", "light"]).code).toBe(2);
    expect(run(["generate", "--seed", "1", "--roles", "chartreuse"]).out).toContain("unknown role: chartreuse");
  });
});

describe("scale", () => {
  it("11 steps: chroma peaks mid-scale, tapers at both ends", () => {
    const { out } = run(["scale", "#3b82f6", "--fields", "step,c"]);
    expect(out).toContain("steps[11]{step,c}:");
    expect(field(out, "check")).toMatch(/✓ tapered$/);
    expect(field(out, "seed")).toMatch(/closest step 500/);
  });

  it("12 steps: step 9 is the seed itself, roles follow Radix", () => {
    const { out } = run(["scale", "#ef4444", "--steps", "12"]);
    expect(out).toContain("9,#ef4444,0.637 0.208 25,solid bg (seed)");
    expect(out).toContain("12,");
    expect(out).toContain("high-contrast text");
    expect(field(run(["scale", "150", "--steps", "12", "--mode", "dark"]).out, "check")).toMatch(/✓ tapered$/);
  });

  it("a grey has no hue: exit 2", () => {
    expect(run(["scale", "#808080"]).code).toBe(2);
  });
});

describe("review 0.2: parsing and help[] polish", () => {
  it("CSS Color 4 `none` reads as 0 instead of failing", () => {
    const { out, code } = run(["contrast", "oklch(0.95 none 30)", "0a1122"]);
    expect(code).toBe(0);
    expect(field(out, "fg")).toMatch(/^#[0-9a-f]{6} oklch 0\.950 0\.000 0$/);
  });

  it("help[] drops --format=… and --limit=… instead of repeating them", () => {
    const scale = run(["scale", "3b82f6", "--format=toon", "--limit=3"]).out;
    expect(scale).toContain("Run `palette-axi scale 3b82f6 --format css`");
    expect(scale).toContain("Run `palette-axi scale 3b82f6 --format=toon --limit 11`");
    expect(scale).not.toContain("--limit=3");
    const gen = run(["generate", "--seed", "262", "--format=toon"]).out;
    expect(gen).toContain("Run `palette-axi generate --seed 262 --format css > tokens.css`");
  });

  it("tailwind --mode both also honours [data-theme] like --format css", () => {
    const out = run(["generate", "--seed", "262", "--mode", "both", "--format", "tailwind"]).out;
    expect(out).toContain(':root:not([data-theme="light"])');
    expect(out).toContain('[data-theme="dark"] {');
  });

  it("truncated issues point at --full", () => {
    const out = run(["analyze", "test/fixtures/fluent-blue-0.2.0.css"]).out;
    expect(field(out, "issues_count")).toMatch(/^20 of \d+ total$/);
    expect(out).toMatch(/--full` to list all \d+ issues/);
  });
});
