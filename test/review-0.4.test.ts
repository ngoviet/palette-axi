import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { field, fixture, run } from "./helpers.js";

// 0.4.0: các lỗi bài đánh giá "palette-axi cho Apollo Vận hành" (09/11/2026) chỉ ra trên 0.3.1, tái hiện
// trên test/fixtures/apollo-like.css. Mỗi test trượt trên 0.3.1 và đạt từ 0.4.0.

const APOLLO = fixture("apollo-like.css");
const tmp = mkdtempSync(join(tmpdir(), "palette-apollo-"));
/** Bản sao apollo-like.css với một token đổi màu (ca "cố tình làm hỏng"). */
function broken(token: string, hex: string): string {
  const f = join(tmp, `${token}.css`);
  writeFileSync(f, readFileSync(APOLLO, "utf8").replace(new RegExp(`(--${token}: )#[0-9a-f]{6}`), `$1${hex}`));
  return f;
}
function css(name: string, body: string): string {
  const f = join(tmp, name);
  writeFileSync(f, body);
  return f;
}
interface JsonToken {
  hex: string;
  lc: number;
  wcag: number;
}

describe("analyze on a light status-colored palette (apollo-like)", () => {
  const { out, code } = run(["analyze", APOLLO, "--full"]);

  it("infers the page background from --paper, not a status fill", () => {
    expect(field(out, "bg")).toMatch(/^#ffffff .*inferred/);
  });

  it("no false 2-tint: status fills, pure white and a faintly tinted #f4f6f8 are fine", () => {
    expect(out).not.toContain(",2-tint,");
    expect(field(out, "rules")).toBe("7/7 rules passed, n/a: 5-scale");
    expect(code).toBe(0);
    expect(run(["analyze", APOLLO, "--strict"]).code).toBe(0);
  });

  it("pairs X-ink on X-bg (ok, error, info)", () => {
    expect(field(out, "pairs")).toBe("3 text/fill pairs by token name, 0 below Lc 60 + 4.5:1");
  });
});

describe("faded text is caught (3 cases 0.3.1 missed)", () => {
  const cases: Array<[string, string, string]> = [
    ["ink", "#8b95a1", "--ink is text: Lc 57, 3.04:1 on bg < Lc 60 + 4.5:1"],
    ["muted", "#9aa5b1", "--muted is text: Lc 49, 2.50:1 on bg < Lc 60 + 4.5:1"],
    ["ok-ink", "#8fa397", "--ok-ink on --ok-bg #e3f5ea: Lc 43, 2.36:1 < Lc 60 + 4.5:1"],
  ];
  for (const [token, hex, detail] of cases) {
    it(`--${token}: ${hex}`, () => {
      const r = run(["analyze", broken(token, hex), "--strict"]);
      expect(r.code).toBe(1);
      expect(r.out).toContain(detail);
    });
  }

  it("a text token with no fill of its own is scored on the page background", () => {
    const out = run(["analyze", css("lone.css", ":root { --white: #ffffff; --ink: #8b95a1; }")]).out;
    expect(out).toContain('#8b95a1,7-contrast,"--ink is text: Lc 57, 3.04:1 on bg < Lc 60 + 4.5:1"');
  });

  it("a focus ring below 3:1 fails WCAG 1.4.11; a decorative border is not scored", () => {
    const out = run(["analyze", css("ring.css", ":root { --bg: #ffffff; --focus-ring: #a0aec0; --border: #e5e7eb; }")]).out;
    expect(out).toMatch(/#a0aec0,7-contrast,"--focus-ring is a focus ring or input border: 2\.\d\d:1 < 3:1 \(WCAG 1\.4\.11\)"/);
    expect(out).not.toContain("#e5e7eb,7-contrast");
  });

  it("shadcn --muted is a fill (muted-foreground sits on it), not text", () => {
    const out = run(["analyze", css("shadcn.css", ":root { --background: #ffffff; --muted: #f4f4f5; --muted-foreground: #71717a; }"), "--full"]).out;
    expect(out).not.toContain("#f4f4f5,7-contrast");
    expect(out).not.toContain("--muted on");
    expect(field(out, "pairs")).toMatch(/^1 text\/fill pairs/);
  });
});

describe("--pair, --ignore, 6-meaning ok", () => {
  it("--pair scores an explicit pair by token names or colors", () => {
    const out = run(["analyze", APOLLO, "--pair", "line:wash,ffffff:c81e1e"]).out;
    expect(field(out, "pairs")).toMatch(/^5 text\/fill pairs by token name, 1 below/);
    expect(out).toContain("--line on --wash #f4f6f8: Lc 59, 3.38:1 < Lc 60 + 4.5:1");
  });

  it("--pair with an unknown token or a malformed pair is exit 2", () => {
    expect(run(["analyze", APOLLO, "--pair", "nope:paper"]).code).toBe(2);
    expect(run(["analyze", APOLLO, "--pair", "ink"]).code).toBe(2);
  });

  it("--ignore drops a rule from issues and --strict", () => {
    const f = broken("ok-ink", "#8fa397");
    const r = run(["analyze", f, "--ignore", "8-pairs", "--strict"]);
    expect(r.code).toBe(0);
    expect(field(r.out, "rules")).toBe("6/6 rules passed, n/a: 5-scale, ignored: 8-pairs");
    expect(run(["analyze", APOLLO, "--ignore", "9-nope"]).code).toBe(2);
  });

  it("a token named ok must be green (generate itself names its success color ok)", () => {
    const out = run(["analyze", css("ok.css", ":root { --bg: #ffffff; --ok: #c81e1e; }")]).out;
    expect(out).toContain("token --ok is hue 28; expected success = green");
  });
});

describe("5-scale only looks at real ramps", () => {
  const ramp = (cs: number[]): string[] => [0.45, 0.55, 0.65, 0.75, 0.88].map((l, i) => `oklch(${l} ${cs[i]} 260)`);

  it("flags a ramp whose chroma peaks at the dark end", () => {
    const out = run(["analyze", ...ramp([0.2, 0.17, 0.14, 0.11, 0.09]), "--bg", "ffffff"]).out;
    expect(out).toContain('#0049c1,5-scale,"ramp hue 260: chroma peaks at the dark end');
  });

  it("passes a tapered ramp", () => {
    expect(field(run(["analyze", ...ramp([0.12, 0.17, 0.2, 0.15, 0.09]), "--bg", "ffffff"]).out, "rules")).not.toContain("5-scale");
  });

  it("generate --lc 75 no longer reports a ramp made of neutrals + primary", () => {
    const out = run(["generate", "--seed", "254", "--mode", "both", "--lc", "75"]).out;
    expect(out.match(/check: "7\/7 rules passed, n\/a: 5-scale"/g)).toHaveLength(2);
  });
});

describe("contrast and generate meet WCAG AA as well as APCA", () => {
  it("the contrast suggestion reaches Lc 60 and 4.5:1", () => {
    const s = field(run(["contrast", "8fa397", "e3f5ea"]).out, "suggest")!;
    const ratio = Number(/, ([\d.]+):1/.exec(s)![1]);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(s).toMatch(/same hue, Lc 6\d/);
  });

  it("a grey that passes APCA but not WCAG also gets a suggestion", () => {
    const out = run(["contrast", "8b95a1", "ffffff"]).out;
    expect(field(out, "suggest")).toMatch(/:1$/);
    const ratio = Number(/, ([\d.]+):1/.exec(field(out, "suggest")!)![1]);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("generate light: dim, fg and every accent reach 4.5:1; on-primary reaches 4.5:1 on primary", () => {
    const j = (JSON.parse(run(["generate", "--seed", "254", "--mode", "light", "--format", "json"]).out) as Record<string, Record<string, JsonToken>>)["light"]!;
    for (const k of ["dim", "fg", "primary", "ok", "warn", "bad", "info", "on-primary"]) {
      expect(j[k]!.wcag, k).toBeGreaterThanOrEqual(4.5);
      expect(Math.abs(j[k]!.lc), k).toBeGreaterThanOrEqual(60);
    }
  });

  it("generate dark: dim is solved on the brighter surface, so it passes on bg and surface", () => {
    const out = run(["generate", "--seed", "254", "--mode", "dark"]).out;
    expect(field(out, "check")).toBe("7/7 rules passed, n/a: 5-scale");
  });

  it("--wcag 0 goes back to APCA only (lighter accents on a light bg)", () => {
    const j = (JSON.parse(run(["generate", "--seed", "254", "--mode", "light", "--wcag", "0", "--format", "json"]).out) as Record<string, Record<string, JsonToken>>)["light"]!;
    expect(j["primary"]!.wcag).toBeLessThan(4.5);
    expect(run(["generate", "--preset", "cockpit", "--wcag", "3"]).code).toBe(2);
  });
});

describe("review of 0.4.0: --ignore, seed note, warnings", () => {
  it("--ignore 4-band still scores the accent's contrast (#3b82f6 Lc −37 on #0a1122 < 45)", () => {
    const r = run(["analyze", "#3b82f6", "--bg", "#0a1122", "--ignore", "4-band", "--strict"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("#3b82f6 7-contrast: Lc -37");
  });

  it("dark --lc 45: accents above target sit on the band floor, not raised by WCAG", () => {
    const seed = field(run(["generate", "--seed", "254", "--lc", "45"]).out, "seed")!;
    expect(seed).toContain("kept above target by the lightness band");
    expect(seed).not.toContain("raised to reach");
  });

  it("light: accents above Lc 60 were raised by the 4.5:1 floor", () => {
    expect(field(run(["generate", "--seed", "254", "--mode", "light"]).out, "seed")).toContain("(some raised to reach 4.5:1)");
  });

  it("lowering both --lc and --wcag warns about each", () => {
    const w = field(run(["generate", "--seed", "254", "--lc", "45", "--wcag", "3"]).out, "warning")!;
    expect(w).toContain("--lc 45 < 60");
    expect(w).toContain("--wcag 3 < 4.5");
  });
});
