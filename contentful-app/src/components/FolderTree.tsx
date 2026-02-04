import { useState, useCallback } from "react";
import { Text, Spinner } from "@contentful/f36-components";
import { FolderOpenIcon, ChevronDownIcon, ChevronRightIcon } from "@contentful/f36-icons";
import { css } from "@emotion/css";
import type { S3Prefix } from "../types";
import { fetchPrefixes } from "../utils";

const styles = {
  tree: css({
    fontSize: "14px",
  }),
  item: css({
    display: "flex",
    alignItems: "center",
    padding: "6px 8px",
    cursor: "pointer",
    borderRadius: "4px",
    gap: "6px",
    "&:hover": {
      backgroundColor: "#e8e8e8",
    },
  }),
  activeItem: css({
    backgroundColor: "#e6f0ff",
    "&:hover": {
      backgroundColor: "#d6e6ff",
    },
  }),
  chevron: css({
    width: "16px",
    height: "16px",
    flexShrink: 0,
    color: "#666",
  }),
  chevronPlaceholder: css({
    width: "16px",
    height: "16px",
    flexShrink: 0,
  }),
  folderIcon: css({
    color: "#f5a623",
    flexShrink: 0,
  }),
  label: css({
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  }),
  children: css({
    marginLeft: "16px",
  }),
  rootItem: css({
    display: "flex",
    alignItems: "center",
    padding: "6px 8px",
    cursor: "pointer",
    borderRadius: "4px",
    gap: "6px",
    fontWeight: 500,
    "&:hover": {
      backgroundColor: "#e8e8e8",
    },
  }),
  loading: css({
    padding: "6px 8px",
    marginLeft: "22px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#666",
  }),
};

interface FolderTreeItemProps {
  prefix: S3Prefix;
  selectedPath: string;
  onPrefixClick: (prefix: S3Prefix) => void;
  proxyUrl: string;
  apiKey: string;
  level?: number;
}

function FolderTreeItem({
  prefix,
  selectedPath,
  onPrefixClick,
  proxyUrl,
  apiKey,
  level = 0,
}: FolderTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<S3Prefix[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const isActive = selectedPath === prefix.path;
  const hasChildren = prefix.hasChildren;

  const loadChildren = useCallback(async () => {
    if (loaded || loading) return;

    setLoading(true);
    try {
      const response = await fetchPrefixes(proxyUrl, apiKey, prefix.path);
      setChildren(response.prefixes);
      setLoaded(true);
    } catch (error) {
      console.error("Failed to load subfolders:", error);
    } finally {
      setLoading(false);
    }
  }, [proxyUrl, apiKey, prefix.path, loaded, loading]);

  const handleClick = () => {
    onPrefixClick(prefix);
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isExpanded && !loaded) {
      loadChildren();
    }
    setIsExpanded(!isExpanded);
  };

  return (
    <div>
      <div
        className={`${styles.item} ${isActive ? styles.activeItem : ""}`}
        onClick={handleClick}
      >
        {hasChildren ? (
          <span className={styles.chevron} onClick={handleExpandClick}>
            {isExpanded ? (
              <ChevronDownIcon size="small" />
            ) : (
              <ChevronRightIcon size="small" />
            )}
          </span>
        ) : (
          <span className={styles.chevronPlaceholder} />
        )}
        <FolderOpenIcon size="small" className={styles.folderIcon} />
        <span className={styles.label}>{prefix.name}</span>
      </div>

      {isExpanded && (
        <div className={styles.children}>
          {loading && (
            <div className={styles.loading}>
              <Spinner size="small" />
              <Text fontSize="fontSizeS">Loading...</Text>
            </div>
          )}
          {children.map((child) => (
            <FolderTreeItem
              key={child.path}
              prefix={child}
              selectedPath={selectedPath}
              onPrefixClick={onPrefixClick}
              proxyUrl={proxyUrl}
              apiKey={apiKey}
              level={level + 1}
            />
          ))}
          {loaded && children.length === 0 && (
            <Text
              fontSize="fontSizeS"
              fontColor="gray500"
              style={{ paddingLeft: "22px" }}
            >
              No subfolders
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

interface FolderTreeProps {
  prefixes: S3Prefix[];
  selectedPath: string;
  onPrefixClick: (prefix: S3Prefix) => void;
  proxyUrl: string;
  apiKey: string;
}

export function FolderTree({
  prefixes,
  selectedPath,
  onPrefixClick,
  proxyUrl,
  apiKey,
}: FolderTreeProps) {
  const handleRootClick = () => {
    onPrefixClick({ name: "Root", path: "", hasChildren: true });
  };

  return (
    <div className={styles.tree}>
      <div
        className={`${styles.rootItem} ${selectedPath === "" ? styles.activeItem : ""}`}
        onClick={handleRootClick}
      >
        <FolderOpenIcon size="small" className={styles.folderIcon} />
        <span>Root</span>
      </div>

      <div className={styles.children}>
        {prefixes.map((prefix) => (
          <FolderTreeItem
            key={prefix.path}
            prefix={prefix}
            selectedPath={selectedPath}
            onPrefixClick={onPrefixClick}
            proxyUrl={proxyUrl}
            apiKey={apiKey}
          />
        ))}
      </div>
    </div>
  );
}
