import { AwsClient } from "aws4fetch";
import type {
  AppActionRequest,
  FunctionEventContext,
  FunctionEventHandler,
  FunctionTypeEnum,
} from "@contentful/node-apps-toolkit";

// This function replaces the self-hosted Express proxy that earlier versions
// of this app required. It runs on Contentful's infrastructure, reads the AWS
// credentials from the app's installation parameters (the secret key is a
// Secret-type parameter, so editors never see it) and performs a fixed set of
// read-only ListObjectsV2 calls against one configured bucket.
//
// Why aws4fetch instead of @aws-sdk/client-s3: the Contentful Functions
// sandbox has no Node http/https modules, and the AWS SDK's default Node
// request handler needs them. aws4fetch is a zero-dependency SigV4 signer
// that only uses the global fetch and Web Crypto APIs, both of which the
// sandbox supports. ListObjectsV2 returns XML, parsed below with a small
// purpose-built parser rather than a general XML library.

/**
 * Parameters of the s3Api app action, validated by Contentful against the
 * parametersSchema in contentful-app-manifest.json before this runs.
 * Mirrored in src/lib/s3Proxy.ts.
 */
type S3ActionParameters = {
  action: "listPrefixes" | "listObjects" | "search" | "testConnection";
  prefix?: string;
  pageSize?: number;
  continuationToken?: string;
  q?: string;
};

/** Installation parameter IDs. Keep in sync with the app definition and ConfigScreen. */
type InstallationParameters = {
  awsRegion?: string;
  awsAccessKeyId?: string;
  /** Secret-type parameter: raw value is only visible to this function. */
  awsSecretAccessKey?: string;
  s3Bucket?: string;
  cloudfrontDomain?: string;
};

/** Shape stored verbatim in the entry's JSON field. Mirrored in src/types.ts. */
type S3Asset = {
  key: string;
  name: string;
  size: number | null;
  lastModified: string | null;
  eTag: string | null;
  isImage: boolean;
  displayUrl: string;
};

type S3Prefix = { name: string; path: string; hasChildren: boolean };

type Config = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  cloudfrontDomain: string;
};

type Failure = { ok: false; error: string; status?: number };

const DEFAULT_PAGE_SIZE = 25;
const LIMITS = {
  MIN_PAGE_SIZE: 1,
  MAX_PAGE_SIZE: 200,
  MAX_PREFIX_LENGTH: 500,
  MAX_SEARCH_QUERY_LENGTH: 200,
};
// S3 returns at most 1000 keys per ListObjectsV2 call regardless of max-keys.
const S3_MAX_KEYS = 1000;
// Search filters client-side, so cap the S3 calls per invocation. The
// function also has a hard execution time limit, which this keeps well clear of.
const SEARCH_MAX_PAGES = 10;
const LOG_MAX_CHARS = 2000;

// The egress allowlist in the manifest is *.amazonaws.com, so the request
// host must be derived only from values validated here. Region and bucket
// are editor-visible installation parameters; without these checks a tampered
// value could redirect signed requests (and the key id) to another host.
const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d$/;
const BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
// Hostname only, no scheme, port or path.
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif"];

function logJson(label: string, value: unknown): void {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text && text.length > LOG_MAX_CHARS) {
    text = `${text.slice(0, LOG_MAX_CHARS)}... [truncated, ${text.length} chars total]`;
  }
  console.log(`${label}: ${text}`);
}

