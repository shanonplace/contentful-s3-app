import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const REQUIRED_ENV = {
  region: "AWS_REGION",
  accessKeyId: "AWS_ACCESS_KEY_ID",
  secretAccessKey: "AWS_SECRET_ACCESS_KEY",
  bucket: "S3_BUCKET_NAME",
  cloudfrontDomain: "CLOUDFRONT_DOMAIN",
};

// S3 listing calls cap out at 1000 keys per request regardless of MaxKeys.
const S3_MAX_KEYS = 1000;

// Search paginates through the bucket client-side, so cap the number of S3
// calls per request to bound cost and latency on large buckets.
const SEARCH_MAX_PAGES = 10;

export class S3Error extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "S3Error";
    this.statusCode = statusCode;
  }
}

// Read and validate the S3 configuration from the environment. Every value is
// required and comes from the proxy's .env only: there is deliberately no
// fallback to the AWS SDK's default credential chain, so a misconfigured
// server fails loudly instead of silently listing a different account's bucket.
export function loadConfig() {
  const config = {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: process.env.S3_BUCKET_NAME,
    cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN,
  };

  const missing = Object.entries(REQUIRED_ENV)
    .filter(([key]) => !config[key])
    .map(([, envVar]) => envVar);

  if (missing.length > 0) {
    throw new S3Error(
      `Missing environment variables: ${missing.join(", ")}`,
      500,
    );
  }

  return config;
}

// One client for the lifetime of the process. Creating a client per request
// (as the original code did) throws away the SDK's connection pool and
// credential cache on every call.
let cached = null;

function getContext() {
  if (!cached) {
    const config = loadConfig();
    const client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cached = { config, client };
  }
  return cached;
}

// Keys can contain spaces, "#", "?", "+" and other characters that are not
// URL-safe. Encode each path segment but keep the "/" separators so the URL
// still maps onto the CloudFront origin path.
function buildAssetUrl(key, cloudfrontDomain) {
  const encodedPath = key.split("/").map(encodeURIComponent).join("/");
  return `https://${cloudfrontDomain}/${encodedPath}`;
}

function getFileNameFromKey(key) {
  const parts = key.split("/");
  return parts[parts.length - 1];
}

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".avif",
];

function isImageFile(key) {
  const lowerKey = key.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lowerKey.endsWith(ext));
}

// Shape returned to the Contentful app for every S3 object. The app stores
// this object verbatim in the entry field, so changing it is a data-model change.
function toAsset(obj, cloudfrontDomain) {
  return {
    key: obj.Key,
    name: getFileNameFromKey(obj.Key),
    size: obj.Size ?? null,
    lastModified: obj.LastModified?.toISOString() || null,
    eTag: obj.ETag?.replace(/"/g, "") || null,
    isImage: isImageFile(obj.Key),
    displayUrl: buildAssetUrl(obj.Key, cloudfrontDomain),
  };
}

// S3 "folders" are just key prefixes ending in "/". A prefix without the
// trailing slash would match sibling folders with the same stem
// (e.g. "img" also matches "img-old/"), so always add it.
function normalizePrefix(prefix) {
  return prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
}

// AWS SDK v3 errors carry the HTTP status in $metadata, not statusCode.
// Re-wrap so the route layer can return 403/404 instead of a blanket 500.
function wrapAwsError(error) {
  if (error instanceof S3Error) return error;
  const status = error?.$metadata?.httpStatusCode;
  const message = error?.name
    ? `${error.name}: ${error.message}`
    : error?.message || "Unknown S3 error";
  return new S3Error(message, status && status >= 400 ? status : 500);
}

async function send(client, params) {
  try {
    return await client.send(new ListObjectsV2Command(params));
  } catch (error) {
    throw wrapAwsError(error);
  }
}

// List "folders" (common prefixes) directly under a prefix.
export async function listPrefixes(prefix = "") {
  const { config, client } = getContext();
  const normalizedPrefix = normalizePrefix(prefix);

  const response = await send(client, {
    Bucket: config.bucket,
    Prefix: normalizedPrefix,
    Delimiter: "/",
    MaxKeys: S3_MAX_KEYS,
  });

  const prefixes = (response.CommonPrefixes || []).map((cp) => {
    const path = cp.Prefix;
    const parts = path.replace(/\/$/, "").split("/");
    return {
      name: parts[parts.length - 1],
      path,
      // A single delimited listing cannot tell whether a folder has
      // sub-folders without another request, so let the UI offer to expand.
      hasChildren: true,
    };
  });

  return {
    success: true,
    bucket: config.bucket,
    prefix: normalizedPrefix,
    prefixCount: prefixes.length,
    prefixes,
  };
}

// List objects directly under a prefix, one page at a time.
export async function listObjects(
  prefix = "",
  pageSize = 25,
  continuationToken = null,
) {
  const { config, client } = getContext();
  const normalizedPrefix = normalizePrefix(prefix);

  const params = {
    Bucket: config.bucket,
    Prefix: normalizedPrefix,
    Delimiter: "/",
    MaxKeys: pageSize,
  };
  if (continuationToken) {
    params.ContinuationToken = continuationToken;
  }

  const response = await send(client, params);

  const objects = (response.Contents || [])
    // Folder placeholder objects (zero-byte keys equal to the prefix) are not
    // selectable assets.
    .filter((obj) => obj.Key !== normalizedPrefix)
    .map((obj) => toAsset(obj, config.cloudfrontDomain));

  return {
    success: true,
    bucket: config.bucket,
    prefix: normalizedPrefix,
    objectCount: objects.length,
    isTruncated: response.IsTruncated || false,
    nextContinuationToken: response.NextContinuationToken || null,
    objects,
  };
}

// Search by filename substring under a prefix (recursively, no delimiter).
// S3 has no server-side filtering, so this pages through keys and filters
// locally. Results are capped at maxResults and SEARCH_MAX_PAGES S3 calls.
export async function searchObjects(query, prefix = "", maxResults = 25) {
  const { config, client } = getContext();
  const normalizedPrefix = normalizePrefix(prefix);
  const lowerQuery = query.toLowerCase();

  const matches = [];
  let continuationToken = null;
  let pagesFetched = 0;
  let stoppedEarly = false;

  do {
    const params = {
      Bucket: config.bucket,
      Prefix: normalizedPrefix,
      MaxKeys: S3_MAX_KEYS,
    };
    if (continuationToken) {
      params.ContinuationToken = continuationToken;
    }

    const response = await send(client, params);
    pagesFetched++;

    for (const obj of response.Contents || []) {
      if (getFileNameFromKey(obj.Key).toLowerCase().includes(lowerQuery)) {
        matches.push(toAsset(obj, config.cloudfrontDomain));
      }
    }

    continuationToken = response.NextContinuationToken || null;

    // Stop once we have a full page of results or hit the call budget. In
    // either case more matches may exist further into the bucket.
    if (
      continuationToken &&
      (matches.length >= maxResults || pagesFetched >= SEARCH_MAX_PAGES)
    ) {
      stoppedEarly = true;
      break;
    }
  } while (continuationToken);

  return {
    success: true,
    bucket: config.bucket,
    prefix: normalizedPrefix,
    query,
    objectCount: Math.min(matches.length, maxResults),
    hasMore: stoppedEarly || matches.length > maxResults,
    objects: matches.slice(0, maxResults),
  };
}
