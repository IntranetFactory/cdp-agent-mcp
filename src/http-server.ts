/**
 * HTTP server for cdp-agent-mcp.
 * Provides /mcp (Streamable HTTP), /sse + /messages (legacy SSE), and /screenshot/ routes.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

import type {McpServer} from './third_party/index.js';
import {
  StreamableHTTPServerTransport,
  SSEServerTransport,
  isInitializeRequest,
} from './third_party/index.js';
import {getScreenshotPath, getScreenshotsDir} from './screenshots.js';
import {logger} from './logger.js';

type Transport = StreamableHTTPServerTransport | SSEServerTransport;

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, DELETE, OPTIONS',
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Mcp-Session-Id, Last-Event-ID, Authorization',
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Mcp-Session-Id',
  );
}

function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      if (!body) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  res.writeHead(statusCode, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(data));
}

function sendJsonRpcError(
  res: http.ServerResponse,
  statusCode: number,
  code: number,
  message: string,
): void {
  sendJson(res, statusCode, {
    jsonrpc: '2.0',
    error: {code, message},
    id: null,
  });
}

export interface HttpServerOptions {
  port: number;
  host?: string;
  server: McpServer;
}

export function createHttpServer(
  options: HttpServerOptions,
): http.Server {
  const {port, host = '0.0.0.0', server: mcpServer} = options;

  // Track transports by session ID
  const transports: Record<string, Transport> = {};

  const httpServer = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    try {
      // ─── Streamable HTTP transport: /mcp ───
      if (pathname === '/mcp') {
        await handleMcpRoute(req, res, mcpServer, transports);
        return;
      }

      // ─── Legacy SSE transport: /sse (GET) ───
      if (pathname === '/sse' && req.method === 'GET') {
        await handleSseRoute(req, res, mcpServer, transports);
        return;
      }

      // ─── Legacy SSE transport: /messages (POST) ───
      if (pathname === '/messages' && req.method === 'POST') {
        await handleMessagesRoute(req, res, url, transports);
        return;
      }

      // ─── Screenshot download: /screenshot/:filename ───
      if (pathname.startsWith('/screenshot/')) {
        await handleScreenshotRoute(pathname, res);
        return;
      }

      // ─── Health check ───
      if (pathname === '/health') {
        sendJson(res, 200, {status: 'ok'});
        return;
      }

      // ─── 404 ───
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end('Not Found');
    } catch (error) {
      logger('HTTP handler error:', error);
      if (!res.headersSent) {
        sendJsonRpcError(res, 500, -32603, 'Internal server error');
      }
    }
  });

  httpServer.listen(port, host, () => {
    const baseUrl = process.env['BASE_URL'] || `http://localhost:${port}`;
    console.error(`\nCDP Agent MCP server listening on port ${port}`);
    console.error(`MCP endpoint:    ${baseUrl}/mcp`);
    console.error(`SSE endpoint:    ${baseUrl}/sse`);
    console.error(`Screenshots:     ${baseUrl}/screenshot/`);
    console.error(`Health check:    ${baseUrl}/health`);
    console.error(`Screenshots dir: ${getScreenshotsDir()}\n`);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down server...');
    for (const sessionId in transports) {
      try {
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        logger(`Error closing transport for session ${sessionId}:`, error);
      }
    }
    httpServer.close();
    process.exit(0);
  });

  return httpServer;
}

async function handleMcpRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  mcpServer: McpServer,
  transports: Record<string, Transport>,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    const existing = transports[sessionId];
    if (existing instanceof StreamableHTTPServerTransport) {
      transport = existing;
    } else {
      sendJsonRpcError(res, 400, -32000, 'Session uses a different transport protocol');
      return;
    }
  } else if (!sessionId && req.method === 'POST') {
    const body = await parseBody(req);
    if (isInitializeRequest(body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          logger(`StreamableHTTP session initialized: ${sid}`);
          transports[sid] = transport;
        },
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
        }
      };
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    } else {
      sendJsonRpcError(res, 400, -32000, 'Bad Request: expected initialization request');
      return;
    }
  } else if (!sessionId) {
    sendJsonRpcError(res, 400, -32000, 'Bad Request: No session ID provided');
    return;
  } else {
    sendJsonRpcError(res, 404, -32000, 'Session not found');
    return;
  }

  // For existing sessions, parse body for POST requests
  if (req.method === 'POST') {
    const body = await parseBody(req);
    await transport.handleRequest(req, res, body);
  } else {
    await transport.handleRequest(req, res);
  }
}

async function handleSseRoute(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  mcpServer: McpServer,
  transports: Record<string, Transport>,
): Promise<void> {
  const transport = new SSEServerTransport('/messages', res);
  transports[transport.sessionId] = transport;
  res.on('close', () => {
    delete transports[transport.sessionId];
  });
  await mcpServer.connect(transport);
}

async function handleMessagesRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  transports: Record<string, Transport>,
): Promise<void> {
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) {
    sendJsonRpcError(res, 400, -32000, 'Missing sessionId query parameter');
    return;
  }
  const transport = transports[sessionId];
  if (!(transport instanceof SSEServerTransport)) {
    sendJsonRpcError(res, 400, -32000, 'No SSE transport found for sessionId');
    return;
  }
  const body = await parseBody(req);
  await transport.handlePostMessage(req, res, body);
}

async function handleScreenshotRoute(
  pathname: string,
  res: http.ServerResponse,
): Promise<void> {
  const filename = decodeURIComponent(pathname.slice('/screenshot/'.length));
  // Prevent path traversal
  if (filename.includes('..') || filename.includes('/')) {
    res.writeHead(400, {'Content-Type': 'text/plain'});
    res.end('Bad Request');
    return;
  }

  const filePath = getScreenshotPath(filename);
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': data.length,
      'Content-Disposition': `inline; filename="${filename}"`,
    });
    res.end(data);
  } catch {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('Screenshot not found');
  }
}
