import {
  S3Client,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

class S3Error extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "S3Error";
    this.statusCode = statusCode;
  }
}

function getConfig() {
  return {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: process.env.S3_BUCKET_NAME,
    cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN,
  };
}

function validateConfig(config) {
  const required = {
    region: "AWS_REGION",
    accessKeyId: "AWS_ACCESS_KEY_ID",
    secretAccessKey: "AWS_SECRET_ACCESS_KEY",
    bucket: "S3_BUCKET_NAME",
    cloudfrontDomain: "CLOUDFRONT_DOMAIN",
  };

  const missing = [];
  for (const [key, envVar] of Object.entries(required)) {
    if (!config[key]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new S3Error(`Missing environment variables: ${missing.join(", ")}`, 500);
  }
}

function getS3Client(config) {
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function buildAssetUrl(key, cloudfrontDomain) {
  return `https://${cloudfrontDomain}/${key}`;
}

function getFileNameFromKey(key) {
  const parts = key.split("/");
  return parts[parts.length - 1];
}

function isImageFile(key) {
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico"];
  const lowerKey = key.toLowerCase();
  return imageExtensions.some((ext) => lowerKey.endsWith(ext));
}

// List "folders" (common prefixes) at a given path
export async function listPrefixes(prefix = "") {
  const config = getConfig();
  validateConfig(config);

  const client = getS3Client(config);

  // Ensure prefix ends with / if not empty (to list contents of folder)
  const normalizedPrefix = prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;

  const command = new ListObjectsV2Command({
    Bucket: config.bucket,
    Prefix: normalizedPrefix,
    Delimiter: "/",
    MaxKeys: 1000,
  });

  const response = await client.send(command);

  const prefixes = (response.CommonPrefixes || []).map((cp) => {
    const path = cp.Prefix;
    const parts = path.replace(/\/$/, "").split("/");
    const name = parts[parts.length - 1];
    return {
      name,
      path,
      hasChildren: true, // Assume folders may have children
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

// List objects in a folder with pagination
export async function listObjects(prefix = "", pageSize = 25, continuationToken = null) {
  const config = getConfig();
  validateConfig(config);

  const client = getS3Client(config);

  // Ensure prefix ends with / if not empty
  const normalizedPrefix = prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;

  const commandParams = {
    Bucket: config.bucket,
    Prefix: normalizedPrefix,
    Delimiter: "/",
    MaxKeys: pageSize,
  };

  if (continuationToken) {
    commandParams.ContinuationToken = continuationToken;
  }

  const command = new ListObjectsV2Command(commandParams);
  const response = await client.send(command);

  const objects = (response.Contents || [])
    .filter((obj) => obj.Key !== normalizedPrefix) // Exclude the prefix itself
    .map((obj) => ({
      key: obj.Key,
      name: getFileNameFromKey(obj.Key),
      size: obj.Size,
      lastModified: obj.LastModified?.toISOString() || null,
      eTag: obj.ETag?.replace(/"/g, "") || null,
      isImage: isImageFile(obj.Key),
      displayUrl: buildAssetUrl(obj.Key, config.cloudfrontDomain),
    }));

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

// Search objects by filename (client-side filtering)
export async function searchObjects(query, prefix = "", maxResults = 25) {
  const config = getConfig();
  validateConfig(config);

  const client = getS3Client(config);

  const normalizedPrefix = prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
  const lowerQuery = query.toLowerCase();

  const allObjects = [];
  let continuationToken = null;
  let iterations = 0;
  const maxIterations = 10; // Limit API calls for safety

  // Paginate through objects to find matches
  do {
    const commandParams = {
      Bucket: config.bucket,
      Prefix: normalizedPrefix,
      MaxKeys: 1000,
    };

    if (continuationToken) {
      commandParams.ContinuationToken = continuationToken;
    }

    const command = new ListObjectsV2Command(commandParams);
    const response = await client.send(command);

    const matches = (response.Contents || [])
      .filter((obj) => {
        const fileName = getFileNameFromKey(obj.Key).toLowerCase();
        return fileName.includes(lowerQuery);
      })
      .map((obj) => ({
        key: obj.Key,
        name: getFileNameFromKey(obj.Key),
        size: obj.Size,
        lastModified: obj.LastModified?.toISOString() || null,
        eTag: obj.ETag?.replace(/"/g, "") || null,
        isImage: isImageFile(obj.Key),
        displayUrl: buildAssetUrl(obj.Key, config.cloudfrontDomain),
      }));

    allObjects.push(...matches);

    // Stop if we have enough results
    if (allObjects.length >= maxResults) {
      break;
    }

    continuationToken = response.NextContinuationToken;
    iterations++;
  } while (continuationToken && iterations < maxIterations);

  // Return only requested number of results
  const results = allObjects.slice(0, maxResults);

  return {
    success: true,
    bucket: config.bucket,
    prefix: normalizedPrefix,
    query,
    objectCount: results.length,
    hasMore: allObjects.length > maxResults || iterations >= maxIterations,
    objects: results,
  };
}
