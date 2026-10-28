import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { DialogAppSDK } from "@contentful/app-sdk";
import { useSDK } from "@contentful/react-apps-toolkit";
import {
  Button,
  Flex,
  Text,
  TextInput,
  Spinner,
  Note,
  Box,
} from "@contentful/f36-components";
import { SearchIcon } from "@contentful/f36-icons";
import { css } from "@emotion/css";
import type { DialogInvocationParameters, S3Asset, S3Prefix } from "../types";
import {
  fetchPrefixes,
  fetchObjects,
  searchObjects,
  sessionGet,
  sessionSet,
} from "../utils";
import {
  CACHE_DURATION,
  PREFIX_CACHE_KEY,
  LAST_PREFIX_KEY,
  DEFAULT_PAGE_SIZE,
} from "../constants";
import { FolderTree } from "../components/FolderTree";
import { AssetGrid } from "../components/AssetGrid";
import { Breadcrumb } from "../components/Breadcrumb";

const styles = {
  container: css({
    display: "flex",
    height: "calc(80vh - 120px)",
    minHeight: "500px",
  }),
  sidebar: css({
    width: "280px",
    minWidth: "200px",
    maxWidth: "400px",
    borderRight: "1px solid #e5e5e5",
    overflowY: "auto",
    padding: "16px",
    backgroundColor: "#fafafa",
  }),
  main: css({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  }),
  toolbar: css({
    padding: "16px",
    borderBottom: "1px solid #e5e5e5",
    display: "flex",
    alignItems: "center",
    gap: "16px",
  }),
  searchBox: css({
    flex: 1,
    maxWidth: "400px",
  }),
  content: css({
    flex: 1,
    overflow: "auto",
  }),
  footer: css({
    padding: "16px",
    borderTop: "1px solid #e5e5e5",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  }),
  loadMore: css({
    display: "flex",
    justifyContent: "center",
    padding: "16px",
  }),
};

interface CachedPrefixes {
  timestamp: number;
  prefixes: S3Prefix[];
}

function readPrefixCache(): S3Prefix[] | null {
  const cached = sessionGet(PREFIX_CACHE_KEY);
  if (!cached) return null;
  try {
    const parsed: CachedPrefixes = JSON.parse(cached);
    if (
      Array.isArray(parsed.prefixes) &&
      Date.now() - parsed.timestamp < CACHE_DURATION
    ) {
      return parsed.prefixes;
    }
  } catch {
    // Corrupt cache entry: fall through and refetch.
  }
  return null;
}

