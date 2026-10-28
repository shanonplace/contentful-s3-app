import { useCallback, useState, useEffect } from "react";
import { ConfigAppSDK } from "@contentful/app-sdk";
import { useSDK } from "@contentful/react-apps-toolkit";
import {
  Heading,
  Form,
  FormControl,
  TextInput,
  Flex,
  Note,
  Box,
  Button,
  Paragraph,
} from "@contentful/f36-components";
import type { AppInstallationParameters } from "../types";
import { DEFAULT_MAX_FILES, MAX_FILES_LIMIT } from "../constants";
import { callS3, type TestConnectionResult } from "../lib/s3Proxy";

const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d$/;
const BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const ConfigScreen = () => {
  const sdk = useSDK<ConfigAppSDK>();
  const [parameters, setParameters] = useState<AppInstallationParameters>({
    awsRegion: "",
    awsAccessKeyId: "",
    s3Bucket: "",
    cloudfrontDomain: "",
    maxFiles: DEFAULT_MAX_FILES,
  });
  // awsSecretAccessKey is a Secret-type installation parameter. The SDK only
  // returns a redacted value for it, so the form never shows the saved secret:
  // savedSecret holds whatever the SDK returned (redacted or empty) and
  // newSecret holds a replacement typed in this session, if any.
  const [savedSecret, setSavedSecret] = useState<string>("");
  const [newSecret, setNewSecret] = useState<string>("");
  const [testing, setTesting] = useState(false);

  const onConfigure = useCallback(async () => {
    const awsRegion = (parameters.awsRegion || "").trim();
    const awsAccessKeyId = (parameters.awsAccessKeyId || "").trim();
    const s3Bucket = (parameters.s3Bucket || "").trim();
    const cloudfrontDomain = (parameters.cloudfrontDomain || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");
    // Re-sending the redacted value keeps the stored secret; only a typed
    // replacement changes it. Verify this on first install with "Test
    // connection" after a save that did not touch the secret (see README).
    const awsSecretAccessKey = newSecret.trim() || savedSecret;

    if (!REGION_RE.test(awsRegion)) {
      sdk.notifier.error("Enter a valid AWS region code, for example us-east-1");
      return false;
    }
    if (!awsAccessKeyId) {
      sdk.notifier.error("Please enter the AWS access key ID");
      return false;
    }
    if (!awsSecretAccessKey) {
      sdk.notifier.error("Please enter the AWS secret access key");
      return false;
    }
    if (!BUCKET_RE.test(s3Bucket)) {
      sdk.notifier.error("Enter a valid S3 bucket name (lowercase letters, digits, dots and hyphens)");
      return false;
    }
    if (!HOSTNAME_RE.test(cloudfrontDomain)) {
      sdk.notifier.error("Enter the CloudFront domain as a hostname only, for example d1234abcd.cloudfront.net");
      return false;
    }

    const maxFiles = parameters.maxFiles ?? DEFAULT_MAX_FILES;
    if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > MAX_FILES_LIMIT) {
      sdk.notifier.error(`Max Files Per Field must be a whole number between 1 and ${MAX_FILES_LIMIT}`);
      return false;
    }

    const currentState = await sdk.app.getCurrentState();

    return {
      parameters: {
        awsRegion,
        awsAccessKeyId,
        awsSecretAccessKey,
        s3Bucket,
        cloudfrontDomain,
        maxFiles,
      },
      targetState: currentState,
    };
  }, [parameters, newSecret, savedSecret, sdk]);

  useEffect(() => {
    sdk.app.onConfigure(() => onConfigure());
  }, [sdk, onConfigure]);

  useEffect(() => {
    (async () => {
      const current: AppInstallationParameters | null = await sdk.app.getParameters();
      if (current) {
        setParameters({
          awsRegion: current.awsRegion || "",
          awsAccessKeyId: current.awsAccessKeyId || "",
          s3Bucket: current.s3Bucket || "",
          cloudfrontDomain: current.cloudfrontDomain || "",
          maxFiles: current.maxFiles || DEFAULT_MAX_FILES,
        });
        setSavedSecret(current.awsSecretAccessKey || "");
      }
      sdk.app.setReady();
    })();
  }, [sdk]);

  // Exercises the function end to end with the SAVED parameters. It cannot
  // test unsaved edits: the function reads installation parameters on
  // Contentful's side, so the user must save first.
  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await callS3<TestConnectionResult>(sdk, { action: "testConnection" });
      if (res.ok) {
        sdk.notifier.success(`Connected to bucket "${res.bucket}" in ${res.region}.`);
      } else {
        sdk.notifier.error(res.error);
      }
    } catch (error) {
      // Thrown only when the action call itself fails: app not installed in
      // this environment yet, bundle not uploaded, or action not created.
      sdk.notifier.error(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Flex
      flexDirection="column"
      padding="spacingL"
      style={{ maxWidth: "600px", margin: "0 auto" }}
    >
      <Heading as="h1" marginBottom="spacingL">
        S3 Asset Picker Configuration
      </Heading>

      <Box marginBottom="spacingL">
        <Note variant="primary">
          Listing requests run in a Contentful app function using the AWS
          credentials below. No separate proxy server is needed. The secret key
          is stored as a Secret parameter and is never shown again after saving.
        </Note>
      </Box>

      <Form>
        <FormControl isRequired marginBottom="spacingM">
          <FormControl.Label>AWS region</FormControl.Label>
          <TextInput
            value={parameters.awsRegion || ""}
            onChange={(e) => setParameters({ ...parameters, awsRegion: e.target.value })}
            placeholder="us-east-1"
          />
          <FormControl.HelpText>The region the bucket lives in.</FormControl.HelpText>
        </FormControl>

        <FormControl isRequired marginBottom="spacingM">
          <FormControl.Label>AWS access key ID</FormControl.Label>
          <TextInput
            value={parameters.awsAccessKeyId || ""}
            onChange={(e) => setParameters({ ...parameters, awsAccessKeyId: e.target.value })}
            placeholder="AKIA..."
          />
          <FormControl.HelpText>
            Use a dedicated IAM user with only s3:ListBucket on this bucket. The
            access key ID is readable by anyone with access to this space; the
            secret is not.
          </FormControl.HelpText>
        </FormControl>

        <FormControl isRequired={!savedSecret} marginBottom="spacingM">
          <FormControl.Label>AWS secret access key</FormControl.Label>
          <TextInput
            type="password"
            value={newSecret}
            onChange={(e) => setNewSecret(e.target.value)}
            placeholder={savedSecret ? "Saved. Enter a new value to replace it." : "Enter the secret access key"}
            autoComplete="new-password"
          />
          <FormControl.HelpText>
            {savedSecret
              ? "A secret is saved. Leave this empty to keep it."
              : "Stored as a Secret installation parameter; only the function can read it."}
          </FormControl.HelpText>
        </FormControl>

        <FormControl isRequired marginBottom="spacingM">
          <FormControl.Label>S3 bucket name</FormControl.Label>
          <TextInput
            value={parameters.s3Bucket || ""}
            onChange={(e) => setParameters({ ...parameters, s3Bucket: e.target.value })}
            placeholder="my-assets-bucket"
          />
        </FormControl>

        <FormControl isRequired marginBottom="spacingM">
          <FormControl.Label>CloudFront domain</FormControl.Label>
          <TextInput
            value={parameters.cloudfrontDomain || ""}
            onChange={(e) => setParameters({ ...parameters, cloudfrontDomain: e.target.value })}
            placeholder="d1234abcd.cloudfront.net"
          />
          <FormControl.HelpText>
            Hostname only. Asset URLs stored in entries are built from it.
          </FormControl.HelpText>
        </FormControl>

        <FormControl marginBottom="spacingM">
          <FormControl.Label>Max Files Per Field</FormControl.Label>
          <TextInput
            type="number"
            value={String(parameters.maxFiles ?? DEFAULT_MAX_FILES)}
            onChange={(e) =>
              setParameters({
                ...parameters,
                // Keep whatever the user typed (even out of range) so the
                // field does not snap back while editing; validate on save.
                maxFiles: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            min={1}
            max={MAX_FILES_LIMIT}
          />
          <FormControl.HelpText>
            Maximum number of assets that can be selected per field (1-{MAX_FILES_LIMIT})
          </FormControl.HelpText>
        </FormControl>
      </Form>

      <Box marginTop="spacingM" marginBottom="spacingL">
        <Button variant="secondary" onClick={() => void testConnection()} isDisabled={testing}>
          {testing ? "Testing..." : "Test connection (uses last saved values)"}
        </Button>
        <Paragraph marginTop="spacingXs" fontColor="gray500">
          Save first. The test runs the deployed function against the saved
          credentials, not the values in this form.
        </Paragraph>
      </Box>

      <Box>
        <Note variant="neutral">
          <strong>Setup Requirements:</strong>
          <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
            <li>Upload the app bundle (frontend plus function) and create the s3Api app action</li>
            <li>Define the installation parameters on the app definition so the secret key is a Secret type</li>
            <li>Configure CloudFront to serve assets from the S3 bucket</li>
            <li>Assign this app to a JSON object field on your content type</li>
          </ul>
        </Note>
      </Box>
    </Flex>
  );
};

export default ConfigScreen;
