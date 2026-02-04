import { useState, useRef } from "react";
import { Card, Text, Spinner } from "@contentful/f36-components";
import { AssetIcon, CheckCircleIcon } from "@contentful/f36-icons";
import { css } from "@emotion/css";
import type { S3Asset } from "../types";
import { formatFileSize, formatDate } from "../utils";

const styles = {
  grid: css({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "16px",
    padding: "16px",
    alignContent: "start",
  }),
  card: css({
    cursor: "pointer",
    transition: "all 0.15s ease",
    position: "relative",
    "&:hover": {
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    },
  }),
  selectedCard: css({
    border: "2px solid #0066ff",
    backgroundColor: "#f0f7ff",
  }),
  checkmark: css({
    position: "absolute",
    top: "8px",
    right: "8px",
    color: "#0066ff",
    backgroundColor: "white",
    borderRadius: "50%",
  }),
  thumbnail: css({
    width: "100%",
    height: "120px",
    objectFit: "cover",
    borderRadius: "4px 4px 0 0",
    backgroundColor: "#f5f5f5",
  }),
  placeholder: css({
    width: "100%",
    height: "120px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: "4px 4px 0 0",
    color: "#666",
  }),
  info: css({
    padding: "12px",
  }),
  name: css({
    fontWeight: 500,
    fontSize: "14px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    marginBottom: "4px",
  }),
  meta: css({
    fontSize: "12px",
    color: "#666",
  }),
  tooltip: css({
    position: "absolute",
    bottom: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#333",
    color: "white",
    padding: "8px 12px",
    borderRadius: "4px",
    fontSize: "12px",
    whiteSpace: "nowrap",
    zIndex: 100,
    marginBottom: "8px",
    "&::after": {
      content: '""',
      position: "absolute",
      top: "100%",
      left: "50%",
      transform: "translateX(-50%)",
      borderWidth: "6px",
      borderStyle: "solid",
      borderColor: "#333 transparent transparent transparent",
    },
  }),
  empty: css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px",
    color: "#666",
  }),
  loading: css({
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "48px",
  }),
};

interface AssetCardProps {
  asset: S3Asset;
  isSelected: boolean;
  onClick: () => void;
}

function AssetCard({ asset, isSelected, onClick }: AssetCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    hoverTimerRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 800);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    setShowTooltip(false);
  };

  return (
    <Card
      className={`${styles.card} ${isSelected ? styles.selectedCard : ""}`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isSelected && (
        <CheckCircleIcon className={styles.checkmark} size="medium" />
      )}

      {asset.isImage ? (
        <img
          src={asset.displayUrl}
          alt={asset.name}
          className={styles.thumbnail}
          loading="lazy"
        />
      ) : (
        <div className={styles.placeholder}>
          <AssetIcon size="large" />
        </div>
      )}

      <div className={styles.info}>
        <div className={styles.name} title={asset.name}>
          {asset.name}
        </div>
        <div className={styles.meta}>
          {formatFileSize(asset.size)} &middot; {formatDate(asset.lastModified)}
        </div>
      </div>

      {showTooltip && (
        <div className={styles.tooltip}>
          <div>
            <strong>{asset.name}</strong>
          </div>
          <div>Size: {formatFileSize(asset.size)}</div>
          <div>Modified: {formatDate(asset.lastModified)}</div>
          <div
            style={{
              maxWidth: "300px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Key: {asset.key}
          </div>
        </div>
      )}
    </Card>
  );
}

interface AssetGridProps {
  assets: S3Asset[];
  selectedAssets: Set<string>;
  onAssetClick: (asset: S3Asset) => void;
  loading?: boolean;
}

export function AssetGrid({
  assets,
  selectedAssets,
  onAssetClick,
  loading,
}: AssetGridProps) {
  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" />
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className={styles.empty}>
        <AssetIcon size="large" />
        <Text marginTop="spacingM">No files in this folder</Text>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {assets.map((asset) => (
        <AssetCard
          key={asset.key}
          asset={asset}
          isSelected={selectedAssets.has(asset.key)}
          onClick={() => onAssetClick(asset)}
        />
      ))}
    </div>
  );
}
