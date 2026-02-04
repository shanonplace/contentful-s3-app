import express from "express";
import {
  listPrefixes,
  listObjects,
  searchObjects,
} from "../services/s3Service.js";

const DEFAULTS = {
  PAGE_SIZE: 25,
  MAX_KEYS: 1000,
};

const LIMITS = {
  MIN_PAGE_SIZE: 1,
  MAX_PAGE_SIZE: 200,
  MAX_PREFIX_LENGTH: 500,
  MAX_SEARCH_QUERY_LENGTH: 200,
};

export function getRouter() {
  const router = express.Router();

  // GET /prefixes - List "folders" (common prefixes) at a given path
  router.get("/prefixes", async (req, res) => {
    try {
      const { prefix = "" } = req.query;

      if (prefix.length > LIMITS.MAX_PREFIX_LENGTH) {
        return res.status(400).json({
          error: "ValidationError",
          message: `prefix exceeds maximum length of ${LIMITS.MAX_PREFIX_LENGTH}`,
        });
      }

      if (prefix.includes("..")) {
        return res.status(400).json({
          error: "ValidationError",
          message: "Invalid prefix format",
        });
      }

      const result = await listPrefixes(prefix);
      res.json(result);
    } catch (error) {
      req.log.error({ error }, "Failed to list prefixes");
      res.status(error.statusCode || 500).json({
        error: error.name || "S3Error",
        message: error.message,
      });
    }
  });

  // GET /objects - List objects in a "folder" (prefix) with pagination
  router.get("/objects", async (req, res) => {
    try {
      const { prefix = "", pageSize, continuationToken } = req.query;

      if (prefix.length > LIMITS.MAX_PREFIX_LENGTH) {
        return res.status(400).json({
          error: "ValidationError",
          message: `prefix exceeds maximum length of ${LIMITS.MAX_PREFIX_LENGTH}`,
        });
      }

      if (prefix.includes("..")) {
        return res.status(400).json({
          error: "ValidationError",
          message: "Invalid prefix format",
        });
      }

      const pageSizeNum = pageSize ? parseInt(pageSize) : DEFAULTS.PAGE_SIZE;

      if (
        isNaN(pageSizeNum) ||
        pageSizeNum < LIMITS.MIN_PAGE_SIZE ||
        pageSizeNum > LIMITS.MAX_PAGE_SIZE
      ) {
        return res.status(400).json({
          error: "ValidationError",
          message: `pageSize must be between ${LIMITS.MIN_PAGE_SIZE} and ${LIMITS.MAX_PAGE_SIZE}`,
        });
      }

      const result = await listObjects(
        prefix,
        pageSizeNum,
        continuationToken || null
      );
      res.json(result);
    } catch (error) {
      req.log.error({ error }, "Failed to list objects");
      res.status(error.statusCode || 500).json({
        error: error.name || "S3Error",
        message: error.message,
      });
    }
  });

  // GET /search - Search objects by filename
  router.get("/search", async (req, res) => {
    try {
      const { q, prefix = "", pageSize } = req.query;

      if (!q) {
        return res.status(400).json({
          error: "ValidationError",
          message: "q (search query) is required",
        });
      }

      if (q.length > LIMITS.MAX_SEARCH_QUERY_LENGTH) {
        return res.status(400).json({
          error: "ValidationError",
          message: `Search query exceeds maximum length of ${LIMITS.MAX_SEARCH_QUERY_LENGTH}`,
        });
      }

      if (prefix.length > LIMITS.MAX_PREFIX_LENGTH) {
        return res.status(400).json({
          error: "ValidationError",
          message: `prefix exceeds maximum length of ${LIMITS.MAX_PREFIX_LENGTH}`,
        });
      }

      const pageSizeNum = pageSize ? parseInt(pageSize) : DEFAULTS.PAGE_SIZE;

      if (
        isNaN(pageSizeNum) ||
        pageSizeNum < LIMITS.MIN_PAGE_SIZE ||
        pageSizeNum > LIMITS.MAX_PAGE_SIZE
      ) {
        return res.status(400).json({
          error: "ValidationError",
          message: `pageSize must be between ${LIMITS.MIN_PAGE_SIZE} and ${LIMITS.MAX_PAGE_SIZE}`,
        });
      }

      const result = await searchObjects(q, prefix, pageSizeNum);
      res.json(result);
    } catch (error) {
      req.log.error({ error }, "Failed to search objects");
      res.status(error.statusCode || 500).json({
        error: error.name || "S3Error",
        message: error.message,
      });
    }
  });

  return router;
}