const Dialog = () => {
  const sdk = useSDK<DialogAppSDK>();

  const invocationParams = sdk.parameters
    .invocation as unknown as DialogInvocationParameters;

  // maxFiles here is the number of slots left on the field, not the
  // installation-wide limit. Field computes it before opening the dialog.
  const { maxFiles, currentAssets } = invocationParams;

  // Assets already on the field are shown but cannot be selected again.
  const existingKeys = useMemo(
    () => new Set((currentAssets ?? []).map((a) => a.key)),
    [currentAssets]
  );

  const [prefixes, setPrefixes] = useState<S3Prefix[]>([]);
  const [currentPrefix, setCurrentPrefix] = useState<string>("");
  const [objects, setObjects] = useState<S3Asset[]>([]);
  // Keyed by S3 key, holding the full asset so a selection made in one folder
  // survives navigating to another folder before confirming.
  const [selected, setSelected] = useState<Map<string, S3Asset>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Every listing is an app action call (browser to CMA to function to S3 and
  // back), which costs seconds rather than milliseconds. The folder cache and
  // the stale-request guard below exist to keep that from compounding.
  //
  // Refs rather than state: loadObjects must keep a stable identity, or the
  // mount effect that depends on it would re-run after every page load.
  const continuationTokenRef = useRef<string | null>(null);
  // Incremented per request so a slow response for a folder the user has
  // already navigated away from cannot overwrite the current listing.
  const requestIdRef = useRef(0);

  const loadPrefixes = useCallback(async () => {
    try {
      const cached = readPrefixCache();
      if (cached) {
        setPrefixes(cached);
        return;
      }

      const response = await fetchPrefixes(sdk, "");
      setPrefixes(response.prefixes);
      sessionSet(
        PREFIX_CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          prefixes: response.prefixes,
        } satisfies CachedPrefixes)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folders");
    } finally {
      setLoading(false);
    }
  }, [sdk]);

  const loadObjects = useCallback(
    async (prefix: string, append = false) => {
      const requestId = ++requestIdRef.current;
      setLoadingObjects(true);
      setError(null);
      setIsSearching(false);

      try {
        const response = await fetchObjects(
          sdk,
          prefix,
          DEFAULT_PAGE_SIZE,
          append ? continuationTokenRef.current : null
        );
        if (requestId !== requestIdRef.current) return;

        setObjects((prev) =>
          append ? [...prev, ...response.objects] : response.objects
        );
        continuationTokenRef.current = response.nextContinuationToken;
        setHasMore(response.isTruncated);
        sessionSet(LAST_PREFIX_KEY, prefix);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load files");
      } finally {
        if (requestId === requestIdRef.current) setLoadingObjects(false);
      }
    },
    [sdk]
  );

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      continuationTokenRef.current = null;
      loadObjects(currentPrefix);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoadingObjects(true);
    setError(null);
    setIsSearching(true);

    try {
      const response = await searchObjects(
        sdk,
        query,
        currentPrefix,
        DEFAULT_PAGE_SIZE
      );
      if (requestId !== requestIdRef.current) return;

      setObjects(response.objects);
      // Search results are not paginated by the proxy; hasMore only signals
      // that the query should be narrowed.
      setHasMore(response.hasMore);
      continuationTokenRef.current = null;
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      if (requestId === requestIdRef.current) setLoadingObjects(false);
    }
  }, [sdk, searchQuery, currentPrefix, loadObjects]);

  // Shared by the folder tree and the breadcrumb.
  const navigateTo = useCallback(
    (path: string) => {
      setCurrentPrefix(path);
      setSearchQuery("");
      continuationTokenRef.current = null;
      loadObjects(path);
    },
    [loadObjects]
  );

  const handlePrefixClick = useCallback(
    (prefix: S3Prefix) => navigateTo(prefix.path),
    [navigateTo]
  );

  const handleAssetClick = useCallback(
    (asset: S3Asset) => {
      if (existingKeys.has(asset.key)) return;
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(asset.key)) {
          next.delete(asset.key);
        } else if (next.size < maxFiles) {
          next.set(asset.key, asset);
        }
        return next;
      });
    },
    [maxFiles, existingKeys]
  );

  const handleSelect = useCallback(() => {
    sdk.close(Array.from(selected.values()));
  }, [selected, sdk]);

  const handleCancel = useCallback(() => {
    sdk.close(null);
  }, [sdk]);

  // Initial load: folder tree plus the last folder the user was browsing.
  // Both callbacks depend only on the sdk, so this effect runs once per mount.
  useEffect(() => {
    loadPrefixes();
    const lastPrefix = sessionGet(LAST_PREFIX_KEY) || "";
    setCurrentPrefix(lastPrefix);
    loadObjects(lastPrefix);
  }, [loadPrefixes, loadObjects]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  if (loading) {
    return (
      <Flex
        justifyContent="center"
        alignItems="center"
        style={{ height: "400px" }}
      >
        <Spinner size="large" />
      </Flex>
    );
  }

  const selectedKeys = new Set(selected.keys());

  return (
    <div>
      <div className={styles.container}>
        <div className={styles.sidebar}>
          <Text fontWeight="fontWeightMedium" marginBottom="spacingS">
            Folders
          </Text>
          <FolderTree
            prefixes={prefixes}
            selectedPath={currentPrefix}
            onPrefixClick={handlePrefixClick}
          />
        </div>

        <div className={styles.main}>
          <div className={styles.toolbar}>
            <Breadcrumb path={currentPrefix} onClick={navigateTo} />
            <div className={styles.searchBox}>
              <TextInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search files..."
                icon={<SearchIcon />}
              />
            </div>
            <Button size="small" onClick={handleSearch}>
              Search
            </Button>
          </div>

          <div className={styles.content}>
            {error && (
              <Box padding="spacingM">
                <Note variant="negative">{error}</Note>
              </Box>
            )}

            {isSearching && !loadingObjects && (
              <Box padding="spacingS" paddingLeft="spacingM">
                <Text fontColor="gray500">
                  {objects.length === 0
                    ? `No files matching "${searchQuery.trim()}"`
                    : `Search results for "${searchQuery.trim()}"`}
                  {currentPrefix ? ` in ${currentPrefix}` : ""}
                </Text>
              </Box>
            )}

            <AssetGrid
              assets={objects}
              selectedKeys={selectedKeys}
              disabledKeys={existingKeys}
              onAssetClick={handleAssetClick}
              loading={loadingObjects}
              emptyMessage={
                isSearching ? "Try a different search term" : "No files in this folder"
              }
            />

            {hasMore && !loadingObjects && !isSearching && (
              <div className={styles.loadMore}>
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => loadObjects(currentPrefix, true)}
                >
                  Load more
                </Button>
              </div>
            )}

            {hasMore && !loadingObjects && isSearching && (
              <Box padding="spacingM">
                <Note variant="neutral">
                  Showing the first {objects.length} matches. Narrow the search
                  or browse to a folder to see more.
                </Note>
              </Box>
            )}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <Text fontColor="gray500">
          {selected.size} of {maxFiles} selected
          {existingKeys.size > 0
            ? ` (${existingKeys.size} already on the field)`
            : ""}
        </Text>
        <Flex gap="spacingM">
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSelect}
            isDisabled={selected.size === 0}
          >
            Select {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </Flex>
      </div>
    </div>
  );
};

export default Dialog;
