import type { BaseAppSDK } from "@contentful/app-sdk";
import type { AppInstallationParameters } from "./types";
import {
  callS3,
  type ObjectsResult,
  type PrefixesResult,
  type SearchResult,
} from "./lib/s3Proxy";

// The config screen is responsible for completeness; Field only needs to know
// whether to render the picker or a "not configured" note. The secret key is
// redacted by the SDK but still present when saved, so a truthy check works.
export function isConfigured(parameters: AppInstallationParameters): boolean {
  return Boolean(
    parameters.awsRegion &&
      parameters.awsAccessKeyId &&
      parameters.awsSecretAccessKey &&
      parameters.s3Bucket &&
      parameters.cloudfrontDomain
  );
}

// Thin wrappers that turn the function's ok:false results into thrown Errors
// so the Dialog's try/catch handles both transport and application failures
// in one place.
export async function fetchPrefixes(sdk: BaseAppSDK, prefix: string = ""): Promise<PrefixesResult> {
  const result = await callS3<PrefixesResult>(sdk, { action: "listPrefixes", prefix });
  if (!result.ok) throw new Error(result.error);
  return result;
}

export async function fetchObjects(
  sdk: BaseAppSDK,
  prefix: string = "",
  pageSize: number = 25,
  continuationToken: string | null = null
): Promise<ObjectsResult> {
  const result = await callS3<ObjectsResult>(sdk, {
    action: "listObjects",
    prefix,
    pageSize,
    continuationToken: continuationToken ?? undefined,
  });
  if (!result.ok) throw new Error(result.error);
  return result;
}

export async function searchObjects(
  sdk: BaseAppSDK,
  query: string,
  prefix: string = "",
  pageSize: number = 25
): Promise<SearchResult> {
  const result = await callS3<SearchResult>(sdk, { action: "search", q: query, prefix, pageSize });
  if (!result.ok) throw new Error(result.error);
  return result;
}

// sessionStorage can throw inside a third-party iframe when storage access is
// blocked. Caching is a convenience, so treat failures as a cache miss.
export function sessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function sessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Ignore: nothing to do without storage.
  }
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  // Clamp so anything above the largest unit still gets a label.
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
