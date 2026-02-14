# cdp-agent-mcp

A Docker-ready MCP server for Chrome DevTools browser automation, forked from [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp). See [README_CHROME_DEVTOOLS_MCP.md](./README_CHROME_DEVTOOLS_MCP.md) for the original documentation.

## What's different

This fork is optimized for running inside Docker containers with HTTP-based MCP clients:

- **HTTP transport by default** — Runs as an HTTP server with `/mcp` (Streamable HTTP) and `/sse` (legacy SSE) endpoints instead of STDIO
- **Screenshots saved to disk** — Screenshots are no longer embedded as base64 in responses (which bloats context). They are always saved to `/tmp/cdp-agent-mcp-screenshots/` and a download URL is returned instead
- **Screenshot download route** — A `/screenshot/:filename` HTTP route serves saved screenshots for download
- **`BASE_URL` environment variable** — Used to construct screenshot download URLs (required when behind a reverse proxy or Docker port mapping)
- **No npx required** — Designed to run directly with `node` inside a container

## Quick start

### Build and run locally

```bash
npm install
npm run build
node build/src/index.js
```

The server starts on port 3002 by default and prints its endpoints:

```
CDP Agent MCP server listening on port 3002
MCP endpoint:    http://localhost:3002/mcp
SSE endpoint:    http://localhost:3002/sse
Screenshots:     http://localhost:3002/screenshot/
Health check:    http://localhost:3002/health
Screenshots dir: /tmp/cdp-agent-mcp-screenshots
```

### Docker

```bash
docker build -t cdp-agent-mcp .
docker run -p 3002:3002 -e BASE_URL=http://localhost:3002 cdp-agent-mcp
```

### MCP client configuration

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

For legacy SSE clients, use `http://localhost:3002/sse`.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:$PORT` | Base URL for constructing screenshot download URLs. Set this when running behind a reverse proxy or with Docker port mapping |
| `PORT` | `3002` | HTTP server port (can also use `--port` CLI flag) |
| `PUPPETEER_SKIP_DOWNLOAD` | — | Set to `true` to skip Chrome download during `npm install` (use when Chrome is pre-installed in the container) |

## CLI options

All original chrome-devtools-mcp CLI options are supported. New options:

| Option | Default | Description |
|--------|---------|-------------|
| `--transport` | `http` | Transport mode: `http` or `stdio` |
| `--port` | `3002` | HTTP server port (only used with `--transport=http`) |

### Examples

```bash
# HTTP mode (default) on custom port
node build/src/index.js --port 8080

# STDIO mode (original behavior)
node build/src/index.js --transport=stdio

# Connect to existing Chrome instance
node build/src/index.js --browser-url http://127.0.0.1:9222

# Headless mode
node build/src/index.js --headless
```

## Screenshots

Screenshots are saved to `/tmp/cdp-agent-mcp-screenshots/` with unique filenames. The `take_screenshot` tool returns a download URL instead of embedding the image:

```
Screenshot saved. Download: http://localhost:3002/screenshot/1706789012345-a1b2c3d4.png
```

The `/screenshot/:filename` route serves the files directly. This keeps the MCP context small even with many screenshots in a session.

## API routes

| Route | Method | Description |
|-------|--------|-------------|
| `/mcp` | POST, GET, DELETE | Streamable HTTP MCP endpoint |
| `/sse` | GET | Legacy SSE MCP endpoint |
| `/messages` | POST | Legacy SSE message endpoint |
| `/screenshot/:filename` | GET | Download a saved screenshot |
| `/health` | GET | Health check endpoint |
