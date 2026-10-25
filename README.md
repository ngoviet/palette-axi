# palette-axi

AXI CLI (theo [axi.md](https://axi.md)) để **kiểm và sinh bảng màu giao diện** trong OKLCH: trung tính nhuốm
cùng một sắc, màu nhấn cùng một dải sáng, tương phản APCA kèm WCAG 2, kẹp gamut sRGB.

Output TOON gọn, có sẵn số đếm và dòng `help[]` gợi ý lệnh tiếp theo; lỗi có `code:` và exit code
(2 = dùng sai, 1 = lỗi hoặc `analyze --strict` gặp vấn đề).

```bash
palette-axi                                          # kiểm nhanh thư mục hiện tại
palette-axi analyze src --bg "#0a1122"               # gom màu, chấm 7 nguyên tắc, issues[]
palette-axi contrast "#8ea3c2" "#0a1122" --size 14   # WCAG + APCA + gợi ý màu cùng sắc đạt chuẩn
palette-axi generate --seed 262 --mode both --format css > tokens.css
palette-axi generate --preset neon-dark --format tailwind
palette-axi scale "#3b82f6" --steps 12 --mode dark
```

Hex phải bọc nháy (`"#3b82f6"`) hoặc bỏ `#` (`3b82f6`): shell coi `#…` không nháy là chú thích.

## 7 nguyên tắc

| # | Nguyên tắc | Mã issue |
|---|---|---|
| 1 | Làm việc trong OKLCH, hex chỉ ở bước xuất | (cách làm) |
| 2 | Trung tính nhuốm cùng hue, chroma 0.01–0.06 | `2-tint` |
| 3 | Nền tối không đen tuyền: L 0.13–0.20; mặt nổi sáng hơn 0.03–0.08; gradient từ một góc | `3-bg` |
| 4 | Màu nhấn cùng một dải sáng (nền tối L 0.70–0.80) hoặc cùng Lc, chroma cao nhất trong gamut ≤ 0.20 | `4-band` |
| 5 | Thang chroma giảm dần về hai đầu | `5-scale` |
| 6 | Mỗi bậc một vai trò; mỗi sắc một nghĩa (ok xanh lá, warn vàng/cam, bad đỏ, info xanh dương) | `6-meaning` |
| 7 | Kiểm bằng máy: APCA Lc 90/75/60/45/30/15, kèm WCAG 2 (4.5:1); kẹp sRGB | `7-contrast`, `7-gamut` |

Nguồn: Evil Martians (OKLCH), Ottosson (Oklab), Radix Colors, Tailwind v4, Material dark theme, APCA,
Evil Martians Harmony. Preset `neon-dark` lấy từ theme Neon của lan-topo-card, đã sửa 3 màu yếu
(blue-500, red-500 vào dải sáng; chữ phụ lên Lc ≥ 60).

## Cài đặt

```bash
npm install
npm run check            # typecheck + lint + test
npm run install:global   # build, npm pack, npm install -g
```

Skill cho Claude Code: `skill/SKILL.md` (sinh từ `src/registry.ts` bằng `npm run skill:build`).
Trên PC1, `~/.claude/skills/palette-axi` là symlink trỏ về `skill/`.

Lõi màu: [Color.js](https://colorjs.io) (MIT). Không dùng `apca-w3`/`apcach` vì giấy phép Limited W3.

## Giấy phép

MIT
