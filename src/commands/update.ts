import { parseCommandArgs } from "../args.js";
import { VERSION } from "../version.js";

// palette-axi không đăng lên npm: lệnh `update` có sẵn của axi-sdk-js (hỏi npm registry) luôn lỗi.
// Lệnh này thay nó, không gọi mạng: chỉ ra bản đang chạy và cách cài bản mới từ GitHub Releases.

export const REPO = "ngoviet/palette-axi";

export const UPDATE_HELP = `usage: palette-axi update [--check]
description: Show the installed version and how to install the latest GitHub release (palette-axi is not on the npm registry). Makes no network call
flags[1]:
  --check: same output; accepted for compatibility with other AXI tools
`;

export async function updateCommand(args: string[]): Promise<Record<string, unknown>> {
  parseCommandArgs("update", args, { check: { type: "boolean", hint: "--check" } });
  return {
    installed: VERSION,
    source: `GitHub releases (https://github.com/${REPO}/releases), not the npm registry`,
    help: [
      `Run \`gh release view --repo ${REPO} --json tagName --jq .tagName\` to see the latest version`,
      `Run \`npm install -g https://github.com/${REPO}/releases/download/v<version>/palette-axi-<version>.tgz\` to install it`,
    ],
  };
}
