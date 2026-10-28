import { createRoot } from "react-dom/client";
import { injectGlobal } from "@emotion/css";
import tokens from "@contentful/f36-tokens";
import { SDKProvider } from "@contentful/react-apps-toolkit";
import App from "./App";

// f36 components carry their own typography, but the plain div/span elements
// in the asset cards, folder tree and breadcrumb inherit from body. Without
// this they fall back to the browser default serif.
injectGlobal({
  body: {
    fontFamily: tokens.fontStackPrimary,
    fontSize: tokens.fontSizeM,
    color: tokens.gray900,
  },
});

const container = document.getElementById("root")!;
const root = createRoot(container);

root.render(
  <SDKProvider>
    <App />
  </SDKProvider>
);
