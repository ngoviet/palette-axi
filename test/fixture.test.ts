import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { field, fixture, run } from "./helpers.js";

// Số đo đối chiếu: script tự viết theo OKLab của Ottosson + APCA-W3 0.0.98G (phiên nghiên cứu
// lan-topo-card, 26/10/2026). Bộ màu: test/fixtures/lan-topo-card.css (chép từ dist 0.6.1).
const CSS = fixture("lan-topo-card.css");

describe("analyze: lan-topo-card palette matches the reference measurements", () => {
  const { out, code } = run(["analyze", CSS, "--bg", "#0a1122", "--full", "--fields", "hex,kind,l,c,h,wcag,lc"]);

  it("exits 0 without --strict", () => expect(code).toBe(0));

  it("finds 23 colors: 5 neutrals, 2 muted greys, 16 accents", () => {
    expect(field(out, "colors")).toBe("23 (5 neutral, 2 muted, 16 accent)");
  });

  it("5 neutrals share hue 257–266 at C ≤ 0.062", () => {
    expect(field(out, "neutrals")).toBe("5, hue 257–266, C ≤0.062, tinted ✓");
    const rows = out.split("\n").filter((l) => l.includes(",neutral,"));
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      const [, , , c, h] = r.trim().split(",");
      expect(Number(c)).toBeLessThanOrEqual(0.062);
      expect(Number(h)).toBeGreaterThanOrEqual(257);
      expect(Number(h)).toBeLessThanOrEqual(266);
    }
  });

  it("12 of 16 accents sit in L 0.70–0.80", () => {
    expect(field(out, "accents")).toMatch(/^12\/16 in L 0\.70–0\.80/);
  });

  it("#3b82f6: L 0.623, 5.12:1, Lc -37", () => {
    expect(out).toContain("#3b82f6,accent,0.623,0.188,260,5.12,-37");
  });

  it("#8ea3c2: Lc -51; #e6edf7: 15.97:1, Lc -95", () => {
    expect(out).toContain("#8ea3c2,neutral,0.71,0.051,258,7.32,-51");
    expect(out).toContain("#e6edf7,neutral,0.944,0.015,257,15.97,-95");
  });

  it("reports exactly the 3 weak colors, numbered by rule", () => {
    expect(out).toContain("issues[3]{hex,rule,detail}:");
    expect(out).toContain("#3b82f6,4-band,L 0.62 < 0.70; Lc -37");
    expect(out).toContain("#ef4444,4-band,L 0.64 < 0.70; Lc -37");
    expect(out).toContain('#8ea3c2,7-contrast,"Lc -51 < 60 for content text; 7.32:1"');
    expect(field(out, "rules")).toBe("5/7 rules passed, failed: 4-band 7-contrast");
  });

  it("infers the same background without --bg", () => {
    const r = run(["analyze", CSS]);
    expect(field(r.out, "bg")).toMatch(/^#0a1122 .*inferred/);
  });

  it("--strict exits 1 with ISSUES_FOUND and lists the issues", () => {
    const r = run(["analyze", CSS, "--strict"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("code: ISSUES_FOUND");
    expect(r.out).toContain("#8ea3c2 7-contrast");
  });

  it("contrast agrees: #e6edf7 on #0a1122 is 15.97:1, Lc -95", () => {
    const r = run(["contrast", "#e6edf7", "#0a1122"]);
    expect(field(r.out, "wcag")).toBe("15.97:1 (AAA)");
    expect(field(r.out, "apca")).toBe("Lc -95 (light text on dark)");
  });
});

// Chạy cả trên bundle thật khi máy có repo lan-topo-card (CI không có ⇒ bỏ qua).
const DIST = "D:/code/lan-topo-card/dist/lan-topo-card.js";
describe.skipIf(!existsSync(DIST))("analyze: the real lan-topo-card bundle", () => {
  it("measures the same three colors inside the 104 KB bundle", () => {
    const { out, code } = run(["analyze", DIST, "--full", "--fields", "hex,wcag,lc"]);
    expect(code).toBe(0);
    expect(field(out, "bg")).toMatch(/^#0a1122/);
    expect(out).toContain("#3b82f6,5.12,-37");
    expect(out).toContain("#8ea3c2,7.32,-51");
    expect(out).toContain("#e6edf7,15.97,-95");
  });
});
