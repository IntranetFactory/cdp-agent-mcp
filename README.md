# cdp-agent-mcp

A Docker-ready MCP server for Chrome DevTools browser automation, forked from [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp). See [README_CHROME_DEVTOOLS_MCP.md](./README_CHROME_DEVTOOLS_MCP.md) for the original upstream documentation.

## What's different from upstream

- **HTTP transport by default** — Runs as an HTTP server with `/mcp` (Streamable HTTP) and `/sse` (legacy SSE) endpoints instead of STDIO
- **Config file driven** — All settings in one `cdp-agent-mcp.config.json` file, no CLI switches needed. Same file works locally and in Docker
- **Screenshots saved to disk** — Screenshots are never embedded as base64 in responses (which bloats context in long sessions). They're saved to disk and a download URL is returned
- **Screenshot download route** — `/screenshot/:filename` HTTP route serves saved screenshots
- **No npx** — Designed to run directly with `node` inside a container

## Prerequisites

- **Node.js** v20.19+ or v22.12+ (LTS recommended)
- **npm** (comes with Node.js)
- **Chrome/Chromium** — installed locally, or provided via the Docker image

## Setup

```bash
git clone <this-repo-url> cdp-agent-mcp
cd cdp-agent-mcp
npm install
npm run build
```

> If Chrome is already installed on your system (or you're building for Docker), set `PUPPETEER_SKIP_DOWNLOAD=true` before `npm install` to skip the bundled Chrome download.

## Configuration

All settings live in **`cdp-agent-mcp.config.json`** in the project root. Edit this one file to configure everything — the same file is used locally and copied into the Docker image.

```json
{
  "browser": {
    "cdpEndpoint": "",
    "wsEndpoint": "",
    "headless": true,
    "executablePath": "",
    "channel": "stable",
    "isolated": false,
    "userDataDir": "",
    "viewport": "1280x720",
    "chromeArgs": ["--no-sandbox", "--disable-setuid-sandbox"],
    "acceptInsecureCerts": false,
    "proxyServer": ""
  },
  "server": {
    "transport": "http",
    "port": 3002,
    "host": "0.0.0.0",
    "baseUrl": ""
  },
  "screenshots": {
    "dir": "/tmp/cdp-agent-mcp-screenshots"
  },
  "categories": {
    "emulation": true,
    "performance": true,
    "network": true
  },
  "telemetry": {
    "usageStatistics": false,
    "performanceCrux": true
  }
}
```

### Config reference

| Section | Key | Default | Description |
|---------|-----|---------|-------------|
| `browser` | `cdpEndpoint` | `""` | Connect to a running Chrome via CDP (e.g. `http://127.0.0.1:9222`). Leave empty to launch a new instance |
| | `wsEndpoint` | `""` | WebSocket endpoint alternative to cdpEndpoint |
| | `headless` | `true` | Run Chrome in headless mode (no UI) |
| | `executablePath` | `""` | Path to Chrome binary. Empty = use system Chrome or `PUPPETEER_EXECUTABLE_PATH` env |
| | `channel` | `"stable"` | Chrome channel: `stable`, `canary`, `beta`, `dev` |
| | `isolated` | `false` | Use a temporary user-data-dir, cleaned up on exit |
| | `userDataDir` | `""` | Custom Chrome profile directory |
| | `viewport` | `"1280x720"` | Initial viewport size |
| | `chromeArgs` | `["--no-sandbox", ...]` | Extra Chrome launch flags |
| | `acceptInsecureCerts` | `false` | Ignore SSL certificate errors |
| | `proxyServer` | `""` | Proxy server for Chrome |
| `server` | `transport` | `"http"` | `"http"` for HTTP server or `"stdio"` for stdin/stdout |
| | `port` | `3002` | HTTP server port |
| | `host` | `"0.0.0.0"` | HTTP server bind address |
| | `baseUrl` | `""` | Public URL for screenshot download links. Set when behind a reverse proxy. If empty, defaults to `http://localhost:{port}` |
| `screenshots` | `dir` | `"/tmp/cdp-agent-mcp-screenshots"` | Directory where screenshots are saved |
| `categories` | `emulation` | `true` | Enable/disable emulation tools |
| | `performance` | `true` | Enable/disable performance tools |
| | `network` | `true` | Enable/disable network tools |
| `telemetry` | `usageStatistics` | `false` | Send anonymous usage statistics to Google |
| | `performanceCrux` | `true` | Send trace URLs to CrUX API for field data |

## Running the server

### Development

```bash
npm run build && node build/src/index.js
```

Or use the `start` script which builds and runs:

```bash
npm start
```

### Development with debug logging

```bash
DEBUG=mcp:* npm start
```

Or set a log file in the config and use:

```bash
npm run start-debug
```

### Production

```bash
npm run build
NODE_ENV=production node build/src/index.js
```

All settings come from `cdp-agent-mcp.config.json` — no CLI flags needed. The server prints its endpoints on startup:

```
Loaded config from /app/cdp-agent-mcp.config.json

CDP Agent MCP server listening on port 3002
MCP endpoint:    http://localhost:3002/mcp
SSE endpoint:    http://localhost:3002/sse
Screenshots:     http://localhost:3002/screenshot/
Health check:    http://localhost:3002/health
Screenshots dir: /tmp/cdp-agent-mcp-screenshots
```

### Using a custom config file path

```bash
node build/src/index.js --config /etc/cdp-agent-mcp/config.json
```

### CLI overrides

Any setting from the config file can be overridden with CLI flags for one-off use:

```bash
node build/src/index.js --port 8080 --headless=false
```

## Docker

### Build and run

```bash
docker build -t cdp-agent-mcp .
docker run -p 3002:3002 cdp-agent-mcp
```

The Dockerfile copies `cdp-agent-mcp.config.json` into the image. To change settings, edit the config file and rebuild — or mount it at runtime:

```bash
docker run -p 3002:3002 \
  -v $(pwd)/cdp-agent-mcp.config.json:/app/cdp-agent-mcp.config.json \
  cdp-agent-mcp
```

### Setting BASE_URL for proxied deployments

When running behind a reverse proxy (nginx, traefik, dokploy), set `server.baseUrl` in the config so screenshot URLs point to the correct public address:

```json
{
  "server": {
    "baseUrl": "https://mcp.example.com"
  }
}
```

Or via environment variable:

```bash
docker run -p 3002:3002 -e BASE_URL=https://mcp.example.com cdp-agent-mcp
```

> Docker Compose and dokploy deployment instructions are planned for a future iteration.

## Connecting your MCP client

Point your MCP client at the HTTP endpoint:

```json
{
  "mcpServers": {
    "cdp-agent": {
      "url": "http://localhost:3002/mcp"
    }
  }
}
```

For legacy SSE-based clients, use `http://localhost:3002/sse` instead.

### Test the connection

```bash
curl http://localhost:3002/health
```

Should return `{"status":"ok"}`.

## Screenshots

Screenshots are always saved to disk (default: `/tmp/cdp-agent-mcp-screenshots/`) with unique filenames. The `take_screenshot` tool returns a download URL instead of embedding the image as base64:

```
Screenshot saved. Download: http://localhost:3002/screenshot/1706789012345-a1b2c3d4.png
```

This keeps the MCP context small even when taking dozens of screenshots in a session.

## API routes

| Route | Method | Description |
|-------|--------|-------------|
| `/mcp` | POST, GET, DELETE | Streamable HTTP MCP endpoint (protocol v2025-11-25) |
| `/sse` | GET | Legacy SSE MCP endpoint (protocol v2024-11-05) |
| `/messages` | POST | Legacy SSE message endpoint (paired with `/sse`) |
| `/screenshot/:filename` | GET | Download a saved screenshot |
| `/health` | GET | Health check — returns `{"status":"ok"}` |
