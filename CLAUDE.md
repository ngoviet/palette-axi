# CLAUDE.md — palette-axi

CLI TypeScript theo chuẩn AXI (axi-sdk-js 0.1.13), khuôn `D:\code\social-axi`. Tạo 26/10/2026 từ
nghiên cứu theme lan-topo-card (kho kiến thức: `research-axi kb show nguyen-tac-tao-bang-mau-dep-va-skill-palette-theo-axi`).

## Cấu trúc

- `src/bin.ts` — fast path `--version`; nạp `cli.ts` động.
- `src/registry.ts` — **nguồn duy nhất** cho bảng lệnh, `--help` và `skill/SKILL.md`.
- `src/color.ts` — lõi màu trên Color.js: OKLCH, APCA (`nền.contrast(chữ, "APCA")`), WCAG 2.1,
  ánh xạ gamut CSS Color 4, `maxChroma` và `solveLc` (tìm nhị phân trên L — tự viết, không dùng apcach).
- `src/extract.ts` — gom màu bằng regex từ CSS/JS/HTML (bỏ chú thích `/* */`, entity `&#x…;`, alpha < 1).
- `src/rules.ts` — 7 nguyên tắc thành phép chấm; ngưỡng ở hằng `T`. Dùng chung cho analyze và generate.
- `src/presets.ts` — preset (neon-dark = lan-topo-card, 3 màu yếu sửa khi xuất).
- `src/commands/*` — mỗi lệnh một file; trả object (SDK render TOON) hoặc chuỗi (`--format css|tailwind|json`).
- `test/` — vitest chạy **bin đã build** (`dist/`, global-setup build trước) qua `spawnSync`, không gọi mạng.

## Quy tắc

- Đổi lệnh/summary ⇒ `npm run skill:build` (test fail nếu `skill/SKILL.md` lệch).
- Đổi version ⇒ sửa cả `package.json` và `src/version.ts` (test kiểm).
- Mỗi lệnh: cột mặc định 3–5, `--fields/--limit/--full`, rỗng in `0 … found`, có `help[]`.
- Lỗi qua `fail(message, code, help)`; flag lạ ⇒ VALIDATION_ERROR (exit 2); `analyze --strict` có issue ⇒ ISSUES_FOUND (exit 1).
- Giấy phép: KHÔNG thêm `apca-w3` hay `apcach` (kéo theo Limited W3 License). APCA lấy từ Color.js (MIT).
- Fixture `test/fixtures/lan-topo-card.css` phải giữ đúng số đo đối chiếu (5 trung tính H 257–266 C ≤ 0.062,
  12/16 nhấn trong L 0.70–0.80, `#3b82f6` L 0.623 5.12:1 Lc −37, `#e6edf7` 15.97:1 Lc −95, `#8ea3c2` Lc −51).

## CI

Woodpecker tự host (`.woodpecker/ci.yaml`) — repo riêng tư, không dùng GitHub Actions. Chỉ chạy khi repo đã
Enable trong https://ci.bepmamnon.com.

## Bẫy đã gặp

- Shell coi `#3b82f6` không nháy là chú thích ⇒ lệnh nhận cả `3b82f6`; help[] luôn bọc nháy hex.
- TOON escape dấu `"` trong chuỗi (`\"`) ⇒ thông điệp lỗi/issue không dùng nháy kép.
- Màu rất sáng/rất tối với C nhỏ (0.003) làm tròn hex thành xám thuần (hue mất) ⇒ trung tính sinh ra giữ C ≥ 0.006.
- Tên đứng trước `:` có thể là nhánh ternary (`a ? b : "#fff"`) hoặc thuộc tính (`obj.poor : …`) ⇒ `extract.ts` loại.
- Hook PC1 chặn lệnh Bash có `\\` ⇒ sửa regex bằng Edit/Write, không bằng sed/python heredoc.
