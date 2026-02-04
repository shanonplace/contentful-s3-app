import { useState, useEffect, useCallback } from "react";
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
import type {
  AppInstallationParameters,
  DialogInvocationParameters,
  S3Asset,
  S3Prefix,
} from "../types";
import {
  fetchPrefixes,
  fetchObjects,
  searchObjects,
  getProxyUrl,
  getApiKey,
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

const Dialog = () => {
  const sdk = useSDK<DialogAppSDK>();

  const invocationParams = sdk.parameters.invocation as unknown as DialogInvocationParameters;
  const installationParams = sdk.parameters.installation as unknown as AppInstallationParameters;

  const { maxFiles } = invocationParams;
  const proxyUrl = getProxyUrl(installationParams);
  const apiKey = getApiKey(installationParams);

  // State
  const [prefixes, setPrefixes] = useState<S3Prefix[]>([]);
  const [currentPrefix, setCurrentPrefix] = useState<string>("");
  const [objects, setObjects] = useState<S3Asset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Load prefixes with caching
  const loadPrefixes = useCallback(async () => {
    try {
      // Check cache
      const cached = sessionStorage.getItem(PREFIX_CACHE_KEY);
      if (cached) {
        const parsed: CachedPrefixes = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_DURATION) {
          setPrefixes(parsed.prefixes);
          setLoading(false);
          return;
        }
      }

      const response = await fetchPrefixes(proxyUrl, apiKey, "");
      setPrefixes(response.prefixes);

      // Cache the results
      sessionStorage.setItem(
        PREFIX_CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          prefixes: response.prefixes,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prefixes");
    } finally {
      setLoading(false);
    }
  }, [proxyUrl, apiKey]);

  // Load objects for a prefix
  const loadObjects = useCallback(
    async (prefix: string, append = false) => {
      setLoadingObjects(true);
      setError(null);
      setIsSearching(false);

      try {
        const response = await fetchObjects(
          proxyUrl,
          apiKey,
          prefix,
          DEFAULT_PAGE_SIZE,
          append ? continuationToken : null
        );

        if (append) {
          setObjects((prev) => [...prev, ...response.objects]);
        } else {
          setObjects(response.objects);
        }

        setContinuationToken(response.nextContinuationToken);
        setHasMore(response.isTruncated);

        // Save last visited prefix
        sessionStorage.setItem(LAST_PREFIX_KEY, prefix);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load objects");
      } finally {
        setLoadingObjects(false);
      }
    },
    [proxyUrl, apiKey, continuationToken]
  );

  // Search objects
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      loadObjects(currentPrefix);
      return;
    }

    setLoadingObjects(true);
    setError(null);
    setIsSearching(true);

    try {
      const response = await searchObjects(
        proxyUrl,
        apiKey,
        searchQuery,
        currentPrefix,
        DEFAULT_PAGE_SIZE
      );

      setObjects(response.objects);
      setHasMore(response.hasMore);
      setContinuationToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoadingObjects(false);
    }
  }, [proxyUrl, apiKey, searchQuery, currentPrefix, loadObjects]);

  // Handle folder click
  const handlePrefixClick = useCallback(
    (prefix: S3Prefix) => {
      setCurrentPrefix(prefix.path);
      setSearchQuery("");
      setContinuationToken(null);
      loadObjects(prefix.path);
    },
    [loadObjects]
  );

  // Handle breadcrumb navigation
  const handleBreadcrumbClick = useCallback(
    (path: string) => {
      setCurrentPrefix(path);
      setSearchQuery("");
      setContinuationToken(null);
      loadObjects(path);
    },
    [loadObjects]
  );

  // Handle asset selection
  const handleAssetClick = useCallback(
    (asset: S3Asset) => {
      setSelectedAssets((prev) => {
        const next = new Set(prev);
        if (next.has(asset.key)) {
          next.delete(asset.key);
        } else if (next.size < maxFiles) {
          next.add(asset.key);
        }
        return next;
      });
    },
    [maxFiles]
  );

  // Handle selection confirmation
  const handleSelect = useCallback(() => {
    const selected = objects.filter((obj) => selectedAssets.has(obj.key));
    sdk.close(selected);
  }, [objects, selectedAssets, sdk]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    sdk.close(null);
  }, [sdk]);

  // Initial load
  useEffect(() => {
    loadPrefixes();

    // Restore last prefix
    const lastPrefix = sessionStorage.getItem(LAST_PREFIX_KEY) || "";
    setCurrentPrefix(lastPrefix);
    loadObjects(lastPrefix);
  }, [loadPrefixes, loadObjects]);

  // Handle search on Enter
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

  return (
    <div>
      <div className={styles.container}>
        {/* Sidebar with folder tree */}
        <div className={styles.sidebar}>
          <Text fontWeight="fontWeightMedium" marginBottom="spacingS">
            Folders
          </Text>
          <FolderTree
            prefixes={prefixes}
            selectedPath={currentPrefix}
            onPrefixClick={handlePrefixClick}
            proxyUrl={proxyUrl}
            apiKey={apiKey}
          />
        </div>

        {/* Main content area */}
        <div className={styles.main}>
          {/* Toolbar with search */}
          <div className={styles.toolbar}>
            <Breadcrumb path={currentPrefix} onClick={handleBreadcrumbClick} />
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

          {/* Content area */}
          <div className={styles.content}>
            {error && (
              <Box padding="spacingM">
                <Note variant="negative">{error}</Note>
              </Box>
            )}

            {isSearching && objects.length > 0 && (
              <Box padding="spacingS" paddingLeft="spacingM">
                <Text fontColor="gray500">
                  Search results for "{searchQuery}"
                </Text>
              </Box>
            )}

            <AssetGrid
              assets={objects}
              selectedAssets={selectedAssets}
              onAssetClick={handleAssetClick}
              loading={loadingObjects}
            />

            {hasMore && !loadingObjects && (
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
          </div>
        </div>
      </div>

      {/* Footer with actions */}
      <div className={styles.footer}>
        <Text fontColor="gray500">
          {selectedAssets.size} of {maxFiles} assets selected
        </Text>
        <Flex gap="spacingM">
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSelect}
            isDisabled={selectedAssets.size === 0}
          >
            Select {selectedAssets.size > 0 ? `(${selectedAssets.size})` : ""}
          </Button>
        </Flex>
      </div>
    </div>
  );
};

export default Dialog;
