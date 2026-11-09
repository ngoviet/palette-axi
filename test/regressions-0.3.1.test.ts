import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { field, fixture, run } from "./helpers.js";

// Hồi quy cho báo cáo "Sửa lỗi palette-axi 0.3.1" (09/11/2026, nghiệm thu WCAG 2.2 AA trên giao diện sáng).
// Mỗi test dùng đúng tệp tái hiện của báo cáo (test/fixtures/*.css) và trượt trên v0.3.1.

interface JsonToken {
  hex: string;
  lc: number;
  wcag: number;
}
const contentText = (out: string): string | undefined => out.split("\n").find((l) => l.trim().startsWith("content text,"));
const ratioOf = (s: string): number => Number(/, ([\d.]+):1/.exec(s)![1]);

describe("#1 analyze scores pale text", () => {
  it("--text #8b95a1 (3.04:1, Lc 57) is a 7-contrast issue", () => {
    const out = run(["analyze", fixture("pale-text.css"), "--bg", "#ffffff"]).out;
    expect(out).toContain('#8b95a1,7-contrast,"--text is text: Lc 57, 3.04:1 on bg < Lc 60 + 4.5:1"');
  });

  it("an unnamed muted grey under 3:1 is reported too", () => {
    const out = run(["analyze", "#9aa5b1", "#1d232a", "--bg", "ffffff"]).out;
    expect(out).toMatch(/#9aa5b1,7-contrast,"muted grey 2\.\d\d:1 < 3:1/);
  });
});

describe("#2 generate light meets AA, and check says so", () => {
  for (const seed of ["254", "25", "150", "300"]) {
    it(`seed ${seed}: dim and every accent reach Lc 60 + 4.5:1 in both modes`, () => {
      const j = JSON.parse(run(["generate", "--seed", seed, "--mode", "both", "--format", "json"]).out) as Record<string, Record<string, JsonToken>>;
      for (const mode of ["light", "dark"]) {
        for (const k of ["dim", "fg", "primary", "ok", "warn", "bad", "info", "on-primary"]) {
          expect(j[mode]![k]!.wcag, `${mode} ${k}`).toBeGreaterThanOrEqual(4.5);
          expect(Math.abs(j[mode]![k]!.lc), `${mode} ${k}`).toBeGreaterThanOrEqual(60);
        }
      }
    });
  }

  it("analyze on the generated light CSS counts every accent at ≥ 4.5:1", () => {
    const dir = mkdtempSync(join(tmpdir(), "palette-gen-"));
    const f = join(dir, "g.css");
    writeFileSync(f, run(["generate", "--seed", "254", "--mode", "light", "--format", "css"]).out);
    const out = run(["analyze", f, "--bg", "#f4f7fb"]).out;
    expect(field(out, "contrast")).toMatch(/^accents wcag ≥4\.5 (\d+)\/\1,/);
  });

  it("cockpit light: check passes only because the weak colors are fixed to 4.5:1", () => {
    const j = (JSON.parse(run(["generate", "--preset", "cockpit", "--mode", "light", "--format", "json"]).out) as Record<string, Record<string, JsonToken>>)["light"]!;
    for (const k of ["muted", "ok", "warn", "warn-strong", "accent"]) expect(j[k]!.wcag, k).toBeGreaterThanOrEqual(4.5);
  });

  it("lowering --lc or --wcag prints a warning (TOON and CSS header)", () => {
    expect(field(run(["generate", "--seed", "254", "--lc", "45"]).out, "warning")).toMatch(/^--lc 45 < 60: accents are for icons/);
    expect(run(["generate", "--seed", "254", "--wcag", "3", "--format", "css"]).out).toContain("WARNING: --wcag 3 < 4.5");
  });
});

describe("#3 contrast suggestions pass content text", () => {
  for (const [fg, bg] of [["8fa397", "e7f4ea"], ["0082f3", "f4f7fb"], ["999999", "ffffff"]] as const) {
    it(`${fg} on ${bg}: suggest, then re-check says content text yes`, () => {
      const s = field(run(["contrast", fg, bg]).out, "suggest");
      expect(s, "has a suggestion").toBeDefined();
      expect(ratioOf(s!)).toBeGreaterThanOrEqual(4.5);
      const hex = /^#[0-9a-f]{6}/.exec(s!)![0];
      expect(contentText(run(["contrast", hex, bg]).out)).toContain(",yes");
    });
  }
});

describe("#4 status fills are not neutrals", () => {
  it("--success-bg / --error-bg are not 2-tint issues", () => {
    const out = run(["analyze", fixture("status-fills.css"), "--bg", "#f4f7fb"]).out;
    expect(out).not.toContain(",2-tint,");
  });

  it("a green status pair does not drag the neutral hue to 157", () => {
    const out = run(["analyze", fixture("text-pair.css"), "--bg", "#ffffff"]).out;
    expect(out).not.toContain("vs neutral hue 157");
    expect(out).not.toContain(",2-tint,");
  });
});

describe("#5 generated CSS stays inside sRGB", () => {
  const dir = mkdtempSync(join(tmpdir(), "palette-gamut-"));
  for (const seed of ["254", "25", "150", "300"]) {
    for (const mode of ["light", "dark"]) {
      it(`seed ${seed} ${mode}`, () => {
        const f = join(dir, `${seed}-${mode}.css`);
        writeFileSync(f, run(["generate", "--seed", seed, "--mode", mode, "--format", "css"]).out);
        expect(run(["analyze", f]).out).not.toContain(",7-gamut,");
      });
    }
  }
});

describe("#6 help[] never suggests a grey seed", () => {
  it("white bg: no `--seed \"#ffffff\"`; the neutral hue is used instead", () => {
    for (const f of ["white-surface.css", "white-untinted.css"]) {
      expect(run(["analyze", fixture(f), "--bg", "#ffffff"]).out).not.toContain('--seed \\"#ffffff\\"');
    }
    expect(run(["analyze", fixture("white-untinted.css"), "--bg", "#ffffff"]).out).toContain("generate --seed 252 --mode light");
  });
});

describe("#7 6-meaning reads --ok like --success", () => {
  it("both red tokens fail 6-meaning", () => {
    expect(run(["analyze", fixture("ok-is-red.css"), "--bg", "#ffffff"]).out).toContain("token --ok is hue 30; expected success = green");
    expect(run(["analyze", fixture("success-is-red.css"), "--bg", "#ffffff"]).out).toContain("token --success is hue 30; expected success = green");
  });
});

describe("#8 background inference ignores color:", () => {
  it("three `color: #ffffff` do not beat --bg: #0a1122", () => {
    expect(field(run(["analyze", fixture("dark-white-text.css")]).out, "bg")).toMatch(/^#0a1122 .*dark, inferred/);
  });
});

describe("#9 5-scale and the seed line on generated themes", () => {
  it("--lc 75 dark: no false 5-scale; seed shows the real Lc and why", () => {
    const out = run(["generate", "--seed", "254", "--mode", "dark", "--lc", "75"]).out;
    expect(field(out, "check")).not.toContain("5-scale;");
    expect(field(out, "check")).toMatch(/^7\/7 rules passed/);
    expect(field(out, "seed")).toBe("hue 254 ⇒ hue 254, accents target |Lc| 75 + 4.5:1, got |Lc| 64–71 (some held back by the lightness band)");
  });
});

describe("#10 docs match the code", () => {
  it("help and skill say 8 rules, no stale v0.2 plan", () => {
    const skill = run(["--help"]).out;
    expect(skill).not.toContain("7 rules");
    expect(run(["generate", "--help"]).out).not.toContain("by the 7 rules");
  });
});
