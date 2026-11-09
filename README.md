# palette-axi

<!-- readme-axi type=tool -->

[![Release](https://img.shields.io/github/v/release/ngoviet/palette-axi)](https://github.com/ngoviet/palette-axi/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**English** · [Tiếng Việt](README.vi.md)

An [AXI](https://axi.md) for UI color palettes: a CLI that coding agents (Claude Code, Codex, OpenCode, …) call
through the shell to audit the colors in a stylesheet or build, check text contrast, and generate a theme in
OKLCH — tinted neutrals, accents on one lightness band, APCA + WCAG 2 contrast, inside sRGB. Output is a
one-screen [TOON](https://toonformat.dev/) summary with the next command to run.

> 🇻🇳 Built and maintained by one person in Việt Nam — if it saves you time, please
> [support the project](#support-the-project).

## Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Commands](#commands)
- [How it works](#how-it-works)
- [Development](#development)

## Features

- **Audit what you ship.** `analyze` collects every opaque color from CSS, SCSS, JS/TS, HTML, Vue, Svelte or
  Astro (a file, a folder, or a built bundle), splits neutrals, muted greys and accents, and scores
  [8 rules](#how-it-works). Each issue names the color, the rule and the measured value.
- **Text on its real fill.** Tokens are paired by name inside the same `{}` block (`on-primary` on `primary`,
  `foreground` on `background`, `danger-text` on `danger-subtle`…), so light and dark themes are checked
  separately, not just against the page background.
- **Two contrast models, both enforced.** APCA Lc (signed: negative = light text on dark) and the WCAG 2.1
  ratio. Text needs both: on a light background Lc 60 alone is only about 3.5:1, below WCAG AA. Tokens named
  as text (`ink`, `fg`, `text`, `muted`, `text-secondary`…) are scored as text whatever their chroma.
- **A fix, not just a verdict.** `contrast` suggests the nearest color with the same hue (or grey) that passes
  content text by both measures, Lc 62 and 4.5:1.
- **Generate by the same rules.** `generate` builds a dark, light or dual theme from one hue and re-scores it with
  `analyze`; `scale` makes a Tailwind 50–950 or Radix 1–12 ramp. Export as TOON, CSS custom properties, a
  Tailwind v4 `@theme` block or JSON.
- **CI-ready.** `analyze --strict` exits 1 when any rule fails.

## Installation

Requirements: **Node.js ≥ 20**.

From the latest release (no clone needed):

```bash
npm install -g https://github.com/ngoviet/palette-axi/releases/download/v0.4.0/palette-axi-0.4.0.tgz
```

From source:

```bash
git clone https://github.com/ngoviet/palette-axi.git
cd palette-axi
npm ci
npm run install:global   # build, pack and install the packed tarball globally
```

palette-axi is not published to the npm registry; `palette-axi update` shows how to install a newer release.

For Claude Code, the skill is in [`skill/SKILL.md`](skill/SKILL.md): copy or link the `skill/` folder to
`~/.claude/skills/palette-axi`.

## Usage

```bash
palette-axi                                          # quick check of the current directory
palette-axi analyze src --bg "#0a1122"               # every color, the 8 rules, issues[]
palette-axi contrast "#8ea3c2" "#0a1122" --size 14   # APCA + WCAG + a same-hue color that passes
palette-axi generate --seed 262 --mode both --format css > tokens.css
palette-axi generate --preset cockpit --format css > cockpit.css
palette-axi scale "#3b82f6" --steps 12 --mode dark
```

Quote hex colors (`"#3b82f6"`) or drop the `#` (`3b82f6`): the shell treats an unquoted `#…` as a comment.

Example (the lan-topo-card neon theme, shortened with `--limit 4`):

```text
$ palette-axi analyze lan-topo-card.css --bg "#0a1122" --limit 4
source: lan-topo-card.css (1 file)
bg: "#0a1122 oklch 0.181 0.037 266, dark, from --bg"
colors: "23 (5 neutral, 2 muted, 16 accent)"
neutrals: "5, hue 257–266, C ≤0.062, tinted ✓"
accents: "12/16 in L 0.70–0.80, 2 brighter (highlights), hue 13–350"
contrast: "accents wcag ≥4.5 16/16, apca |Lc| ≥45 14/16"
rules: "4/6 rules passed, failed: 4-band 7-contrast, n/a: 5-scale 8-pairs"
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

`#8ea3c2` passes WCAG (7.32:1) but reaches only APCA Lc −51, short of the Lc 60 that content text needs;
`palette-axi contrast "#8ea3c2" "#0a1122"` then suggests `#a2b7d7` (same hue, Lc −62).

## Commands

| Command | What it does |
| --- | --- |
| `palette-axi` / `palette-axi home` | Quick check of the current directory (first 400 style and script files) plus the commands to go further. |
| `analyze <file\|dir\|color…>` | Collect colors, measure OKLCH, APCA Lc and WCAG against the background, score the rules. `--bg <color>` sets the background (default: a token named `bg`/`background`/`paper`, else the most used dark or light neutral, not counting `color:` uses); `--pair fg:bg,…` adds text/fill pairs by token name or color; `--ignore rule,…` skips rules your palette breaks on purpose; `--strict` exits 1 on any issue. |
| `contrast <fg> <bg>` | WCAG ratio, APCA Lc, pass/fail per use and a same-hue suggestion that passes both. `--size <px>` and `--weight <n>` give one verdict for that text. |
| `generate --seed <hue\|color>` | A theme by the rules: `--mode dark\|light\|both`, `--roles a,b` (named hues or `brand=310`), `--lc <n>` target contrast for accents, `--wcag <ratio>` WCAG floor for text and accents (default 4.5; lowering either prints a warning). Adds `on-primary` for text on the primary fill. |
| `generate --preset neon-dark\|cockpit` | A real theme with its weak colors fixed and listed in `fixed[]`. |
| `scale <color\|hue>` | One hue as a ramp: `--steps 11` (Tailwind 50–950) or `--steps 12` (Radix 1–12, step 9 = the seed), `--mode light\|dark`, `--bg <color>`. |
| `update` | The installed version and how to install the latest release. No network call. |

`generate` and `scale` take `--format toon|css` (`generate` also `tailwind` and `json`).

### Flags

Every command accepts:

| Flag | Meaning |
| --- | --- |
| `--fields a,b` | Only these columns (`analyze`: `hex,kind,oklch,lc,wcag` by default; also `l,c,h,name,where,count,raw`). |
| `--limit <n>` | Rows to show. |
| `--full` | Every row. |
| `--help` | Help for the command. |

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | The command ran (an `analyze` with issues still exits 0 unless `--strict`). |
| `1` | A path does not exist (`NOT_FOUND`) or `analyze --strict` found issues (`ISSUES_FOUND`). |
| `2` | Usage error: unknown flag or field, missing argument, unreadable color (`VALIDATION_ERROR`). |

Errors are printed as TOON with `error`, `code` and `help[]`.

## How it works

Every calculation is done in OKLCH; hex appears only on output. Contrast and gamut mapping come from
[Color.js](https://colorjs.io) (APCA 0.0.98G, WCAG 2.1, CSS Color 4 gamut mapping).

| # | Rule | Issue code |
| --- | --- | --- |
| 1 | Work in OKLCH; hex only on export | (method) |
| 2 | Neutrals share one hue, tinted at chroma 0.01–0.06 (status fills such as `ok-bg`, and pure white, are exempt) | `2-tint` |
| 3 | A dark background is not black: L 0.13–0.20; a light one has L ≥ 0.93 | `3-bg` |
| 4 | Accents sit on one lightness band (dark L 0.70–0.80, light L 0.45–0.70) with the most in-gamut chroma | `4-band` |
| 5 | In a ramp of ≥ 5 accents (or tokens named like `blue-500`), chroma peaks mid-scale and tapers at both ends | `5-scale` |
| 6 | One meaning per hue: success (`ok`, `success`) green, warning amber, error red, info blue | `6-meaning` |
| 7 | Text tokens reach Lc 60 and 4.5:1 on the page background; focus rings and input borders 3:1 (WCAG 1.4.11); other neutrals used as text \|Lc\| ≥ 60; accents \|Lc\| ≥ 45 and 3:1; muted greys at least 3:1; every color inside sRGB | `7-contrast`, `7-gamut` |
| 8 | Text tokens on their own fill (`on-X` / `X-foreground` on `X` and its `-hover`/`-pressed`/`-active`, `foreground` on `background`, `X-text` / `X-ink` on `X-subtle`/`-bg`/`-soft`/`-container`, plus `--pair`): Lc 60 and 4.5:1 | `8-pairs` |

**Limits.** palette-axi compares token colors, not rendered pages: it does not see which text sits on which
element, so it does not replace axe or another DOM check — run both. Text tokens are recognised by name; a
token named otherwise is scored only by the generic neutral rule, so pair it with `--pair`. Decorative borders
and dividers are not held to 3:1. Rule 8 does not yet read bare channel tokens (old shadcn
`--primary: 222 47% 11%`) or `var()` references; those files report it as `n/a`. Color names (`red`,
`white`), `var()` and `color-mix()` are not collected, and translucent colors (alpha < 1) are counted but not
scored. Text-size thresholds in `contrast --size` ignore weight below 14 px and between 14 and 24 px.

### Presets

- **`neon-dark`**: the neon theme of [lan-topo-card](https://github.com/ngoviet/lan-topo-card) (Tailwind v3
  accents). Three weak colors are fixed on export: blue-500 and red-500 lifted into the lightness band, and the
  secondary text raised from Lc −51 to Lc 60+.
- **`cockpit`**: the light and dark design system of
  [cockpit-tools](https://github.com/jlcodes99/cockpit-tools) (`src/styles/base.css`), exported in both modes by
  default. TOON output lists its `principles[]` (warm paper background with cool slate text, a blue-to-teal brand
  pair, solid and translucent surfaces, borders as text color at low alpha…). `--format css` adds those
  principles as a header plus `--bg-gradient`, `--gradient-primary`, `--card`, `--border`, `--hover` and
  `--shadow-md`. Fixed colors, listed in `fixed[]`: in light mode, untinted grey surfaces, status colors too
  faint on the light background and muted text below Lc 60; in dark mode, a background lighter than L 0.20,
  primary and red below the lightness band, faint secondary text, and a hover darker than primary.

The rules draw on Evil Martians (OKLCH, Harmony), Björn Ottosson (Oklab), Radix Colors, Tailwind v4, the
Material dark theme and APCA.

## Development

```bash
npm ci
npm run check         # typecheck + eslint + vitest
npm run skill:build   # regenerate skill/SKILL.md from src/registry.ts
```

- `src/registry.ts` is the single source for the command table, `--help` and `skill/SKILL.md` (a test fails if the
  skill drifts).
- Tests run the built CLI (`dist/`) through `spawnSync` and never touch the network. The fixtures in
  `test/fixtures/` keep reference measurements (lan-topo-card, Fluent Blue 0.2.0).
- When bumping the version, change `package.json`, `src/version.ts` and the `.tgz` name in `install:global` (a
  test checks all three).
- No `apca-w3` or `apcach`: their Limited W3 license is not MIT. APCA comes from Color.js.
- Changes per version: [Releases](https://github.com/ngoviet/palette-axi/releases).

<!-- support:start -->
## Support the project

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

<p align="center"><b>Crypto wallet, BNB Smart Chain (BEP20) only:</b><br><code>0xcbf0402b232cb24b4d998f09a4884f87b5f74750</code></p>

<p align="center"><sub>🇻🇳 VietQR: scan with any Vietnamese banking app, transfer note <code>Ung ho palette-axi</code>. Thank you for keeping this project alive!</sub></p>
<!-- support:end -->

## License

[MIT](LICENSE) © Ngô Đức Việt.
