import type { Mode } from "./rules.js";

// Preset = bảng màu có sẵn, chép từ một theme thật rồi sửa chỗ yếu đã đo.
// neon-dark: theme Neon của lan-topo-card (theo doanlong1412/snmp-topo-lan-card), màu nhấn là
// bảng mặc định Tailwind v3. Đo 26/10/2026: 12/16 màu nhấn trong L 0.70–0.80; blue-500 (L 0.62)
// và red-500 (L 0.64) dưới dải, chữ phụ #8ea3c2 chỉ Lc −51 ⇒ ba màu này được sửa khi xuất.
// cockpit: src/styles/base.css của jlcodes99/cockpit-tools (Tailwind slate/blue + nền giấy ấm).
// Đo 29/10/2026: sáng — nền #f6f5f2 và #ffffff C < 0.005 (xám thuần), success/warning/warning-strong
// L 0.70–0.77 trên dải (Lc 36–47), text-muted Lc 44; tối — nền L 0.208 > 0.20, primary/hover/danger
// dưới dải (hover còn tối hơn primary, Lc −26), text-secondary Lc −51, text-muted Lc −28.

/**
 * band: vào dải sáng (tối: L = `to` ?? 0.72, giữ hue; sáng: |Lc| `to` ?? 60 trong dải);
 * text: giữ hue + C, đổi L tới |Lc| `to` ?? 62; tint: C 0.007 giữ L (≤ 0.99), hue gốc hoặc `to`
 * khi gốc là xám thuần; bg: kéo L nền vào khoảng của nguyên tắc 3.
 */
export type Fix = "band" | "text" | "tint" | "bg";

export interface PresetToken {
  token: string;
  hex: string;
  role: string;
  fix?: Fix;
  /** Đích của fix (L, Lc hoặc hue, xem `Fix`). */
  to?: number;
}

export interface PresetMode {
  neutrals: PresetToken[];
  accents: PresetToken[];
  /** Biến CSS thêm (gradient, alpha), chỉ ghi khi --format css; thay --bg-gradient mặc định. */
  css?: Record<string, string>;
}

export interface Preset {
  source: string;
  /** Nguyên tắc rút từ theme gốc, in trong TOON và đầu tệp CSS. */
  principles?: string[];
  modes: Partial<Record<Mode, PresetMode>>;
}

const mix = (v: string, pct: number): string => `color-mix(in oklab, ${v} ${pct}%, transparent)`;

