import type { BaseAppSDK } from "@contentful/app-sdk";
import type { S3Asset, S3Prefix } from "../types";

// Mirror of the request/response shapes in functions/s3Proxy.ts. Kept as a
// separate copy on purpose: the functions/ tree has its own tsconfig and is
// bundled independently, so sharing a module would couple the two builds.

export type S3Request = {
  action: "listPrefixes" | "listObjects" | "search" | "testConnection";
  prefix?: string;
  pageSize?: number;
  continuationToken?: string;
  q?: string;
};

export type S3Failure = { ok: false; error: string; status?: number };

export type TestConnectionResult = { ok: true; bucket: string; region: string };

export type PrefixesResult = {
  ok: true;
  bucket: string;
  prefix: string;
  prefixCount: number;
  prefixes: S3Prefix[];
};

export type ObjectsResult = {
  ok: true;
  bucket: string;
  prefix: string;
  objectCount: number;
  isTruncated: boolean;
  nextContinuationToken: string | null;
  objects: S3Asset[];
};

export type SearchResult = {
  ok: true;
  bucket: string;
  prefix: string;
  query: string;
  objectCount: number;
  hasMore: boolean;
  objects: S3Asset[];
};

// Must match the action id in contentful-app-manifest.json.
export const APP_ACTION_ID = "s3Api";

export class S3ProxyUnavailableError extends Error {
  /** The underlying CMA error, kept for debugging in the browser console. */
  readonly detail: unknown;

  constructor(detail: unknown) {
    super(
      "Could not invoke the S3 proxy function. Make sure the app is installed in this " +
        "environment, the app bundle is uploaded, and the s3Api app action exists (see README)."
    );
    this.name = "S3ProxyUnavailableError";
    this.detail = detail;
  }
}

/**
 * Invokes the s3Api app action and returns the function's JSON result. Throws
 * S3ProxyUnavailableError when the action call itself fails (app not
 * installed, bundle missing, action not created); an ok:false result from the
 * function is returned, not thrown, so callers can show its message as-is.
 */
export async function callS3<T extends { ok: true }>(
  sdk: BaseAppSDK,
  parameters: S3Request
): Promise<T | S3Failure> {
  const appDefinitionId = sdk.ids.app;
  if (!appDefinitionId) {
    return { ok: false, error: "App definition id is not available in this context." };
  }

  let call: unknown;
  try {
    call = await sdk.cma.appActionCall.createWithResponse(
      {
        spaceId: sdk.ids.space,
        environmentId: sdk.ids.environment,
        appDefinitionId,
        appActionId: APP_ACTION_ID,
      },
      {
        // The parametersSchema has additionalProperties: false and rejects
        // explicit undefined/empty values, so only send what is set.
        parameters: Object.fromEntries(
          Object.entries(parameters).filter(([, v]) => v !== undefined && v !== null && v !== "")
        ),
      }
    );
  } catch (error) {
    throw new S3ProxyUnavailableError(error);
  }

  // The function's return value arrives JSON-serialized in response.body.
  const body: unknown = (call as { response?: { body?: unknown } })?.response?.body;
  const parsed: unknown = typeof body === "string" ? JSON.parse(body) : body;
  if (!parsed || typeof parsed !== "object" || typeof (parsed as { ok?: unknown }).ok !== "boolean") {
    return { ok: false, error: "Unexpected response from the S3 proxy function." };
  }
  return parsed as T | S3Failure;
}
