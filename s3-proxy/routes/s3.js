import express from "express";
import {
  listPrefixes,
  listObjects,
  searchObjects,
} from "../services/s3Service.js";

const DEFAULTS = {
  PAGE_SIZE: 25,
};

const LIMITS = {
  MIN_PAGE_SIZE: 1,
  MAX_PAGE_SIZE: 200,
  MAX_PREFIX_LENGTH: 500,
  MAX_SEARCH_QUERY_LENGTH: 200,
};

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

// Express parses repeated query params (?prefix=a&prefix=b) into arrays and
// bracketed ones into objects. Only plain strings are valid here, and letting
// anything else through would reach the AWS SDK with a confusing error.
function requireString(value, name, { required = false, maxLength } = {}) {
  if (value === undefined) {
    if (required) throw new ValidationError(`${name} is required`);
    return "";
  }
  if (typeof value !== "string") {
    throw new ValidationError(`${name} must be a single string value`);
  }
  if (required && value.length === 0) {
    throw new ValidationError(`${name} is required`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new ValidationError(
      `${name} exceeds maximum length of ${maxLength}`,
    );
  }
  return value;
}

function parsePrefix(value) {
  const prefix = requireString(value, "prefix", {
    maxLength: LIMITS.MAX_PREFIX_LENGTH,
  });
  // ".." has no traversal meaning in S3 keys, but rejecting it keeps the
  // proxy from being used to probe unexpected key shapes.
  if (prefix.includes("..")) {
    throw new ValidationError("Invalid prefix format");
  }
  return prefix;
}

function parsePageSize(value) {
  if (value === undefined) return DEFAULTS.PAGE_SIZE;
  const str = requireString(value, "pageSize");
  // Reject "25abc" style input that parseInt would silently accept.
  const pageSize = /^\d+$/.test(str) ? Number(str) : NaN;
  if (
    Number.isNaN(pageSize) ||
    pageSize < LIMITS.MIN_PAGE_SIZE ||
    pageSize > LIMITS.MAX_PAGE_SIZE
  ) {
    throw new ValidationError(
      `pageSize must be between ${LIMITS.MIN_PAGE_SIZE} and ${LIMITS.MAX_PAGE_SIZE}`,
    );
  }
  return pageSize;
}

// Wrap an async handler so thrown errors reach the central error handler in
// server.js, which decides what detail is safe to return per environment.
const asyncHandler = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};

export function getRouter() {
  const router = express.Router();

  // GET /prefixes - list "folders" (common prefixes) directly under a path
  router.get(
    "/prefixes",
    asyncHandler(async (req, res) => {
      const prefix = parsePrefix(req.query.prefix);
      res.json(await listPrefixes(prefix));
    }),
  );

  // GET /objects - list files directly under a path, paginated
  router.get(
    "/objects",
    asyncHandler(async (req, res) => {
      const prefix = parsePrefix(req.query.prefix);
      const pageSize = parsePageSize(req.query.pageSize);
      const continuationToken = requireString(
        req.query.continuationToken,
        "continuationToken",
      );
      res.json(await listObjects(prefix, pageSize, continuationToken || null));
    }),
  );

  // GET /search - filename substring search under a path (recursive)
  router.get(
    "/search",
    asyncHandler(async (req, res) => {
      const q = requireString(req.query.q, "q (search query)", {
        required: true,
        maxLength: LIMITS.MAX_SEARCH_QUERY_LENGTH,
      });
      const prefix = parsePrefix(req.query.prefix);
      const pageSize = parsePageSize(req.query.pageSize);
      res.json(await searchObjects(q, prefix, pageSize));
    }),
  );

  return router;
}
