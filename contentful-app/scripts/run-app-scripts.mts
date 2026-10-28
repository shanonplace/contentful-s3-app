// Launcher for the two deploy commands of @contentful/app-scripts. It loads
// contentful-app/.env itself and passes the values as explicit flags in --ci
// mode, so `npm run upload` and `npm run upsert-actions` work without the
// caller exporting variables first.
//
// Why not call contentful-app-scripts directly from package.json:
// - "$CONTENTFUL_ACCESS_TOKEN" in an npm script is expanded by the shell,
//   which has not loaded .env. The CLI then receives an empty --token and
//   treats it as the boolean `true`, failing with a 401.
// - Without --ci the CLI falls back to a browser OAuth login and caches the
//   resulting token into .env on its own. That hidden fallback is exactly what
//   this project avoids: credentials come from .env, explicitly, or it fails.
//
// Usage:
//   npm run upload
//   npm run upsert-actions
//   node scripts/run-app-scripts.mts upload --comment "v2"   (extra flags pass through)

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadDotenv, requireEnv } from "./lib/env.mts";

const COMMANDS: Record<string, string[]> = {
  upload: ["upload", "--ci", "--bundle-dir", "./build"],
  "upsert-actions": ["upsert-actions", "--ci"],
};

const [command, ...extra] = process.argv.slice(2);
if (!command || !COMMANDS[command]) {
  console.error(`Usage: node scripts/run-app-scripts.mts <${Object.keys(COMMANDS).join("|")}> [extra flags]`);
  process.exit(1);
}

loadDotenv();
const env = requireEnv(["CONTENTFUL_ORG_ID", "CONTENTFUL_APP_DEF_ID", "CONTENTFUL_ACCESS_TOKEN"] as const);

const args = [
  ...COMMANDS[command],
  "--organization-id", env.CONTENTFUL_ORG_ID,
  "--definition-id", env.CONTENTFUL_APP_DEF_ID,
  "--token", env.CONTENTFUL_ACCESS_TOKEN,
  ...extra,
];

// Resolve the binary relative to this file, not the cwd, so the script works
// from any directory. Echo the command with the token masked.
const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules", ".bin", "contentful-app-scripts");
console.log(`> contentful-app-scripts ${args.map((a) => (a === env.CONTENTFUL_ACCESS_TOKEN ? "<token>" : a)).join(" ")}`);

const result = spawnSync(bin, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
