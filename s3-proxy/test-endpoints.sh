#!/bin/bash

# Test script for S3 Proxy endpoints
# Make sure to set your API_KEY before running

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:5284"
API_KEY="${API_KEY:-your-api-key-here}"

if [ "$API_KEY" = "your-api-key-here" ]; then
  echo -e "${RED}Error: Please set the API_KEY environment variable${NC}"
  echo "Usage: API_KEY=your-key ./test-endpoints.sh"
  exit 1
fi

echo -e "${BLUE}Testing S3 Proxy Server${NC}"
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Health Check (no auth required)
echo -e "${BLUE}1. Testing Health Check (no auth)${NC}"
curl -s "$BASE_URL/health" | jq '.' || echo -e "${RED}Failed${NC}"
echo ""
echo ""

# Test 2: List Root Prefixes (folders at root level)
echo -e "${BLUE}2. Testing List Root Prefixes${NC}"
curl -s -H "x-api-key: $API_KEY" "$BASE_URL/api/s3/prefixes" | jq '.' || echo -e "${RED}Failed${NC}"
echo ""
echo ""

# Test 3: List Root Objects (files at root level)
echo -e "${BLUE}3. Testing List Root Objects${NC}"
curl -s -H "x-api-key: $API_KEY" "$BASE_URL/api/s3/objects?pageSize=10" | jq '.' || echo -e "${RED}Failed${NC}"
echo ""
echo ""

# Test 4: List Objects with Prefix (modify if you know a folder name)
echo -e "${BLUE}4. Testing List Objects with Prefix (optional)${NC}"
echo "Skipping - add your own prefix to test"
# Uncomment and modify the line below to test a specific folder:
# curl -s -H "x-api-key: $API_KEY" "$BASE_URL/api/s3/objects?prefix=your-folder-name/&pageSize=10" | jq '.' || echo -e "${RED}Failed${NC}"
echo ""
echo ""

# Test 5: Search Objects (modify search term as needed)
echo -e "${BLUE}5. Testing Search Objects${NC}"
echo "Searching for 'test'"
curl -s -H "x-api-key: $API_KEY" "$BASE_URL/api/s3/search?q=test&pageSize=5" | jq '.' || echo -e "${RED}Failed${NC}"
echo ""
echo ""

# Test 6: Test Authentication Failure
echo -e "${BLUE}6. Testing Auth Failure (should return 401)${NC}"
curl -s -H "x-api-key: wrong-key" "$BASE_URL/api/s3/prefixes" | jq '.' || echo -e "${RED}Failed${NC}"
echo ""
echo ""

# Test 7: Test Missing API Key
echo -e "${BLUE}7. Testing Missing API Key (should return 401)${NC}"
curl -s "$BASE_URL/api/s3/prefixes" | jq '.' || echo -e "${RED}Failed${NC}"
echo ""
echo ""

echo -e "${GREEN}Testing complete!${NC}"
