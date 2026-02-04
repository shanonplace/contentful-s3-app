import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pinoHttp from "pino-http";
import logger from "./logger.js";
import { getRouter } from "./routes/s3.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT;

if (!PORT) {
  logger.error("PORT environment variable is required");
  process.exit(1);
}

// Request logging
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === "/health",
    },
  }),
);

// CORS configuration - allow Contentful and local development
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

// Body parser
app.use(express.json({ limit: "10kb" }));

// API Key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  const validApiKey = process.env.API_KEY;

  if (!validApiKey) {
    req.log.error("API_KEY not configured in environment");
    return res.status(500).json({
      error: "ConfigurationError",
      message: "Server authentication not configured",
    });
  }

  if (!apiKey) {
    return res.status(401).json({
      error: "AuthenticationError",
      message: "API key is required",
    });
  }

  if (apiKey !== validApiKey) {
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

// Error handler
app.use((err, req, res, next) => {
  req.log.error({ err }, "Request error");
  const isProduction = process.env.NODE_ENV === "production";
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    error: err.name || "InternalError",
    message:
      isProduction && statusCode === 500
        ? "An internal error occurred"
        : err.message,
  });
});

// Start server
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  logger.info({ port: PORT, url }, "S3 proxy server started");
  console.log(`\n🚀 S3 Proxy Server running at: ${url}\n`);
});
