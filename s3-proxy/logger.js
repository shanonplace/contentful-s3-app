import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

const config = {
  level: process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),
  base: {
    env: process.env.NODE_ENV || "development",
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "*.password",
      "*.token",
      "*.apiKey",
      "*.secretAccessKey",
    ],
    censor: "[REDACTED]",
  },
};

if (isDevelopment) {
  config.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss",
    },
  };
}

const logger = pino(config);

export default logger;