function loadConfig(install: InstallationParameters): { ok: true; config: Config } | Failure {
  const missing: string[] = [];
  if (!install.awsRegion) missing.push("AWS region");
  if (!install.awsAccessKeyId) missing.push("AWS access key ID");
  if (!install.awsSecretAccessKey) missing.push("AWS secret access key");
  if (!install.s3Bucket) missing.push("S3 bucket name");
  if (!install.cloudfrontDomain) missing.push("CloudFront domain");
  if (missing.length > 0) {
    return {
      ok: false,
      error: `App is not configured: missing ${missing.join(", ")}. Open the app configuration screen and save all values.`,
    };
  }

  const region = install.awsRegion!.trim();
  const bucket = install.s3Bucket!.trim();
  const cloudfrontDomain = install.cloudfrontDomain!.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  if (!REGION_RE.test(region)) {
    return { ok: false, error: `"${region}" is not a valid AWS region code (expected something like us-east-1).` };
  }
  if (!BUCKET_RE.test(bucket)) {
    return { ok: false, error: `"${bucket}" is not a valid S3 bucket name.` };
  }
  if (!HOSTNAME_RE.test(cloudfrontDomain)) {
    return {
      ok: false,
      error: `"${install.cloudfrontDomain}" is not a valid CloudFront domain. Enter the hostname only, e.g. d1234abcd.cloudfront.net.`,
    };
  }

  return {
    ok: true,
    config: {
      region,
      bucket,
      cloudfrontDomain,
      accessKeyId: install.awsAccessKeyId!.trim(),
      secretAccessKey: install.awsSecretAccessKey!,
    },
  };
}

// Minimal XML helpers for the fixed ListBucketResult / Error schemas. S3
// escapes keys as XML text, so every extracted value is unescaped once.
function unescapeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function xmlText(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? unescapeXml(match[1]) : undefined;
}

function xmlBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

// Each path segment is encoded but the "/" separators are kept, so keys with
// spaces or "#", "?", "+" still map onto the CloudFront origin path.
function buildAssetUrl(key: string, cloudfrontDomain: string): string {
  return `https://${cloudfrontDomain}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function fileName(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1];
}

function isImageFile(key: string): boolean {
  const lower = key.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// S3 "folders" are key prefixes ending in "/". Without the trailing slash the
// prefix also matches siblings with the same stem ("img" matches "img-old/").
function normalizePrefix(prefix: string): string {
  return prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
}

type ListResult = {
  contents: S3Asset[];
  commonPrefixes: S3Prefix[];
  isTruncated: boolean;
  nextContinuationToken: string | null;
};

type ListOptions = {
  prefix: string;
  delimiter?: "/";
  maxKeys: number;
  continuationToken?: string | null;
};

/**
 * One signed ListObjectsV2 call. Uses the path-style endpoint so the host
 * depends only on the validated region, and so bucket names containing dots
 * work over TLS. Every failure is mapped to a frontend-ready message; the
 * raw AWS error is logged for the function log only.
 */
async function listObjectsV2(
  client: AwsClient,
  config: Config,
  options: ListOptions
): Promise<{ ok: true; result: ListResult } | Failure> {
  const params = new URLSearchParams({ "list-type": "2", "max-keys": String(options.maxKeys) });
  if (options.prefix) params.set("prefix", options.prefix);
  if (options.delimiter) params.set("delimiter", options.delimiter);
  if (options.continuationToken) params.set("continuation-token", options.continuationToken);

  const url = `https://s3.${config.region}.amazonaws.com/${config.bucket}?${params.toString()}`;
  console.log(`s3 request: GET ${url}`);
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await client.fetch(url, { method: "GET" });
  } catch (error) {
    console.log(`s3 request failed after ${Date.now() - startedAt}ms: ${String(error)}`);
    return { ok: false, error: `Could not reach S3 in region ${config.region}.` };
  }

  const xml = await response.text();
  console.log(`s3 response: HTTP ${response.status} in ${Date.now() - startedAt}ms, ${xml.length} bytes`);

  if (!response.ok) {
    const code = xmlText(xml, "Code") ?? "UnknownError";
    const message = xmlText(xml, "Message") ?? "";
    console.log(`s3 error: ${code} ${message}`);

    // PermanentRedirect is what S3 returns when the bucket lives in another
    // region than the one addressed; surface it as a configuration hint.
    if (response.status === 301 || code === "PermanentRedirect") {
      return {
        ok: false,
        status: response.status,
        error: `Bucket "${config.bucket}" is not in region ${config.region}. Check the AWS region setting.`,
      };
    }
    if (response.status === 403) {
      return {
        ok: false,
        status: 403,
        error:
          `S3 rejected the request (${code}). Check the access key ID and secret, ` +
          `and that the IAM user has s3:ListBucket on "${config.bucket}".`,
      };
    }
    if (response.status === 404 || code === "NoSuchBucket") {
      return { ok: false, status: 404, error: `Bucket "${config.bucket}" was not found.` };
    }
    return { ok: false, status: response.status, error: `S3 returned HTTP ${response.status} (${code}).` };
  }

  const contents = xmlBlocks(xml, "Contents").map((block) => {
    const key = xmlText(block, "Key") ?? "";
    const size = xmlText(block, "Size");
    const lastModified = xmlText(block, "LastModified");
    const eTag = xmlText(block, "ETag");
    return {
      key,
      name: fileName(key),
      size: size !== undefined ? Number(size) : null,
      lastModified: lastModified ?? null,
      eTag: eTag ? eTag.replace(/"/g, "") : null,
      isImage: isImageFile(key),
      displayUrl: buildAssetUrl(key, config.cloudfrontDomain),
    };
  });

  const commonPrefixes = xmlBlocks(xml, "CommonPrefixes").map((block) => {
    const path = xmlText(block, "Prefix") ?? "";
    const parts = path.replace(/\/$/, "").split("/");
    // One delimited listing cannot tell whether a folder has sub-folders
    // without another request, so the UI always offers to expand.
    return { name: parts[parts.length - 1], path, hasChildren: true };
  });

  return {
    ok: true,
    result: {
      contents,
      commonPrefixes,
      isTruncated: xmlText(xml, "IsTruncated") === "true",
      nextContinuationToken: xmlText(xml, "NextContinuationToken") ?? null,
    },
  };
}

