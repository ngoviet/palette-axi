// Preset = bảng màu có sẵn, chép từ một theme thật rồi sửa chỗ yếu đã đo.
// neon-dark: theme Neon của lan-topo-card (theo doanlong1412/snmp-topo-lan-card), màu nhấn là
// bảng mặc định Tailwind v3. Đo 26/10/2026: 12/16 màu nhấn trong L 0.70–0.80; blue-500 (L 0.62)
// và red-500 (L 0.64) dưới dải, chữ phụ #8ea3c2 chỉ Lc −51 ⇒ ba màu này được sửa khi xuất.

export type Fix = "band" | "text";

export interface PresetToken {
  token: string;
  hex: string;
  role: string;
  /** band: giữ hue, nâng L lên 0.72 (vào dải); text: giữ hue + C, nâng L tới |Lc| ≥ 60. */
  fix?: Fix;
}

export interface Preset {
  mode: "dark";
  source: string;
  neutrals: PresetToken[];
  accents: PresetToken[];
}

export const PRESETS: Record<string, Preset> = {
  "neon-dark": {
    mode: "dark",
    source: "lan-topo-card Neon theme (snmp-topo-lan-card), Tailwind v3 accents",
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
};
