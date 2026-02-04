import { useCallback, useEffect } from "react";
import { FieldAppSDK } from "@contentful/app-sdk";
import { useSDK, useFieldValue } from "@contentful/react-apps-toolkit";
import {
  Button,
  Stack,
  Text,
  Note,
} from "@contentful/f36-components";
import { PlusIcon } from "@contentful/f36-icons";
import { css } from "@emotion/css";
import type { AppInstallationParameters, S3Asset } from "../types";
import { DEFAULT_MAX_FILES } from "../constants";
import { AssetThumbnail } from "../components/AssetThumbnail";

const styles = {
  container: css({
    padding: "0",
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
  const installationParams = sdk.parameters.installation as unknown as AppInstallationParameters;
  const [fieldValue = [], setAssets] = useFieldValue<S3Asset[] | null>(
    sdk.field.id,
    sdk.field.locale
  );

  const assets = fieldValue || [];
  const maxFiles = installationParams.maxFiles || DEFAULT_MAX_FILES;
  const canAddMore = assets.length < maxFiles;

  // Auto-resize the field iframe
  useEffect(() => {
    sdk.window.startAutoResizer();
    return () => sdk.window.stopAutoResizer();
  }, [sdk]);

  const handleOpenDialog = useCallback(async () => {
    const result = await sdk.dialogs.openCurrentApp({
      position: "center",
      title: "Select S3 Assets",
      shouldCloseOnOverlayClick: true,
      shouldCloseOnEscapePress: true,
      width: "fullWidth",
      minHeight: "80vh",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parameters: {
        maxFiles: maxFiles - assets.length,
        currentAssets: assets,
      } as any,
    });

    if (result && Array.isArray(result) && result.length > 0) {
      const newAssets = [...assets, ...result].slice(0, maxFiles);
      setAssets(newAssets);
    }
  }, [sdk, assets, maxFiles, setAssets]);

  const handleRemoveAsset = useCallback(
    (assetToRemove: S3Asset) => {
      const newAssets = assets.filter((a) => a.key !== assetToRemove.key);
      setAssets(newAssets.length > 0 ? newAssets : null);
    },
    [assets, setAssets]
  );

  const isConfigured =
    installationParams.proxyUrl && installationParams.apiKey;

  if (!isConfigured) {
    return (
      <Note variant="warning">
        S3 Asset Picker is not configured. Please configure the app in the app
        settings.
      </Note>
    );
  }

  return (
    <div className={styles.container}>
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
