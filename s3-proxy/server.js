import { timingSafeEqual } from "node:crypto";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pinoHttp from "pino-http";
import logger from "./logger.js";
import { getRouter } from "./routes/s3.js";
import { loadConfig } from "./services/s3Service.js";

dotenv.config();

// Fail fast on a misconfigured environment. Every value must come from .env;
// nothing here falls back to defaults or to the AWS SDK's own credential chain.
const PORT = process.env.PORT;
const API_KEY = process.env.API_KEY;

if (!PORT) {
  logger.error("PORT environment variable is required");
  process.exit(1);
}
if (!API_KEY) {
  logger.error("API_KEY environment variable is required");
  process.exit(1);
}
try {
  loadConfig();
} catch (error) {
  logger.error(error.message);
  process.exit(1);
}

const app = express();

// Request logging. x-api-key is redacted in logger.js.
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === "/health",
    },
  }),
);

// CORS: the app runs inside Contentful's iframe origins in production and on
// localhost during `vite dev`.
app.use(
  cors({
    origin: [
      "https://app.contentful.com",
      /^https:\/\/[a-z0-9-]+\.ctfcloud\.net$/,
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
    ],
    methods: ["GET"],
  }),
);

// Compare keys in constant time so response timing does not leak how many
// leading characters of a guessed key were correct.
function keysMatch(provided, expected) {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return res.status(401).json({
      error: "AuthenticationError",
      message: "API key is required",
    });
  }

  if (!keysMatch(apiKey, API_KEY)) {
    return res.status(401).json({
      error: "AuthenticationError",
      message: "Invalid API key",
    });
  }

  next();
};

// Health check (no auth required)
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "s3-proxy" });
});

// Protected S3 API routes
app.use("/api/s3", authenticateApiKey, getRouter());

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "NotFound",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Central error handler. Validation and S3 errors carry a statusCode; anything
// else is a 500. In production the 500 message is hidden because AWS SDK
// errors can include bucket names and request details.
// Express only treats a middleware as an error handler when it declares four
// parameters, so `next` must stay even though it is unused.
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === "production";

  if (statusCode >= 500) {
    req.log.error({ err }, "Request error");
  } else {
    req.log.warn({ err: { name: err.name, message: err.message } }, "Request rejected");
  }

  res.status(statusCode).json({
    error: err.name || "InternalError",
    message:
      isProduction && statusCode >= 500
        ? "An internal error occurred"
        : err.message,
  });
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  logger.info({ port: PORT, url }, "S3 proxy server started");
});
