import { useState, useRef } from "react";
import { Card, Text, Spinner } from "@contentful/f36-components";
import { AssetIcon, CheckCircleIcon } from "@contentful/f36-icons";
import { css } from "@emotion/css";
import tokens from "@contentful/f36-tokens";
import type { S3Asset } from "../types";
import { formatFileSize, formatDate } from "../utils";

const styles = {
  grid: css({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: tokens.spacingM,
    padding: tokens.spacingM,
    alignContent: "start",
  }),
  card: css({
    cursor: "pointer",
    transition: "all 0.15s ease",
    "&:hover": {
      boxShadow: tokens.boxShadowDefault,
    },
  }),
  // Positioning context for the checkmark, "Already on this field" label and tooltip.
  // Kept on an inner div because f36's Card styles override a className's
  // layout properties (see AssetThumbnail).
  body: css({
    position: "relative",
    minWidth: 0,
  }),
  selectedCard: css({
    border: `2px solid ${tokens.blue500}`,
    backgroundColor: tokens.blue100,
  }),
  // Already on the field: visible for context, but not selectable again.
  disabledCard: css({
    cursor: "default",
    opacity: 0.55,
    "&:hover": {
      boxShadow: "none",
    },
  }),
  disabledLabel: css({
    position: "absolute",
    top: "8px",
    left: "8px",
    fontSize: tokens.fontSizeS,
    padding: `2px ${tokens.spacingXs}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.gray700,
    color: tokens.colorWhite,
  }),
  checkmark: css({
    position: "absolute",
    top: "8px",
    right: "8px",
    color: tokens.blue500,
    backgroundColor: tokens.colorWhite,
    borderRadius: "50%",
  }),
  thumbnail: css({
    width: "100%",
    height: "120px",
    objectFit: "cover",
    borderRadius: `${tokens.borderRadiusMedium} ${tokens.borderRadiusMedium} 0 0`,
    backgroundColor: tokens.gray100,
  }),
  placeholder: css({
    width: "100%",
    height: "120px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.gray100,
    borderRadius: `${tokens.borderRadiusMedium} ${tokens.borderRadiusMedium} 0 0`,
    color: tokens.gray500,
  }),
  info: css({
    padding: tokens.spacingS,
  }),
  name: css({
    fontWeight: tokens.fontWeightMedium,
    fontSize: tokens.fontSizeM,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    marginBottom: "4px",
  }),
  meta: css({
    fontSize: tokens.fontSizeS,
    color: tokens.gray500,
  }),
  tooltip: css({
    position: "absolute",
    bottom: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: tokens.gray900,
    color: tokens.colorWhite,
    padding: `${tokens.spacingXs} ${tokens.spacingS}`,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeS,
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
      borderColor: `${tokens.gray900} transparent transparent transparent`,
    },
  }),
  empty: css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacing3Xl,
    color: tokens.gray500,
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
  isDisabled: boolean;
  onClick: () => void;
}

function AssetCard({ asset, isSelected, isDisabled, onClick }: AssetCardProps) {
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
      className={`${styles.card} ${isSelected ? styles.selectedCard : ""} ${
        isDisabled ? styles.disabledCard : ""
      }`}
      onClick={isDisabled ? undefined : onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      padding="none"
    >
      <div className={styles.body}>
        {isSelected && (
          <CheckCircleIcon className={styles.checkmark} size="medium" />
        )}
        {isDisabled && (
          <span className={styles.disabledLabel}>Already on this field</span>
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
            {formatFileSize(asset.size)} &middot;{" "}
            {formatDate(asset.lastModified)}
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
      </div>
    </Card>
  );
}

interface AssetGridProps {
  assets: S3Asset[];
  selectedKeys: Set<string>;
  disabledKeys: Set<string>;
  onAssetClick: (asset: S3Asset) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export function AssetGrid({
  assets,
  selectedKeys,
  disabledKeys,
  onAssetClick,
  loading,
  emptyMessage = "No files in this folder",
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
        <Text marginTop="spacingM">{emptyMessage}</Text>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {assets.map((asset) => (
        <AssetCard
          key={asset.key}
          asset={asset}
          isSelected={selectedKeys.has(asset.key)}
          isDisabled={disabledKeys.has(asset.key)}
          onClick={() => onAssetClick(asset)}
        />
      ))}
    </div>
  );
}
