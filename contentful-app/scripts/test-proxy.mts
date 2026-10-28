// Local harness for functions/s3Proxy.ts: imports the real handler and calls
// it directly with a synthetic event/context, so the function logic and the
// live S3 API can be exercised without uploading a bundle or going through
// the CMA app-action round trip.
//
// What this deliberately bypasses (so it is NOT an end-to-end test):
// - Contentful's parametersSchema validation from contentful-app-manifest.json
// - the function sandbox's allowNetworks egress restriction
// - real installation parameters (credentials come from env vars instead)
//
// Usage (Node >= 22.18 for built-in TypeScript type stripping):
//   npm run test:proxy -- testConnection
//   npm run test:proxy -- listPrefixes [prefix]
//   npm run test:proxy -- listObjects [prefix] [pageSize] [continuationToken]
//   npm run test:proxy -- search <q> [prefix] [pageSize]
//
// Credentials come from AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
// S3_BUCKET_NAME and CLOUDFRONT_DOMAIN, from the environment or from .env.
// These are the same names the retired Express proxy used, so its .env can be
// copied over.

import { handler } from "../functions/s3Proxy.ts";
import { loadDotenv, requireEnv } from "./lib/env.mts";

function usage(message?: string): never {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    [
      "Usage:",
      "  npm run test:proxy -- testConnection",
      "  npm run test:proxy -- listPrefixes [prefix]",
      "  npm run test:proxy -- listObjects [prefix] [pageSize] [continuationToken]",
      "  npm run test:proxy -- search <q> [prefix] [pageSize]",
      "",
      "Requires AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME",
      "and CLOUDFRONT_DOMAIN (env or contentful-app/.env).",
    ].join("\n")
  );
  process.exit(1);
}

loadDotenv();
const env = requireEnv([
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "S3_BUCKET_NAME",
  "CLOUDFRONT_DOMAIN",
] as const);

const [action, ...args] = process.argv.slice(2);
if (!action) usage();

function intArg(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  if (!/^\d+$/.test(value)) usage(`${name} must be an integer, got "${value}"`);
  return Number(value);
}

let body: Record<string, unknown>;
switch (action) {
  case "testConnection":
    body = { action };
    break;
  case "listPrefixes":
    body = { action, prefix: args[0] ?? "" };
    break;
  case "listObjects":
    body = {
      action,
      prefix: args[0] ?? "",
      pageSize: intArg(args[1], "pageSize"),
      continuationToken: args[2],
    };
    break;
  case "search":
    if (!args[0]) usage("search needs a query argument");
    body = { action, q: args[0], prefix: args[1] ?? "", pageSize: intArg(args[2], "pageSize") };
    break;
  default:
    // Unknown actions pass through on purpose to exercise the handler's own
    // "Unsupported action" branch.
    body = { action };
}
// The real action call never carries undefined values; strip them here too.
body = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));

// Only the fields the handler reads are provided; the casts stand in for the
// full FunctionEvent/FunctionEventContext shapes Contentful would send.
const event = { type: "appaction.call", body, headers: {} } as any;
const context = {
  appInstallationParameters: {
    awsRegion: env.AWS_REGION,
    awsAccessKeyId: env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    s3Bucket: env.S3_BUCKET_NAME,
    cloudfrontDomain: env.CLOUDFRONT_DOMAIN,
  },
} as any;

const result = await handler(event, context);
// The handler already logs its request/response summaries; this is the JSON
// the frontend would receive as response.body.
console.log("\nresult:");
console.log(JSON.stringify(result, null, 2));
if ((result as any)?.ok === false) process.exit(2);
