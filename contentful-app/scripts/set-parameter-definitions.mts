// Defines the app's installation parameters on its AppDefinition, which is
// what makes awsSecretAccessKey a Secret-type parameter (redacted for users,
// raw only inside the function). The config screen saves values under these
// IDs; without the definitions every value would be a plain readable Symbol.
//
// Dry run by default: prints the current and proposed definitions and exits.
// Pass --execute to PUT the change.
//
//   npm run set-parameter-definitions
//   npm run set-parameter-definitions -- --execute
//
// Reads CONTENTFUL_ORG_ID, CONTENTFUL_APP_DEF_ID and CONTENTFUL_ACCESS_TOKEN
// from the environment or contentful-app/.env, and nothing else.

import { loadDotenv, requireEnv } from "./lib/env.mts";

// Keep in sync with AppInstallationParameters (src/types.ts), ConfigScreen and
// functions/s3Proxy.ts.
const INSTALLATION_PARAMETERS = [
  { id: "awsRegion", type: "Symbol", name: "AWS region", required: true, description: "Region the bucket lives in, e.g. us-east-1" },
  { id: "awsAccessKeyId", type: "Symbol", name: "AWS access key ID", required: true, description: "IAM user key with s3:ListBucket on the bucket" },
  { id: "awsSecretAccessKey", type: "Secret", name: "AWS secret access key", required: true, description: "Only readable by the s3Proxy function" },
  { id: "s3Bucket", type: "Symbol", name: "S3 bucket name", required: true },
  { id: "cloudfrontDomain", type: "Symbol", name: "CloudFront domain", required: true, description: "Hostname only, e.g. d1234abcd.cloudfront.net" },
  { id: "maxFiles", type: "Number", name: "Max files per field", required: false, default: 10 },
];

loadDotenv();
const env = requireEnv(["CONTENTFUL_ORG_ID", "CONTENTFUL_APP_DEF_ID", "CONTENTFUL_ACCESS_TOKEN"] as const);
const execute = process.argv.includes("--execute");

const url = `https://api.contentful.com/organizations/${env.CONTENTFUL_ORG_ID}/app_definitions/${env.CONTENTFUL_APP_DEF_ID}`;
const headers = {
  Authorization: `Bearer ${env.CONTENTFUL_ACCESS_TOKEN}`,
  "Content-Type": "application/vnd.contentful.management.v1+json",
};

const getRes = await fetch(url, { headers });
if (!getRes.ok) {
  console.error(`GET app definition failed: HTTP ${getRes.status}\n${await getRes.text()}`);
  process.exit(1);
}
const definition = await getRes.json();

console.log(`App definition: ${definition.name} (${definition.sys.id})`);
console.log(`Locations: ${JSON.stringify(definition.locations ?? [])}`);

// The field editor stores an array of asset objects, which only a JSON object
// field can hold. Warn when the definition would offer the app on other types.
const entryField = (definition.locations ?? []).find((l: { location: string }) => l.location === "entry-field");
const fieldTypes: string[] = (entryField?.fieldTypes ?? []).map((f: { type: string }) => f.type);
if (!fieldTypes.includes("Object")) {
  console.log(
    `\nWARNING: the entry-field location allows field types [${fieldTypes.join(", ")}] but this app needs ` +
      `"Object" (JSON object). Fix it in the web app under organization settings > Apps > this app > Locations. ` +
      `This script does not change locations.`
  );
}
console.log("\nCurrent installation parameter definitions:");
console.log(JSON.stringify(definition.parameters?.installation ?? [], null, 2));
console.log("\nProposed installation parameter definitions:");
console.log(JSON.stringify(INSTALLATION_PARAMETERS, null, 2));

if (!execute) {
  console.log("\nDry run: nothing changed. Re-run with --execute to apply.");
  process.exit(0);
}

// PUT replaces the whole definition, so send every writable field back and
// only change parameters.installation. sys is read-only and must be omitted.
// App definitions are not versioned (no sys.version, verified 2026-10-27), so
// there is no X-Contentful-Version header here.
const { sys: _sys, ...writable } = definition;
const body = {
  ...writable,
  parameters: { ...(writable.parameters ?? {}), installation: INSTALLATION_PARAMETERS },
};

const putRes = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
if (!putRes.ok) {
  console.error(`PUT app definition failed: HTTP ${putRes.status}\n${await putRes.text()}`);
  process.exit(1);
}
const updated = await putRes.json();
console.log(`\nUpdated ${updated.sys.id}. Installation parameters now: ${(updated.parameters?.installation ?? []).map((p: { id: string; type: string }) => `${p.id}:${p.type}`).join(", ")}`);
console.log("Re-save the app configuration in each environment where it is installed so the secret is stored under the Secret definition.");
