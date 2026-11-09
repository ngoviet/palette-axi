# palette-axi

<!-- readme-axi type=tool -->

[![Release](https://img.shields.io/github/v/release/ngoviet/palette-axi)](https://github.com/ngoviet/palette-axi/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[English](README.md) · **Tiếng Việt**

Một [AXI](https://axi.md) cho bảng màu giao diện: CLI để coding agent (Claude Code, Codex, OpenCode, …) gọi qua
shell nhằm kiểm màu trong stylesheet hay bản build, đo độ tương phản của chữ, và sinh theme trong OKLCH — trung
tính nhuốm cùng một sắc, màu nhấn cùng một dải sáng, tương phản APCA kèm WCAG 2, nằm trong sRGB. Output là bản
tóm tắt [TOON](https://toonformat.dev/) gọn một màn hình, kèm lệnh nên chạy tiếp.

> 🇻🇳 Một người ở Việt Nam làm và duy trì — nếu công cụ giúp bạn tiết kiệm thời gian, mong bạn
> [ủng hộ dự án](#ủng-hộ-dự-án).

## Mục lục

- [Tính năng](#tính-năng)
- [Cài đặt](#cài-đặt)
- [Cách dùng](#cách-dùng)
- [Lệnh](#lệnh)
- [Cách hoạt động](#cách-hoạt-động)
- [Phát triển](#phát-triển)

## Tính năng

- **Kiểm đúng thứ bạn phát hành.** `analyze` gom mọi màu đục từ CSS, SCSS, JS/TS, HTML, Vue, Svelte hay Astro
  (một tệp, một thư mục hoặc bản build), tách trung tính, xám trạng thái và màu nhấn, rồi chấm
  [8 quy tắc](#cách-hoạt-động). Mỗi issue ghi rõ màu, quy tắc và số đo.
- **Chữ trên đúng mặt nền của nó.** Token được ghép cặp theo tên trong cùng khối `{}` (`on-primary` trên
  `primary`, `foreground` trên `background`, `danger-text` trên `danger-subtle`…), nên theme sáng và tối được
  kiểm riêng, không chỉ so với nền trang.
- **Hai mô hình tương phản.** APCA Lc (có dấu: âm = chữ sáng trên nền tối) kèm tỉ lệ WCAG 2.1, và đạt/trượt theo
  từng công dụng: chữ thân bài, chữ nội dung, chữ lớn, placeholder, đường kẻ.
- **Có cách sửa, không chỉ phán.** `contrast` gợi ý màu gần nhất cùng sắc đạt mức chữ nội dung.
- **Sinh theo cùng bộ quy tắc.** `generate` dựng theme tối, sáng hoặc cả hai từ một sắc rồi tự chấm lại bằng
  `analyze`; `scale` làm thang Tailwind 50–950 hoặc Radix 1–12. Xuất ra TOON, biến CSS, khối `@theme` của
  Tailwind v4 hoặc JSON.
- **Dùng được trong CI.** `analyze --strict` thoát 1 khi có quy tắc trượt.

## Cài đặt

Yêu cầu: **Node.js ≥ 20**.

Từ bản release mới nhất (không cần clone):

```bash
npm install -g https://github.com/ngoviet/palette-axi/releases/download/v0.3.1/palette-axi-0.3.1.tgz
```

Từ mã nguồn:

```bash
git clone https://github.com/ngoviet/palette-axi.git
cd palette-axi
npm ci
npm run install:global   # build, đóng gói rồi cài gói đó toàn cục
```

palette-axi không đăng lên npm registry; `palette-axi update` chỉ cách cài bản release mới hơn.

Với Claude Code, skill nằm ở [`skill/SKILL.md`](skill/SKILL.md): chép hoặc tạo liên kết thư mục `skill/` vào
`~/.claude/skills/palette-axi`.

## Cách dùng

```bash
palette-axi                                          # kiểm nhanh thư mục hiện tại
palette-axi analyze src --bg "#0a1122"               # mọi màu, 8 quy tắc, issues[]
palette-axi contrast "#8ea3c2" "#0a1122" --size 14   # APCA + WCAG + màu cùng sắc đạt chuẩn
palette-axi generate --seed 262 --mode both --format css > tokens.css
palette-axi generate --preset cockpit --format css > cockpit.css
palette-axi scale "#3b82f6" --steps 12 --mode dark
```

Hex phải bọc nháy (`"#3b82f6"`) hoặc bỏ `#` (`3b82f6`): shell coi `#…` không nháy là chú thích.

Ví dụ (theme neon của lan-topo-card, rút gọn bằng `--limit 4`):

```text
$ palette-axi analyze lan-topo-card.css --bg "#0a1122" --limit 4
source: lan-topo-card.css (1 file)
bg: "#0a1122 oklch 0.181 0.037 266, dark, from --bg"
colors: "23 (5 neutral, 2 muted, 16 accent)"
neutrals: "5, hue 257–266, C ≤0.062, tinted ✓"
accents: "12/16 in L 0.70–0.80, 2 brighter (highlights), hue 13–350"
contrast: "accents wcag ≥4.5 16/16, apca |Lc| ≥45 14/16"
rules: "5/7 rules passed, failed: 4-band 7-contrast, n/a: 8-pairs"
issues[3]{hex,rule,detail}:
  #3b82f6,4-band,L 0.62 < 0.70; Lc -37
  #ef4444,4-band,L 0.64 < 0.70; Lc -37
  #8ea3c2,7-contrast,"Lc -51 < 60 for content text; 7.32:1"
palette_count: 4 of 23 total
palette[4]{hex,kind,oklch,lc,wcag}:
  #060a14,neutral,0.146 0.023 265,0,1.05
  #0a1122,neutral,0.181 0.037 266,0,1
  #142443,neutral,0.264 0.062 262,0,1.22
  #8ea3c2,neutral,0.710 0.051 258,-51,7.32
help[4]: …
```

`#8ea3c2` đạt WCAG (7.32:1) nhưng APCA chỉ Lc −51, thiếu so với Lc 60 mà chữ nội dung cần;
`palette-axi contrast "#8ea3c2" "#0a1122"` khi đó gợi ý `#a2b7d7` (cùng sắc, Lc −62).

## Lệnh

| Lệnh | Làm gì |
| --- | --- |
| `palette-axi` / `palette-axi home` | Kiểm nhanh thư mục hiện tại (400 tệp style và script đầu tiên) kèm các lệnh để đi tiếp. |
| `analyze <file\|dir\|color…>` | Gom màu, đo OKLCH, APCA Lc và WCAG so với nền, chấm các quy tắc. `--bg <màu>` đặt nền (mặc định: trung tính tối hoặc sáng dùng nhiều nhất); `--strict` thoát 1 khi có issue. |
| `contrast <fg> <bg>` | Tỉ lệ WCAG, APCA Lc, đạt/trượt theo công dụng và màu cùng sắc gợi ý. `--size <px>` và `--weight <n>` cho một kết luận cho đúng cỡ chữ đó. |
| `generate --seed <hue\|color>` | Theme theo quy tắc: `--mode dark\|light\|both`, `--roles a,b` (tên sắc hoặc `brand=310`), `--lc <n>` độ tương phản đích của màu nhấn. |
| `generate --preset neon-dark\|cockpit` | Một theme thật, các màu yếu đã sửa và liệt kê trong `fixed[]`. |
| `scale <color\|hue>` | Một sắc thành thang: `--steps 11` (Tailwind 50–950) hoặc `--steps 12` (Radix 1–12, bậc 9 = màu gốc), `--mode light\|dark`, `--bg <màu>`. |
| `update` | Bản đang cài và cách cài bản release mới nhất. Không gọi mạng. |

`generate` và `scale` nhận `--format toon|css` (`generate` còn có `tailwind` và `json`).

### Cờ

Lệnh nào cũng nhận:

| Cờ | Nghĩa |
| --- | --- |
| `--fields a,b` | Chỉ các cột này (`analyze`: mặc định `hex,kind,oklch,lc,wcag`; còn có `l,c,h,name,where,count,raw`). |
| `--limit <n>` | Số dòng hiện ra. |
| `--full` | Mọi dòng. |
| `--help` | Trợ giúp của lệnh. |

### Mã thoát

| Mã | Nghĩa |
| --- | --- |
| `0` | Lệnh chạy xong (`analyze` có issue vẫn thoát 0 nếu không có `--strict`). |
| `1` | Đường dẫn không tồn tại (`NOT_FOUND`) hoặc `analyze --strict` gặp issue (`ISSUES_FOUND`). |
| `2` | Dùng sai: cờ hay cột lạ, thiếu đối số, màu không đọc được (`VALIDATION_ERROR`). |

Lỗi in ra dạng TOON với `error`, `code` và `help[]`.

## Cách hoạt động

Mọi phép tính làm trong OKLCH; hex chỉ xuất hiện ở đầu ra. Tương phản và ánh xạ gamut lấy từ
[Color.js](https://colorjs.io) (APCA 0.0.98G, WCAG 2.1, ánh xạ gamut CSS Color 4).

| # | Quy tắc | Mã issue |
| --- | --- | --- |
| 1 | Làm việc trong OKLCH; hex chỉ ở bước xuất | (cách làm) |
| 2 | Trung tính chung một sắc, nhuốm ở chroma 0.01–0.06 | `2-tint` |
| 3 | Nền tối không đen tuyền: L 0.13–0.20; nền sáng có L ≥ 0.93 | `3-bg` |
| 4 | Màu nhấn cùng một dải sáng (tối L 0.70–0.80, sáng L 0.45–0.70) với chroma cao nhất trong gamut | `4-band` |
| 5 | Trong thang ≥ 5 bậc, chroma đỉnh ở giữa và giảm về hai đầu | `5-scale` |
| 6 | Mỗi sắc một nghĩa: success xanh lá, warning vàng cam, error đỏ, info xanh dương | `6-meaning` |
| 7 | Chữ trung tính đạt APCA \|Lc\| ≥ 60, màu nhấn ≥ 45; mọi màu nằm trong sRGB | `7-contrast`, `7-gamut` |
| 8 | Token chữ trên đúng mặt nền của nó (`on-X` / `X-foreground` trên `X` và `-hover`/`-pressed`/`-active`, `foreground` trên `background`, `X-text` trên `X-subtle`/`-bg`/`-soft`/`-container`): Lc 60 và 4.5:1 | `8-pairs` |

Quy tắc 8 chưa đọc token dạng kênh trần (shadcn cũ `--primary: 222 47% 11%`) hay tham chiếu `var()`; các tệp
đó báo `n/a`. Tên màu (`red`, `white`), `var()` và `color-mix()` không được gom; màu trong suốt (alpha < 1)
được đếm nhưng không chấm.

### Preset

- **`neon-dark`**: theme neon của [lan-topo-card](https://github.com/ngoviet/lan-topo-card) (màu nhấn Tailwind
  v3). Ba màu yếu được sửa khi xuất: blue-500 và red-500 nâng vào dải sáng, chữ phụ nâng từ Lc −51 lên Lc 60+.
- **`cockpit`**: hệ thiết kế sáng và tối của [cockpit-tools](https://github.com/jlcodes99/cockpit-tools)
  (`src/styles/base.css`), mặc định xuất cả hai chế độ. Output TOON có `principles[]` (nền giấy ấm với chữ
  slate lạnh, cặp thương hiệu xanh dương → xanh ngọc, bề mặt đặc và trong suốt, viền bằng màu chữ ở alpha
  thấp…). `--format css` ghi thêm các nguyên tắc ở đầu tệp cùng `--bg-gradient`, `--gradient-primary`, `--card`,
  `--border`, `--hover` và `--shadow-md`. Màu đã sửa, liệt kê trong `fixed[]`: ở chế độ sáng là bề mặt xám
  thuần, màu trạng thái quá nhạt trên nền sáng và chữ mờ dưới Lc 60; ở chế độ tối là nền sáng hơn L 0.20,
  primary và đỏ dưới dải sáng, chữ phụ nhạt, và màu hover tối hơn primary.

Các quy tắc dựa trên Evil Martians (OKLCH, Harmony), Björn Ottosson (Oklab), Radix Colors, Tailwind v4, theme
tối của Material và APCA.

## Phát triển

```bash
npm ci
npm run check         # typecheck + eslint + vitest
npm run skill:build   # sinh lại skill/SKILL.md từ src/registry.ts
```

- `src/registry.ts` là nguồn duy nhất cho bảng lệnh, `--help` và `skill/SKILL.md` (test báo lỗi nếu skill lệch).
- Test chạy CLI đã build (`dist/`) qua `spawnSync` và không gọi mạng. Fixture trong `test/fixtures/` giữ số đo
  đối chiếu (lan-topo-card, Fluent Blue 0.2.0).
- Khi đổi version, sửa `package.json`, `src/version.ts` và tên `.tgz` trong `install:global` (test kiểm cả ba).
- Không dùng `apca-w3` hay `apcach`: giấy phép Limited W3 của chúng không phải MIT. APCA lấy từ Color.js.
- Thay đổi theo từng bản: [Releases](https://github.com/ngoviet/palette-axi/releases).

<!-- support:start -->
## Ủng hộ dự án

<p align="center">
  <img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/banner.svg" width="720" alt="Built and maintained by one person in Việt Nam">
</p>

<p align="center">
  <a href="https://buymeacoffee.com/ngoviet"><img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/btn-coffee.svg" height="56" alt="Buy me a coffee"></a>
  &nbsp;
  <a href="https://github.com/sponsors/ngoviet"><img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/btn-sponsors.svg" height="56" alt="GitHub Sponsors"></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/vietqr-card.svg" width="300" alt="VietQR — MB Bank — NGO DUC VIET — 911051212">
  &nbsp;
  <img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/crypto-card.svg" width="300" alt="Crypto — BNB Smart Chain (BEP20) — 0xcbf0402b232cb24b4d998f09a4884f87b5f74750">
</p>

<p align="center"><b>Ví tiền mã hoá, chỉ gửi qua mạng BNB Smart Chain (BEP20):</b><br><code>0xcbf0402b232cb24b4d998f09a4884f87b5f74750</code></p>

<p align="center"><sub>🇻🇳 VietQR: quét bằng app ngân hàng bất kỳ, nội dung <code>Ung ho palette-axi</code>. Cảm ơn bạn đã giúp dự án tiếp tục phát triển!</sub></p>
<!-- support:end -->

## Giấy phép

[MIT](LICENSE) © Ngô Đức Việt.