function validatePrefix(value: unknown): { ok: true; prefix: string } | Failure {
  if (value === undefined || value === null || value === "") return { ok: true, prefix: "" };
  if (typeof value !== "string") return { ok: false, error: "prefix must be a string." };
  if (value.length > LIMITS.MAX_PREFIX_LENGTH) {
    return { ok: false, error: `prefix exceeds maximum length of ${LIMITS.MAX_PREFIX_LENGTH}.` };
  }
  // ".." has no traversal meaning in S3 keys, but rejecting it keeps the
  // function from being used to probe unexpected key shapes.
  if (value.includes("..")) return { ok: false, error: "Invalid prefix format." };
  return { ok: true, prefix: normalizePrefix(value) };
}

function validatePageSize(value: unknown): { ok: true; pageSize: number } | Failure {
  if (value === undefined || value === null) return { ok: true, pageSize: DEFAULT_PAGE_SIZE };
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < LIMITS.MIN_PAGE_SIZE ||
    value > LIMITS.MAX_PAGE_SIZE
  ) {
    return { ok: false, error: `pageSize must be an integer between ${LIMITS.MIN_PAGE_SIZE} and ${LIMITS.MAX_PAGE_SIZE}.` };
  }
  return { ok: true, pageSize: value };
}

/**
 * Entry point for each s3Api app action call. Thin logging wrapper around
 * run() so every return path is captured once. event.body never contains
 * credentials, so it is safe to log verbatim.
 */
export const handler: FunctionEventHandler<FunctionTypeEnum.AppActionCall> = async (
  event: AppActionRequest<"Custom", S3ActionParameters>,
  context: FunctionEventContext
) => {
  logJson("request parameters", event.body);
  const startedAt = Date.now();
  const result = await run(event, context);
  logJson(`function result (${Date.now() - startedAt}ms)`, result);
  return result;
};

/**
 * Dispatches the requested action. Always resolves to { ok: true, ... } or
 * { ok: false, error }; it never throws, so the frontend can treat a rejected
 * action call as "function not deployed / app not installed".
 */
