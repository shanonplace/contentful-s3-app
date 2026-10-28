export const DEFAULT_MAX_FILES = 10;
// Upper bound for the "Max Files Per Field" installation parameter.
export const MAX_FILES_LIMIT = 50;
export const DEFAULT_PAGE_SIZE = 25;
// Root folder list is cached in sessionStorage for this long. New top-level
// folders will not appear in the picker until it expires or the tab is closed.
export const CACHE_DURATION = 5 * 60 * 1000;
export const PREFIX_CACHE_KEY = "s3-prefix-cache";
export const LAST_PREFIX_KEY = "s3-last-prefix";
