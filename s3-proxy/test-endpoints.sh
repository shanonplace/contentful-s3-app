#!/bin/bash
# Smoke-test the S3 proxy endpoints against a running server.
#
# Usage:
#   API_KEY=your-key ./test-endpoints.sh
#   API_KEY=your-key BASE_URL=http://localhost:5284 ./test-endpoints.sh
#
# API_KEY is required and must match the running server's .env. BASE_URL
# defaults to the port in .env.example; override it if the server runs elsewhere.
set -u

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

BASE_URL="${BASE_URL:-http://localhost:5284}"

if [ -z "${API_KEY:-}" ]; then
  echo -e "${RED}Error: API_KEY environment variable is not set${NC}"
  echo "Usage: API_KEY=your-key ./test-endpoints.sh"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo -e "${RED}Error: jq is required (brew install jq)${NC}"
  exit 1
fi

# Print the HTTP status and body for a request. Arguments: label, expected
# status, then the curl arguments.
request() {
  local label="$1" expected="$2"
  shift 2
  echo -e "${BLUE}${label}${NC}"
  local body status
  body=$(curl -s -w '\n%{http_code}' "$@")
  status=$(echo "$body" | tail -n1)
  body=$(echo "$body" | sed '$d')
  echo "$body" | jq '.' 2>/dev/null || echo "$body"
  if [ "$status" = "$expected" ]; then
    echo -e "${GREEN}HTTP ${status} (expected ${expected})${NC}"
  else
    echo -e "${RED}HTTP ${status} (expected ${expected})${NC}"
    FAILURES=$((FAILURES + 1))
  fi
  echo ""
}

FAILURES=0
echo -e "${BLUE}Testing S3 Proxy Server at ${BASE_URL}${NC}"
echo ""

request "1. Health check (no auth)" 200 "$BASE_URL/health"
request "2. List root prefixes" 200 -H "x-api-key: $API_KEY" "$BASE_URL/api/s3/prefixes"
request "3. List root objects" 200 -H "x-api-key: $API_KEY" "$BASE_URL/api/s3/objects?pageSize=10"
request "4. Search for 'test'" 200 -H "x-api-key: $API_KEY" "$BASE_URL/api/s3/search?q=test&pageSize=5"
request "5. Wrong API key" 401 -H "x-api-key: wrong-key" "$BASE_URL/api/s3/prefixes"
request "6. Missing API key" 401 "$BASE_URL/api/s3/prefixes"
request "7. Invalid pageSize" 400 -H "x-api-key: $API_KEY" "$BASE_URL/api/s3/objects?pageSize=abc"
request "8. Missing search query" 400 -H "x-api-key: $API_KEY" "$BASE_URL/api/s3/search"
request "9. Repeated prefix param" 400 -H "x-api-key: $API_KEY" "$BASE_URL/api/s3/prefixes?prefix=a&prefix=b"

if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}All checks passed${NC}"
else
  echo -e "${RED}${FAILURES} check(s) failed${NC}"
  exit 1
fi
