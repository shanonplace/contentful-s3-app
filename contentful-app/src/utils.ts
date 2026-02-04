import type {
  AppInstallationParameters,
  PrefixesResponse,
  ObjectsResponse,
  SearchResponse,
} from "./types";

export function getProxyUrl(parameters: AppInstallationParameters): string {
  if (!parameters.proxyUrl) {
    throw new Error("S3 Proxy URL is not configured");
  }
  return parameters.proxyUrl;
}

export function getApiKey(parameters: AppInstallationParameters): string {
  if (!parameters.apiKey) {
    throw new Error("API Key is not configured");
  }
  return parameters.apiKey;
}

export async function fetchPrefixes(
  proxyUrl: string,
  apiKey: string,
  prefix: string = ""
): Promise<PrefixesResponse> {
  const url = `${proxyUrl}/api/s3/prefixes?prefix=${encodeURIComponent(prefix)}`;
  const response = await fetch(url, {
    headers: {
      "X-API-Key": apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Failed to fetch prefixes: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchObjects(
  proxyUrl: string,
  apiKey: string,
  prefix: string = "",
  pageSize: number = 25,
  continuationToken: string | null = null
): Promise<ObjectsResponse> {
  let url = `${proxyUrl}/api/s3/objects?prefix=${encodeURIComponent(prefix)}&pageSize=${pageSize}`;
  if (continuationToken) {
    url += `&continuationToken=${encodeURIComponent(continuationToken)}`;
  }

  const response = await fetch(url, {
    headers: {
      "X-API-Key": apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Failed to fetch objects: ${response.statusText}`);
  }

  return response.json();
}

export async function searchObjects(
  proxyUrl: string,
  apiKey: string,
  query: string,
  prefix: string = "",
  pageSize: number = 25
): Promise<SearchResponse> {
  const url = `${proxyUrl}/api/s3/search?q=${encodeURIComponent(query)}&prefix=${encodeURIComponent(prefix)}&pageSize=${pageSize}`;

  const response = await fetch(url, {
    headers: {
      "X-API-Key": apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Failed to search objects: ${response.statusText}`);
  }

  return response.json();
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "N/A";
  }
}

export function getFolderNameFromPath(path: string): string {
  if (!path) return "Root";
  const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;
  const parts = cleanPath.split("/");
  return parts[parts.length - 1] || "Root";
}

export function getParentPath(path: string): string {
  if (!path) return "";
  const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;
  const parts = cleanPath.split("/");
  parts.pop();
  return parts.length > 0 ? parts.join("/") + "/" : "";
}
