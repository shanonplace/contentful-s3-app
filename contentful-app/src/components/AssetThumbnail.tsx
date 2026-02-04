import { Card, IconButton, CopyButton } from "@contentful/f36-components";
import { DeleteIcon, AssetIcon, ExternalLinkIcon } from "@contentful/f36-icons";
import { css } from "@emotion/css";
import type { S3Asset } from "../types";
import { formatFileSize, formatDate } from "../utils";

const styles = {
  card: css({
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px",
  }),
  thumbnail: css({
    width: "64px",
    height: "64px",
    objectFit: "cover",
    borderRadius: "4px",
    backgroundColor: "#f5f5f5",
    flexShrink: 0,
  }),
  placeholder: css({
    width: "64px",
    height: "64px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: "4px",
    flexShrink: 0,
    color: "#666",
  }),
  info: css({
    flex: 1,
    minWidth: 0,
  }),
  name: css({
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  meta: css({
    fontSize: "12px",
    color: "#666",
    marginTop: "4px",
  }),
  url: css({
    fontSize: "11px",
    color: "#888",
    marginTop: "4px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  actions: css({
    display: "flex",
    gap: "4px",
    flexShrink: 0,
  }),
};

interface AssetThumbnailProps {
  asset: S3Asset;
  onRemove: (asset: S3Asset) => void;
}

export function AssetThumbnail({ asset, onRemove }: AssetThumbnailProps) {
  const handleOpenUrl = () => {
    window.open(asset.displayUrl, "_blank");
  };

  return (
    <Card className={styles.card}>
      {asset.isImage ? (
        <img
          src={asset.displayUrl}
          alt={asset.name}
          className={styles.thumbnail}
        />
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
        <IconButton
          variant="transparent"
          aria-label="Open in new tab"
          icon={<ExternalLinkIcon />}
          onClick={handleOpenUrl}
        />
        <IconButton
          variant="transparent"
          aria-label="Remove asset"
          icon={<DeleteIcon />}
          onClick={() => onRemove(asset)}
        />
      </div>
    </Card>
  );
}
