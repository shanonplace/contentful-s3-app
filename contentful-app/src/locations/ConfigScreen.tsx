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
} from "@contentful/f36-components";
import type { AppInstallationParameters } from "../types";
import { DEFAULT_MAX_FILES } from "../constants";

const ConfigScreen = () => {
  const sdk = useSDK<ConfigAppSDK>();
  const [parameters, setParameters] = useState<AppInstallationParameters>({
    proxyUrl: "",
    apiKey: "",
    cloudfrontDomain: "",
    maxFiles: DEFAULT_MAX_FILES,
  });

  const onConfigure = useCallback(async () => {
    if (!parameters.proxyUrl) {
      sdk.notifier.error("Please enter the S3 Proxy URL");
      return false;
    }

    if (!parameters.apiKey) {
      sdk.notifier.error("Please enter the API Key");
      return false;
    }

    const currentState = await sdk.app.getCurrentState();

    return {
      parameters,
      targetState: currentState,
    };
  }, [parameters, sdk]);

  useEffect(() => {
    sdk.app.onConfigure(() => onConfigure());
  }, [sdk, onConfigure]);

  useEffect(() => {
    (async () => {
      const currentParameters: AppInstallationParameters | null =
        await sdk.app.getParameters();

      if (currentParameters) {
        setParameters({
          ...currentParameters,
          maxFiles: currentParameters.maxFiles || DEFAULT_MAX_FILES,
        });
      }

      sdk.app.setReady();
    })();
  }, [sdk]);

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
          Configure the connection to your S3 proxy server. The proxy handles AWS
          authentication and serves assets via CloudFront.
        </Note>
      </Box>

      <Form>
        <FormControl isRequired marginBottom="spacingM">
          <FormControl.Label>S3 Proxy URL</FormControl.Label>
          <TextInput
            value={parameters.proxyUrl || ""}
            onChange={(e) =>
              setParameters({ ...parameters, proxyUrl: e.target.value })
            }
            placeholder="https://your-proxy.example.com"
          />
          <FormControl.HelpText>
            The URL of your S3 proxy server (e.g., https://s3-proxy.yoursite.com)
          </FormControl.HelpText>
        </FormControl>

        <FormControl isRequired marginBottom="spacingM">
          <FormControl.Label>API Key</FormControl.Label>
          <TextInput
            type="password"
            value={parameters.apiKey || ""}
            onChange={(e) =>
              setParameters({ ...parameters, apiKey: e.target.value })
            }
            placeholder="Enter your API key"
          />
          <FormControl.HelpText>
            The API key configured on your S3 proxy server
          </FormControl.HelpText>
        </FormControl>

        <FormControl marginBottom="spacingM">
          <FormControl.Label>CloudFront Domain (Optional)</FormControl.Label>
          <TextInput
            value={parameters.cloudfrontDomain || ""}
            onChange={(e) =>
              setParameters({ ...parameters, cloudfrontDomain: e.target.value })
            }
            placeholder="d1234abcd.cloudfront.net"
          />
          <FormControl.HelpText>
            For display purposes only. The proxy server determines the actual
            asset URLs.
          </FormControl.HelpText>
        </FormControl>

        <FormControl marginBottom="spacingM">
          <FormControl.Label>Max Files Per Field</FormControl.Label>
          <TextInput
            type="number"
            value={String(parameters.maxFiles || DEFAULT_MAX_FILES)}
            onChange={(e) =>
              setParameters({
                ...parameters,
                maxFiles: parseInt(e.target.value) || DEFAULT_MAX_FILES,
              })
            }
            min={1}
            max={50}
          />
          <FormControl.HelpText>
            Maximum number of assets that can be selected per field (1-50)
          </FormControl.HelpText>
        </FormControl>
      </Form>

      <Box marginTop="spacingL">
        <Note variant="neutral">
          <strong>Setup Requirements:</strong>
          <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
            <li>Deploy the S3 proxy server with your AWS credentials</li>
            <li>Configure CloudFront to serve assets from your S3 bucket</li>
            <li>Set the API_KEY environment variable on your proxy</li>
          </ul>
        </Note>
      </Box>
    </Flex>
  );
};

export default ConfigScreen;
