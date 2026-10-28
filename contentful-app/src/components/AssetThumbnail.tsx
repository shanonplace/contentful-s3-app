import { Card, IconButton, CopyButton, Tooltip } from "@contentful/f36-components";
import { CloseIcon, AssetIcon, ExternalLinkIcon } from "@contentful/f36-icons";
import { css } from "@emotion/css";
import tokens from "@contentful/f36-tokens";
import type { S3Asset } from "../types";
import { formatFileSize, formatDate } from "../utils";

const styles = {
  // Layout lives on an inner div, not on the Card: f36's Card injects its own
  // emotion styles for display and padding after ours, so a className on the
  // Card itself loses and the row collapses into a stacked block.
  row: css({
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingS,
    padding: tokens.spacingS,
    // Let the text column shrink below its content width so the long URL
    // truncates instead of widening the card past the field iframe.
    minWidth: 0,
  }),
  thumbnail: css({
    width: "64px",
    height: "64px",
    objectFit: "cover",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.gray100,
    flexShrink: 0,
  }),
  placeholder: css({
    width: "64px",
    height: "64px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.gray100,
    borderRadius: tokens.borderRadiusMedium,
    flexShrink: 0,
    color: tokens.gray500,
  }),
  info: css({
    flex: 1,
    minWidth: 0,
  }),
  name: css({
    fontWeight: tokens.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  meta: css({
    fontSize: tokens.fontSizeS,
    color: tokens.gray500,
    marginTop: tokens.spacing2Xs,
  }),
  url: css({
    fontSize: tokens.fontSizeS,
    color: tokens.gray500,
    marginTop: tokens.spacing2Xs,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  actions: css({
    display: "flex",
    gap: tokens.spacing2Xs,
    flexShrink: 0,
  }),
};

interface AssetThumbnailProps {
  asset: S3Asset;
  onRemove: (asset: S3Asset) => void;
}

export function AssetThumbnail({ asset, onRemove }: AssetThumbnailProps) {
  const handleOpenUrl = () => {
    window.open(asset.displayUrl, "_blank", "noopener");
  };

  return (
    <Card padding="none">
      <div className={styles.row}>
        {asset.isImage ? (
          <img src={asset.displayUrl} alt={asset.name} className={styles.thumbnail} />
        ) : (
          <div className={styles.placeholder}>
            <AssetIcon size="medium" />
          </div>
        )}

        <div className={styles.info}>
          <div className={styles.name} title={asset.name}>
            {asset.name}
          </div>
          <div className={styles.meta}>
            {formatFileSize(asset.size)} &middot; {formatDate(asset.lastModified)}
          </div>
          <div className={styles.url} title={asset.displayUrl}>
            {asset.displayUrl}
          </div>
        </div>

        <div className={styles.actions}>
          <CopyButton value={asset.displayUrl} tooltipProps={{ placement: "top" }} />
          <Tooltip content="Open in new tab" placement="top">
            <IconButton
              variant="transparent"
              aria-label="Open in new tab"
              icon={<ExternalLinkIcon />}
              onClick={handleOpenUrl}
            />
          </Tooltip>
          {/* A close icon, not a trash can: this only unlinks the file from the
              entry. The object in S3 is untouched, and the label says so. */}
          <Tooltip content="Remove from this field (the file stays in S3)" placement="top">
            <IconButton
              variant="transparent"
              aria-label="Remove from this field"
              icon={<CloseIcon />}
              onClick={() => onRemove(asset)}
            />
          </Tooltip>
        </div>
      </div>
    </Card>
  );
}
