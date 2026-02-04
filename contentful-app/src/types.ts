export interface S3Asset {
  key: string;
  name: string;
  size: number | null;
  lastModified: string | null;
  eTag: string | null;
  isImage: boolean;
  displayUrl: string;
}

export interface S3Prefix {
  name: string;
  path: string;
  hasChildren: boolean;
  children?: S3Prefix[];
}

export interface AppInstallationParameters {
  proxyUrl?: string;
  apiKey?: string;
  cloudfrontDomain?: string;
  maxFiles?: number;
}

export interface DialogInvocationParameters {
  maxFiles: number;
  currentAssets: S3Asset[];
}

export interface PrefixesResponse {
  success: boolean;
  bucket: string;
  prefix: string;
  prefixCount: number;
  prefixes: S3Prefix[];
}

export interface ObjectsResponse {
  success: boolean;
  bucket: string;
  prefix: string;
  objectCount: number;
  isTruncated: boolean;
  nextContinuationToken: string | null;
  objects: S3Asset[];
}

export interface SearchResponse {
  success: boolean;
  bucket: string;
  prefix: string;
  query: string;
  objectCount: number;
  hasMore: boolean;
  objects: S3Asset[];
}
