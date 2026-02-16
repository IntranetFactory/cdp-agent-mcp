# cdp-agent-mcp

MCP server for Chrome DevTools browser automation. Fork of [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) adapted for Docker deployment with HTTP transport. See [README_CHROME_DEVTOOLS_MCP.md](./README_CHROME_DEVTOOLS_MCP.md) for the original upstream docs.

## Changes from upstream

- **HTTP transport** — `/mcp` (Streamable HTTP) and `/sse` (legacy SSE) endpoints instead of STDIO
- **Config file** — Single `cdp-agent-mcp.config.json` drives all settings, no CLI flags needed
- **Screenshots to disk** — Never embedded as base64. Saved to disk, download URL returned. Keeps context small
- **Screenshot route** — `/screenshot/:filename` serves saved screenshots over HTTP
- **Docker image** — Based on [linuxserver/baseimage-kasmvnc](https://github.com/linuxserver/docker-baseimage-kasmvnc) with Chrome preinstalled. Openbox autostart launches Chrome with CDP on port 9222, then starts the MCP server connected to it

## Prerequisites

- Node.js v20.19+ or v22.12+
- npm
- Chrome/Chromium (preinstalled in Docker image)

## Setup

```bash
git clone <repo-url> cdp-agent-mcp
cd cdp-agent-mcp
npm install
npm run build
```

## Config file

Everything is configured in **`cdp-agent-mcp.config.json`**. The server searches for it in this order:

1. Path passed via `--config <path>` flag
2. `./cdp-agent-mcp.config.json` in the current working directory
3. `/config/cdp-agent-mcp.config.json` (Docker volume mount)

```json
{
  "browser": {
    "cdpEndpoint": "http://127.0.0.1:9222",
    "viewport": "1280x720"
  },
  "server": {
    "transport": "http",
    "port": 3002,
    "host": "0.0.0.0"
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

The same config works everywhere. In Docker, the autostart script launches Chrome with CDP on port 9222. For local development, start Chrome yourself first (see [Local development](#local-development) below).

All keys are optional — omit what you don't need. Full reference:

| Key | Default | What it does |
|-----|---------|--------------|
| `browser.cdpEndpoint` | — | Connect to running Chrome (e.g. `http://127.0.0.1:9222`). If empty, launches a new instance |
| `browser.wsEndpoint` | — | WebSocket endpoint, alternative to cdpEndpoint |
| `browser.headless` | `true` | Headless mode. Set `false` to see the browser in KasmVNC |
| `browser.executablePath` | — | Path to Chrome binary. Empty = system Chrome / puppeteer's Chrome |
| `browser.channel` | `"stable"` | Chrome channel: `stable`, `canary`, `beta`, `dev` |
| `browser.isolated` | `false` | Use a temp profile dir, cleaned up on exit |
| `browser.userDataDir` | — | Custom Chrome profile directory |
| `browser.viewport` | `"1280x720"` | Viewport size (`WxH`) |
| `browser.chromeArgs` | `[]` | Extra Chrome launch flags |
| `browser.acceptInsecureCerts` | `false` | Ignore SSL errors |
| `browser.proxyServer` | — | Proxy server for Chrome |
| `server.transport` | `"http"` | `"http"` or `"stdio"` |
| `server.port` | `3002` | HTTP server port |
| `server.host` | `"0.0.0.0"` | Bind address |
| `server.baseUrl` | — | Public URL for screenshot links. Set when behind a reverse proxy. If empty, uses `http://localhost:{port}` |
| `screenshots.dir` | `"/tmp/cdp-agent-mcp-screenshots"` | Where screenshots are saved |
| `categories.emulation` | `true` | Enable emulation tools |
| `categories.performance` | `true` | Enable performance tools |
| `categories.network` | `true` | Enable network tools |
| `telemetry.usageStatistics` | `false` | Send anonymous usage stats to Google |
| `telemetry.performanceCrux` | `true` | Send trace URLs to CrUX API |

## npm scripts

| Command | What it does |
|---------|--------------|
| `npm run build` | Compile TypeScript to `build/` |
| `npm run dev` | Build + run the server |
| `npm run debug` | Build + run with `DEBUG=mcp:*` verbose logging |
| `npm start` | Run the pre-built server (no compile — use after `npm run build`) |
| `npm test` | Build + run tests |

### Local development

Start Chrome with CDP enabled first, then run the MCP server:

```bash
# 1. Start Chrome with remote debugging
google-chrome --remote-debugging-port=9222 --no-first-run --no-default-browser-check &

# 2. Build and run the MCP server
npm run dev
```

On Windows:

```bash
# 1. Start Chrome with remote debugging
start chrome --remote-debugging-port=9222 --no-first-run --no-default-browser-check

# 2. Build and run the MCP server
npm run dev
```

### Debug mode

```bash
npm run debug
```

Same as dev but with full MCP protocol debug output (works on Windows, macOS, Linux).

### Production

```bash
npm run build
npm start
```

Build once, then run. This is what the Docker image does.

## Docker

The image is based on `linuxserver/baseimage-kasmvnc` — Chrome is preinstalled, KasmVNC provides a browser-accessible desktop for watching the browser. An openbox autostart script launches Chrome with CDP enabled on port 9222, then starts the MCP server connected to it.

### Build and run

```bash
docker build -t cdp-agent-mcp .
docker run -d \
  -p 3002:3002 \
  -p 3000:3000 \
  -v /path/to/config:/config \
  cdp-agent-mcp
```

| Port | What |
|------|------|
| `3002` | MCP server (HTTP endpoints) |
| `3000` | KasmVNC web desktop (watch the browser) |
| `9222` | Chrome remote debugging (optional, expose if needed) |

### Environment variables

| Variable | Default | What it does |
|----------|---------|--------------|
| `BASE_URL` | — | Public URL for screenshot links (e.g. `https://mcp.example.com`). Sets `server.baseUrl` in config |
| `VNC_USER` | `admin` | KasmVNC web UI username |
| `VNC_PASSWORD` | `changeme` | KasmVNC web UI password |

Copy `.env-sample` to `.env` and edit to configure.

### Config via volume

The config file lives at `/config/cdp-agent-mcp.config.json` inside the container. On first run, the default config is copied from the image into the `/config` volume. After that, edit the file in your mounted volume:

```bash
# Edit config on host
vim /path/to/config/cdp-agent-mcp.config.json

# Restart container to pick up changes
docker restart cdp-agent-mcp
```

### BASE_URL for proxied deployments

When behind a reverse proxy (nginx, traefik, dokploy), set `server.baseUrl` so screenshot URLs point to the correct public address:

```json
{
  "server": {
    "baseUrl": "https://mcp.example.com"
  }
}
```

Or via env var: `docker run -e BASE_URL=https://mcp.example.com ...`

> Docker Compose and dokploy deployment instructions coming in a future iteration.

## MCP client

Point your client at the HTTP endpoint:

```json
{
  "mcpServers": {
    "cdp-agent": {
      "url": "http://localhost:3002/mcp"
    }
  }
}
```

For legacy SSE clients: `http://localhost:3002/sse`

Verify it's running:

```bash
curl http://localhost:3002/health
# → {"status":"ok"}
```

## Screenshots

The `take_screenshot` tool saves to disk and returns a URL:

```
Screenshot saved. Download: http://localhost:3002/screenshot/1706789012345-a1b2c3d4.png
```

No base64 in the context. Download via the `/screenshot/` route when needed.

## HTTP routes

| Route | Method | Description |
|-------|--------|-------------|
| `/mcp` | POST, GET, DELETE | Streamable HTTP MCP (protocol v2025-11-25) |
| `/sse` | GET | Legacy SSE MCP (protocol v2024-11-05) |
| `/messages` | POST | Legacy SSE companion endpoint |
| `/screenshot/:filename` | GET | Download a saved screenshot |
| `/health` | GET | Returns `{"status":"ok"}` |

## Troubleshooting

### Enable debug logging

```bash
npm run debug
```

This sets `DEBUG=mcp:*` and shows all MCP protocol messages and internal logging. Works on Windows, macOS, and Linux (uses `cross-env`).

You can also pass `--log-file debug.log` to write logs to a file:

```bash
node build/src/index.js --log-file debug.log
```

### "Cannot connect" or server starts but MCP client can't reach it

1. Check the server is running: `curl http://localhost:3002/health` should return `{"status":"ok"}`
2. Chrome must be running with `--remote-debugging-port=9222` **before** starting the MCP server. In Docker the autostart handles this. Locally, start Chrome yourself first (see [Local development](#local-development))

### Windows: `'DEBUG' is not recognized`

This is fixed — `npm run debug` now uses `cross-env` which works on Windows. Make sure to run `npm install` after pulling.
