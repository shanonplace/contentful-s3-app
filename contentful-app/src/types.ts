// Mirrors the object shape returned by the s3Proxy function's listObjects and
// search actions. Stored verbatim in the entry's JSON field.
//
// Declared as a type alias rather than an interface: the app SDK types dialog
// parameters as SerializedJSONValue, and only type literals get the implicit
// index signature that makes them assignable to it.
export type S3Asset = {
  key: string;
  name: string;
  size: number | null;
  lastModified: string | null;
  eTag: string | null;
  isImage: boolean;
  displayUrl: string;
};

export interface S3Prefix {
  name: string;
  path: string;
  hasChildren: boolean;
}

// Installation parameter IDs. Keep in sync with the app definition's
// parameter definitions (scripts/set-parameter-definitions.mts), the
// function (functions/s3Proxy.ts) and ConfigScreen.
export interface AppInstallationParameters {
  awsRegion?: string;
  awsAccessKeyId?: string;
  // Secret-type parameter: the SDK only ever returns a redacted value here.
  awsSecretAccessKey?: string;
  s3Bucket?: string;
  cloudfrontDomain?: string;
  maxFiles?: number;
}

// Passed from Field to Dialog via sdk.dialogs.openCurrentApp. Type alias for
// the same SerializedJSONValue reason as S3Asset.
export type DialogInvocationParameters = {
  // Remaining slots on the field, not the installation-wide maximum.
  maxFiles: number;
  // Assets already on the field, so the dialog can prevent duplicates.
  currentAssets: S3Asset[];
};