const run = async (
  event: AppActionRequest<"Custom", S3ActionParameters>,
  context: FunctionEventContext
) => {
  const loaded = loadConfig((context.appInstallationParameters ?? {}) as InstallationParameters);
  if (!loaded.ok) return loaded;
  const { config } = loaded;

  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: config.region,
  });

  const { action } = event.body;
  const prefixCheck = validatePrefix(event.body.prefix);
  if (!prefixCheck.ok) return prefixCheck;
  const { prefix } = prefixCheck;

  switch (action) {
    case "testConnection": {
      const res = await listObjectsV2(client, config, { prefix: "", delimiter: "/", maxKeys: 1 });
      if (!res.ok) return res;
      return { ok: true, bucket: config.bucket, region: config.region };
    }

    case "listPrefixes": {
      const res = await listObjectsV2(client, config, { prefix, delimiter: "/", maxKeys: S3_MAX_KEYS });
      if (!res.ok) return res;
      return {
        ok: true,
        bucket: config.bucket,
        prefix,
        prefixCount: res.result.commonPrefixes.length,
        prefixes: res.result.commonPrefixes,
      };
    }

    case "listObjects": {
      const pageCheck = validatePageSize(event.body.pageSize);
      if (!pageCheck.ok) return pageCheck;
      const token = event.body.continuationToken;
      if (token !== undefined && typeof token !== "string") {
        return { ok: false, error: "continuationToken must be a string." };
      }
      const res = await listObjectsV2(client, config, {
        prefix,
        delimiter: "/",
        maxKeys: pageCheck.pageSize,
        continuationToken: token || null,
      });
      if (!res.ok) return res;
      // Folder placeholder objects (zero-byte keys equal to the prefix) are
      // not selectable assets.
      const objects = res.result.contents.filter((o) => o.key !== prefix);
      return {
        ok: true,
        bucket: config.bucket,
        prefix,
        objectCount: objects.length,
        isTruncated: res.result.isTruncated,
        nextContinuationToken: res.result.nextContinuationToken,
        objects,
      };
    }

    case "search": {
      const q = event.body.q;
      if (typeof q !== "string" || q.trim().length === 0) {
        return { ok: false, error: "q (search query) is required." };
      }
      if (q.length > LIMITS.MAX_SEARCH_QUERY_LENGTH) {
        return { ok: false, error: `Search query exceeds maximum length of ${LIMITS.MAX_SEARCH_QUERY_LENGTH}.` };
      }
      const pageCheck = validatePageSize(event.body.pageSize);
      if (!pageCheck.ok) return pageCheck;
      const maxResults = pageCheck.pageSize;
      const lowerQuery = q.toLowerCase();

      // S3 has no server-side filtering, so page through keys under the
      // prefix (no delimiter: recursive) and filter filenames locally.
      const matches: S3Asset[] = [];
      let continuationToken: string | null = null;
      let pagesFetched = 0;
      let stoppedEarly = false;
      do {
        const res = await listObjectsV2(client, config, {
          prefix,
          maxKeys: S3_MAX_KEYS,
          continuationToken,
        });
        if (!res.ok) return res;
        pagesFetched++;
        for (const obj of res.result.contents) {
          if (fileName(obj.key).toLowerCase().includes(lowerQuery)) matches.push(obj);
        }
        continuationToken = res.result.nextContinuationToken;
        if (continuationToken && (matches.length >= maxResults || pagesFetched >= SEARCH_MAX_PAGES)) {
          stoppedEarly = true;
          break;
        }
      } while (continuationToken);

      return {
        ok: true,
        bucket: config.bucket,
        prefix,
        query: q,
        objectCount: Math.min(matches.length, maxResults),
        hasMore: stoppedEarly || matches.length > maxResults,
        objects: matches.slice(0, maxResults),
      };
    }

    default:
      return { ok: false, error: `Unsupported action: ${String(action)}` };
  }
};
