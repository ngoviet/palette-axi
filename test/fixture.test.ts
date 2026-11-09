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
    // lan-topo-card không có token on-X / X-foreground / X-text ⇒ 8-pairs n/a.
    // 5-scale n/a từ 0.4.0 (chủ repo duyệt 09/11/2026): "thang" trước đây đạt là gộp nhầm trung tính xanh
    // (#0a1122, #142443, #8ea3c2) với màu nhấn xanh dương; findRamps nay chỉ xét màu nhấn / token tên bậc thang.
    expect(field(out, "rules")).toBe("4/6 rules passed, failed: 4-band 7-contrast, n/a: 5-scale 8-pairs");
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

// Quy tắc 8-pairs trên bảng màu thật của Fluent Blue 0.2.0 (test/fixtures/fluent-blue-0.2.0.css).
// Số WCAG đối chiếu bằng chính công thức contrast_ratio của fluent_blue/core/palette.py (08/11/2026):
// FFFFFF trên FAAD14 1.90, 52C41A 2.27, D89614 2.53, 49AA19 2.98, 1677FF 4.10, 0E68EA 5.02, D92D30 4.81.
describe("analyze 8-pairs: Fluent Blue 0.2.0 text tokens on their own fills", () => {
  const FB = fixture("fluent-blue-0.2.0.css");
  const { out, code } = run(["analyze", FB, "--bg", "#f5f5f5", "--full"]);
  const pairLines = out.split("\n").filter((l) => l.includes(",8-pairs,"));

  it("pairs 40 tokens by name, 17 below Lc 60 + 4.5:1, exit 0 without --strict", () => {
    expect(code).toBe(0);
    expect(field(out, "pairs")).toBe("40 text/fill pairs by token name, 17 below Lc 60 + 4.5:1");
    expect(pairLines).toHaveLength(17);
    expect(field(out, "rules")).toMatch(/failed: .*8-pairs/);
  });

  it("finds the white labels their own test missed (on-success, on-warning), in both themes", () => {
    expect(out).toContain("--on-warning on --warning #faad14: Lc -40, 1.90:1 < Lc 60 + 4.5:1 (");
    expect(out).toContain("fluent-blue-0.2.0.css:31)");
    expect(out).toContain("--on-success on --success #52c41a: Lc -49, 2.27:1 < Lc 60 + 4.5:1 (");
    expect(out).toContain("--on-warning on --warning #d89614: Lc -54, 2.53:1");
    expect(out).toContain("--on-success on --success #49aa19: Lc -61, 2.98:1");
    expect(out).toContain("--on-info on --info #1677ff: Lc -73, 4.10:1");
  });

  it("does not report pairs that pass (on-primary, on-error light)", () => {
    expect(out).not.toContain("--on-primary on --primary #0e68ea");
    expect(out).not.toContain("--on-error on --error #d92d30");
  });

  it("keeps the light and dark blocks apart: light labels never meet dark fills", () => {
    const light = pairLines.filter((l) => /fluent-blue-0\.2\.0\.css:(2[0-9]|3[0-9]|4[0-9])\)/.test(l));
    expect(light.length).toBeGreaterThan(0);
    for (const dark of ["#49aa19", "#d89614", "#1554ad", "#2b2111"]) {
      for (const l of light) expect(l).not.toContain(dark);
    }
  });

  it("labels (on-X) are not scored as status hues by 6-meaning", () => {
    expect(out).not.toContain(",6-meaning,token --on-");
  });

  it("help names the contrast command for the first failing pair", () => {
    expect(out).toContain('Run `palette-axi contrast \\"#ffffff\\" \\"#52c41a\\"` to fix --on-success on --success');
  });
});

describe("analyze 8-pairs: naming conventions", () => {
  const { out } = run(["analyze", fixture("pairs-conventions.css"), "--full"]);

  it("pairs shadcn foreground/background, X-foreground/X, Material on-X-container, with :root fallback", () => {
    expect(field(out, "pairs")).toBe("7 text/fill pairs by token name, 3 below Lc 60 + 4.5:1");
    expect(out).toContain("--destructive-foreground on --destructive #ef4444: Lc -69, 3.76:1");
    // khối .dark chỉ đè chữ ⇒ nền lấy định nghĩa duy nhất ở :root
    expect(out).toMatch(/--destructive-foreground on --destructive #ef4444: Lc -66, 3\.60:1 < Lc 60 \+ 4\.5:1 \([^)]*pairs-conventions\.css:18\)/);
    expect(out).toContain("--md-on-tertiary on --md-tertiary #ffd600: Lc -22, 1.41:1");
  });

  it("does not pair X-text with X (primary-text is colored text on the surface)", () => {
    expect(out).not.toContain("--primary-text on");
  });

  it("colors given as arguments have no names: 8-pairs n/a", () => {
    expect(field(run(["analyze", "#ffffff", "#ffd600"]).out, "rules")).toMatch(/n\/a: .*8-pairs/);
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
