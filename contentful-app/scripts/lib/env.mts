import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Minimal .env loader for the scripts/ harnesses. Reads exactly one file, the
// .env next to package.json, and nothing else: no home-directory config, no
// AWS CLI profile, no cached login. Variables already set in the environment
// win over .env values (same precedence as dotenv).
export function loadDotenv(): void {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");
  let text: string;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return; // no .env is fine when the variables are set directly
  }
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
}

// Returns the named variables or exits with one message listing every
// missing one, so a half-filled .env fails on the first run, not per variable.
export function requireEnv<K extends string>(names: readonly K[]): Record<K, string> {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length > 0) {
    console.error(`Error: missing environment variables: ${missing.join(", ")}`);
    console.error("Set them in contentful-app/.env (see .env.example) or in the environment.");
    process.exit(1);
  }
  return Object.fromEntries(names.map((n) => [n, process.env[n] as string])) as Record<K, string>;
}