export const PRESETS: Record<string, Preset> = {
  "neon-dark": {
    source: "lan-topo-card Neon theme (snmp-topo-lan-card), Tailwind v3 accents",
    modes: {
      dark: {
        neutrals: [
          { token: "bg-edge", hex: "#060a14", role: "gradient edge" },
          { token: "bg", hex: "#0a1122", role: "app background" },
          { token: "surface", hex: "#0e182e", role: "panel (source: rgba(14,24,46,.86))" },
          { token: "glow", hex: "#142443", role: "gradient center, raised" },
          { token: "border", hex: "#1e2b4a", role: "glass border (source: rgba(120,160,255,.18) on bg)" },
          { token: "dim", hex: "#8ea3c2", role: "secondary text", fix: "text" },
          { token: "fg", hex: "#e6edf7", role: "primary text" },
        ],
        accents: [
          { token: "primary", hex: "#22d3ee", role: "brand, router, unknown speed" },
          { token: "ok", hex: "#22c55e", role: "good: 1 Gbps, good quality" },
          { token: "warn", hex: "#f59e0b", role: "warning: 100 Mbps, fair quality" },
          { token: "bad", hex: "#ef4444", role: "error: no link, poor quality", fix: "band" },
          { token: "info", hex: "#3b82f6", role: "info: 10 Gbps", fix: "band" },
          { token: "hot", hex: "#fbbf24", role: "highlight: hot port (above band on purpose)" },
          { token: "metric", hex: "#7dd3fc", role: "highlight: numbers (above band on purpose)" },
          { token: "sky", hex: "#38bdf8", role: "series" },
          { token: "blue", hex: "#60a5fa", role: "access point" },
          { token: "teal", hex: "#14b8a6", role: "2.5 Gbps" },
          { token: "emerald", hex: "#34d399", role: "switch" },
          { token: "violet", hex: "#a78bfa", role: "internet" },
          { token: "orange", hex: "#fb923c", role: "modem" },
          { token: "pink", hex: "#f472b6", role: "server" },
          { token: "rose", hex: "#fb7185", role: "alert chip" },
          { token: "fuchsia", hex: "#e879f9", role: "upload" },
        ],
      },
    },
  },
  cockpit: {
    source: "cockpit-tools design system (jlcodes99/cockpit-tools src/styles/base.css), Tailwind slate + blue",
    principles: [
      "Tailwind defaults: slate neutrals, blue 700 (light) / 500 (dark) primary, status colors at step 500",
      "Warm paper background, cool slate text: warmth lives in the ground, what people read stays cool",
      "Brand is a pair, blue to teal: a 135deg gradient on primary buttons and two 12-15% corner glows on the page",
      "Two surfaces: solid for dialogs, dropdowns and menus; translucent cards (75% light, 85% dark) let the gradient through",
      "Borders, hover and shadows are the text color at low alpha (dark: white/black), not extra greys",
      "Dark mode lifts the brand one step brighter; status colors keep the same hue in every theme",
      "Theme packs Nord, Tokyo Night, Catppuccin, Gruvbox and Everforest override primary, hover and accent, plus bg and text in dark mode; OLED also overrides bg, text, card, hover and border in both modes",
    ],
    modes: {
      light: {
        neutrals: [
          { token: "bg", hex: "#f6f5f2", role: "app background, warm paper (--bg-primary)", fix: "tint", to: 91 },
          { token: "surface", hex: "#ffffff", role: "solid surface: dialog, dropdown, menu (--bg-secondary)", fix: "tint", to: 91 },
          { token: "panel", hex: "#eef2f7", role: "soft panel, gradient end (--bg-tertiary)" },
          { token: "muted", hex: "#94a3b8", role: "muted text, hints (--text-muted)", fix: "text" },
          { token: "dim", hex: "#475569", role: "secondary text (--text-secondary)" },
          { token: "fg", hex: "#0f172a", role: "primary text (--text-primary)" },
        ],
        accents: [
          { token: "primary", hex: "#1d4ed8", role: "brand blue, solid buttons (--primary)" },
          { token: "primary-hover", hex: "#1e40af", role: "hover, deeper on purpose (--primary-hover)" },
          { token: "accent", hex: "#0ea5a5", role: "brand teal, gradient end (--accent)" },
          { token: "ok", hex: "#22c55e", role: "success (--success)", fix: "band" },
          { token: "warn", hex: "#f59e0b", role: "warning (--warning)", fix: "band" },
          { token: "warn-strong", hex: "#f97316", role: "strong warning (--warning-strong)", fix: "band" },
          { token: "bad", hex: "#ef4444", role: "error (--danger)" },
        ],
        css: {
          "bg-gradient": `radial-gradient(circle at 12% 10%, ${mix("var(--primary)", 12)}, transparent 45%), radial-gradient(circle at 90% 5%, ${mix("var(--accent)", 12)}, transparent 40%), linear-gradient(180deg, var(--bg) 0%, var(--panel) 100%)`,
          "gradient-primary": "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)",
          card: mix("var(--surface)", 75),
          border: mix("var(--fg)", 12),
          "border-light": mix("var(--fg)", 8),
          hover: mix("var(--fg)", 6),
          "shadow-md": `0 12px 24px ${mix("var(--fg)", 12)}`,
        },
      },
      dark: {
        neutrals: [
          { token: "bg", hex: "#0f172a", role: "app background (--bg-primary)", fix: "bg" },
          { token: "surface", hex: "#1e293b", role: "solid surface: dialog, dropdown, menu (--bg-secondary)" },
          { token: "panel", hex: "#334155", role: "soft panel, raised (--bg-tertiary)" },
          { token: "muted", hex: "#64748b", role: "muted text, hints (--text-muted)", fix: "text" },
          { token: "dim", hex: "#94a3b8", role: "secondary text (--text-secondary)", fix: "text", to: 75 },
          { token: "fg", hex: "#f1f5f9", role: "primary text (--text-primary)" },
        ],
        accents: [
          { token: "primary", hex: "#3b82f6", role: "brand blue, solid buttons (--primary)", fix: "band" },
          { token: "primary-hover", hex: "#2563eb", role: "hover, brighter than primary (--primary-hover)", fix: "band", to: 0.78 },
          { token: "accent", hex: "#14b8a6", role: "brand teal, gradient end (--accent)" },
          { token: "ok", hex: "#22c55e", role: "success (--success)" },
          { token: "warn", hex: "#f59e0b", role: "warning (--warning)" },
          { token: "warn-strong", hex: "#f97316", role: "strong warning (--warning-strong)" },
          { token: "bad", hex: "#ef4444", role: "error (--danger)", fix: "band" },
        ],
        css: {
          "bg-gradient": `radial-gradient(circle at 12% 10%, ${mix("var(--primary)", 15)}, transparent 45%), radial-gradient(circle at 90% 5%, ${mix("var(--accent)", 12)}, transparent 40%), linear-gradient(180deg, var(--bg) 0%, var(--surface) 100%)`,
          "gradient-primary": "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)",
          card: mix("var(--surface)", 85),
          border: mix("white", 12),
          "border-light": mix("white", 6),
          hover: mix("white", 8),
          "shadow-md": `0 12px 24px ${mix("black", 35)}`,
        },
      },
    },
  },
};
