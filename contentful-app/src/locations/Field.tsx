import { useCallback, useEffect } from "react";
import { FieldAppSDK } from "@contentful/app-sdk";
import { useSDK, useFieldValue } from "@contentful/react-apps-toolkit";
import { Button, Stack, Text, Note } from "@contentful/f36-components";
import { PlusIcon } from "@contentful/f36-icons";
import { css } from "@emotion/css";
import type {
  AppInstallationParameters,
  DialogInvocationParameters,
  S3Asset,
} from "../types";
import { DEFAULT_MAX_FILES } from "../constants";
import { isConfigured } from "../utils";
import { AssetThumbnail } from "../components/AssetThumbnail";

const styles = {
  // The iframe's width is often fractional, so an element at exactly 100%
  // can land a sub-pixel past the edge and lose its right border to the
  // document's overflow-x: hidden. Keep a small gutter on that side.
  root: css({
    paddingRight: "2px",
    paddingBottom: "2px",
  }),
  assetList: css({
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  }),
  addButton: css({
    marginTop: "12px",
  }),
};

const Field = () => {
  const sdk = useSDK<FieldAppSDK>();
  const installationParams = sdk.parameters
    .installation as unknown as AppInstallationParameters;
  const [fieldValue, setAssets] = useFieldValue<S3Asset[] | null>(
    sdk.field.id,
    sdk.field.locale
  );

  // The field may hold null, or a non-array if someone edited the JSON by
  // hand. Treat anything that is not an array as empty rather than crashing.
  const assets = Array.isArray(fieldValue) ? fieldValue : [];
  const maxFiles = installationParams.maxFiles || DEFAULT_MAX_FILES;
  const canAddMore = assets.length < maxFiles;

  useEffect(() => {
    sdk.window.startAutoResizer();
    return () => sdk.window.stopAutoResizer();
  }, [sdk]);

  const handleOpenDialog = useCallback(async () => {
    const invocation: DialogInvocationParameters = {
      maxFiles: maxFiles - assets.length,
      currentAssets: assets,
    };

    const result: unknown = await sdk.dialogs.openCurrentApp({
      position: "center",
      title: "Select S3 Assets",
      shouldCloseOnOverlayClick: true,
      shouldCloseOnEscapePress: true,
      width: "fullWidth",
      minHeight: "80vh",
      parameters: invocation,
    });

    if (!Array.isArray(result) || result.length === 0) {
      return;
    }

    // The dialog disables already-added assets, but dedupe here too so the
    // field can never hold the same key twice.
    const existingKeys = new Set(assets.map((a) => a.key));
    const additions = (result as S3Asset[]).filter(
      (a) => !existingKeys.has(a.key)
    );
    if (additions.length === 0) {
      return;
    }

    setAssets([...assets, ...additions].slice(0, maxFiles));
  }, [sdk, assets, maxFiles, setAssets]);

  const handleRemoveAsset = useCallback(
    (assetToRemove: S3Asset) => {
      const newAssets = assets.filter((a) => a.key !== assetToRemove.key);
      // Clear the field entirely when empty so Contentful treats it as unset.
      setAssets(newAssets.length > 0 ? newAssets : null);
    },
    [assets, setAssets]
  );

  if (!isConfigured(installationParams)) {
    return (
      <Note variant="warning">
        S3 Asset Picker is not configured. Please configure the app in the app
        settings.
      </Note>
    );
  }

  return (
    <div className={styles.root}>
      {assets.length === 0 ? (
        <Text fontColor="gray500">No assets selected</Text>
      ) : (
        <div className={styles.assetList}>
          {assets.map((asset) => (
            <AssetThumbnail
              key={asset.key}
              asset={asset}
              onRemove={handleRemoveAsset}
            />
          ))}
        </div>
      )}

      <Stack className={styles.addButton}>
        <Button
          startIcon={<PlusIcon />}
          onClick={handleOpenDialog}
          isDisabled={!canAddMore}
          size="small"
        >
          {assets.length === 0 ? "Add asset" : "Add more assets"}
        </Button>
        {!canAddMore && (
          <Text fontColor="gray500" fontSize="fontSizeS">
            Maximum {maxFiles} assets allowed
          </Text>
        )}
      </Stack>
    </div>
  );
};

export default Field;
