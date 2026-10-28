# S3 Proxy Testing Guide

## Prerequisites

1. Fill in all required values in `.env`
2. Make sure your S3 bucket has some files in it
3. Install `jq` for pretty JSON output (optional): `brew install jq`

## Start the Server

```bash
cd s3-proxy
npm start
```

You should see a log line containing `S3 proxy server started` with the port.

## Quick Tests

### 1. Health Check (No Auth)

```bash
curl http://localhost:5284/health
```

Expected: `{"status":"ok","service":"s3-proxy"}`

### 2. Test Auth Failure

```bash
curl -H "x-api-key: wrong-key" http://localhost:5284/api/s3/prefixes
```

Expected: `{"error":"AuthenticationError","message":"Invalid API key"}`

### 3. List Root Folders

Replace `YOUR_API_KEY` with the value from your `.env` file:

```bash
curl -H "x-api-key: YOUR_API_KEY" http://localhost:5284/api/s3/prefixes
```

Expected: JSON with list of folders/prefixes at root level

### 4. List Root Files

```bash
curl -H "x-api-key: YOUR_API_KEY" "http://localhost:5284/api/s3/objects?pageSize=10"
```

Expected: JSON with list of files at root level

### 5. Search for Files

```bash
curl -H "x-api-key: YOUR_API_KEY" "http://localhost:5284/api/s3/search?q=test&pageSize=5"
```

Expected: JSON with files matching "test" in their name

## Using the Test Script

`jq` is required. `API_KEY` is required and must match the running server's
`.env`. `BASE_URL` defaults to `http://localhost:5284`.

```bash
API_KEY=your-actual-api-key ./test-endpoints.sh
API_KEY=your-actual-api-key BASE_URL=http://localhost:5999 ./test-endpoints.sh
```

The script runs nine checks and compares each HTTP status with the expected
one. It exits non-zero if any check fails.

| Check                 | Expected status |
| --------------------- | --------------- |
| Health check          | 200             |
| List root prefixes    | 200             |
| List root objects     | 200             |
| Search for "test"     | 200             |
| Wrong API key         | 401             |
| Missing API key       | 401             |
| Invalid pageSize      | 400             |
| Missing search query  | 400             |
| Repeated prefix param | 400             |

## Common Issues

### Server won't start

- The error message names the missing `.env` variable
- Check the port in `.env` isn't already in use

### 500 errors on S3 endpoints

- Verify AWS credentials have S3 permissions
- Check S3 bucket name is correct
- Verify AWS region matches your bucket's region

### Empty results

- Make sure your S3 bucket has files in it
- Try searching for a filename you know exists
- Check CloudFront domain is correct (for asset URLs)

## What Success Looks Like

- Health check returns `{"status":"ok"}`
- Wrong or missing API key returns 401
- Valid API key returns S3 data (folders, files, or empty arrays if bucket is empty)
- `displayUrl` values point at the CloudFront domain
- Invalid input returns 400 with a `ValidationError`
- The script prints `All checks passed`

Once all tests pass, you're ready to integrate with the Contentful app!
