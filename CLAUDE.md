# CLAUDE.md — palette-axi

CLI TypeScript theo chuẩn AXI (axi-sdk-js 0.1.14), khuôn `D:\code\social-axi`. Tạo 26/10/2026 từ
nghiên cứu theme lan-topo-card (kho kiến thức: `research-axi kb show nguyen-tac-tao-bang-mau-dep-va-skill-palette-theo-axi`).

## Cấu trúc

- `src/bin.ts` — fast path `--version`; nạp `cli.ts` động.
- `src/registry.ts` — **nguồn duy nhất** cho bảng lệnh, `--help` và `skill/SKILL.md`.
- `src/color.ts` — lõi màu trên Color.js: OKLCH, APCA (`nền.contrast(chữ, "APCA")`), WCAG 2.1,
  ánh xạ gamut CSS Color 4, `maxChroma` và `solveLc` (tìm nhị phân trên L — tự viết, không dùng apcach).
- `src/extract.ts` — gom màu bằng regex từ CSS/JS/HTML (bỏ chú thích `/* */`, entity `&#x…;`, alpha < 1).
- `src/rules.ts` — 7 nguyên tắc thành phép chấm; ngưỡng ở hằng `T`. Dùng chung cho analyze và generate.
  Quy tắc `8-pairs` (08/11/2026, học từ Fluent Blue): ghép chữ–nền theo tên token trong cùng khối `{}`
  (`extract.ts` ghi `tokens[]` kèm scope), ngưỡng `PAIR` = Lc 60 + 4.5:1. `generate` không có token ⇒ n/a.
- `src/presets.ts` — preset theo chế độ (`modes.light/dark`): neon-dark = lan-topo-card (tối, 3 màu sửa);
  cockpit = cockpit-tools (sáng + tối, 12 màu sửa, `principles[]`, biến CSS thêm). Kiểu sửa: band, text, tint, bg.
- `src/commands/*` — mỗi lệnh một file; trả object (SDK render TOON) hoặc chuỗi (`--format css|tailwind|json`).
- `test/` — vitest chạy **bin đã build** (`dist/`, global-setup build trước) qua `spawnSync`, không gọi mạng.

## Quy tắc

- Đổi lệnh/summary ⇒ `npm run skill:build` (test fail nếu `skill/SKILL.md` lệch).
- Đổi version ⇒ sửa `package.json`, `src/version.ts` và tên `.tgz` trong script `install:global` (test kiểm cả ba).
- Phụ thuộc (rà 09/11/2026, v0.2.0): giữ TypeScript 6.0 — `typescript-eslint` 8.72 chỉ nhận `<6.1`, chưa lên TS 7.
  Còn 10 cảnh báo moderate `minimatch` qua eslint (chỉ devDeps, chờ eslint vá); đừng `npm audit fix --force` (hạ eslint về 9).
- `allowScripts` ghim đúng bản esbuild đang cài (`npm ls esbuild`); nâng tsup/vitest thì sửa theo.
- Màu CSS Color 4 có `none` (`oklch(0.7 none 30)`): Color.js trả `null` ⇒ `tryParse` đổi thành 0; toạ độ là chuỗi
  (`rgb(a,b,c)` trong mã JS) vẫn bị loại.
- Mỗi lệnh: cột mặc định 3–5, `--fields/--limit/--full`, rỗng in `0 … found`, có `help[]`.
- Lỗi qua `fail(message, code, help)`; flag lạ ⇒ VALIDATION_ERROR (exit 2); `analyze --strict` có issue ⇒ ISSUES_FOUND (exit 1).
- Giấy phép: KHÔNG thêm `apca-w3` hay `apcach` (kéo theo Limited W3 License). APCA lấy từ Color.js (MIT).
- Fixture `test/fixtures/lan-topo-card.css` phải giữ đúng số đo đối chiếu (5 trung tính H 257–266 C ≤ 0.062,
  12/16 nhấn trong L 0.70–0.80, `#3b82f6` L 0.623 5.12:1 Lc −37, `#e6edf7` 15.97:1 Lc −95, `#8ea3c2` Lc −51).
- Fixture `test/fixtures/fluent-blue-0.2.0.css` (vai trò màu thật của Fluent Blue, sáng + tối): 40 cặp, 17 trượt;
  số WCAG đối chiếu bằng công thức `contrast_ratio` của chính Fluent Blue.
- `8-pairs` chưa đọc token dạng kênh trần của shadcn cũ (`--primary: 222 47% 11%`) hay `var()` ⇒ n/a ở các file đó.
- 0.4.0 (09/11/2026, sửa theo đánh giá Apollo — báo cáo "Sửa lỗi palette-axi 0.3.1"): chữ phải đạt CẢ Lc lẫn WCAG
  (`solveLc(..., { wcag })`, ngưỡng `PAIR` / `NONTEXT_WCAG` / `ACCENT_WCAG` trong `rules.ts`). Token tên chữ
  (`BARE_TEXT`, `X-ink`, `X-text`) chấm như chữ dù rơi vào nhóm muted; chỉ token cùng khối `{}` với nền. Quy ước
  ghép cặp CHỈ thêm `X-ink` — `X-fg`/`X-dim` và chữ trần trên `bg/surface` từng thử nhưng đổi số đo đối chiếu
  (lan-topo-card, Fluent Blue 40/17) nên bỏ. `findRamps` không gộp trung tính ⇒ lan-topo-card `5-scale` n/a
  (chủ repo duyệt). Test hồi quy: `test/regressions-0.3.1.test.ts`, `test/review-0.4.test.ts`.

- README song ngữ theo **readme-axi** (`ngoviet/.github/readme-axi/readme_axi.py`, loại `tool`): sửa `README.md`
  thì sửa luôn `README.vi.md` cùng khung; kiểm bằng `python readme_axi.py check` và `drift`. Khối ủng hộ chỉ sinh
  bằng `readme_axi.py support --write`, không viết tay. Đổi version ⇒ sửa link cài `.tgz` trong cả hai README.
- `update` là lệnh của palette-axi (`src/commands/update.ts`), thay lệnh `update` sẵn có của axi-sdk-js ≥ 0.1.14
  (lệnh đó hỏi npm registry, luôn lỗi vì palette-axi chỉ phát hành qua GitHub Releases). Không gọi mạng.

## CI

Repo public từ 09/11/2026. Kiểm mã: GitHub Actions `.github/workflows/ci.yml` (`npm run check` + `npm run skill:check`),
còn `.github/workflows/readme.yml` gọi workflow readme-axi chung. Cả hai miễn phí cho repo public. Woodpecker tự host
đã tắt 10/11/2026, đừng bật lại: PR từ fork lạ sẽ chạy trên PC4, chung máy prod.

## Bẫy đã gặp

- Shell coi `#3b82f6` không nháy là chú thích ⇒ lệnh nhận cả `3b82f6`; help[] luôn bọc nháy hex.
- TOON escape dấu `"` trong chuỗi (`\"`) ⇒ thông điệp lỗi/issue không dùng nháy kép.
- Màu rất sáng/rất tối với C nhỏ (0.003) làm tròn hex thành xám thuần (hue mất) ⇒ trung tính sinh ra giữ C ≥ 0.006.
- Tên đứng trước `:` có thể là nhánh ternary (`a ? b : "#fff"`) hoặc thuộc tính (`obj.poor : …`) ⇒ `extract.ts` loại.
- Hook PC1 chặn lệnh Bash có `\\` ⇒ sửa regex bằng Edit/Write, không bằng sed/python heredoc.
