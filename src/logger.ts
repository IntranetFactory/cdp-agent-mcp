/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';

import {debug} from './third_party/index.js';

const mcpDebugNamespace = 'mcp:log';

const namespacesToEnable = [
  mcpDebugNamespace,
  ...(process.env['DEBUG'] ? [process.env['DEBUG']] : []),
];

export function saveLogsToFile(fileName: string): fs.WriteStream {
  // Enable overrides everything so we need to add them
  debug.enable(namespacesToEnable.join(','));

  const logFile = fs.createWriteStream(fileName, {flags: 'a+'});
  debug.log = function (...chunks: any[]) {
    logFile.write(`${chunks.join(' ')}\n`);
  };
  logFile.on('error', function (error) {
    console.error(`Error when opening/writing to log file: ${error.message}`);
    logFile.end();
    process.exit(1);
  });
  return logFile;
}

export function flushLogs(
  logFile: fs.WriteStream,
  timeoutMs = 2000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(reject, timeoutMs);
    logFile.end(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export const logger = debug(mcpDebugNamespace);

/**
 * Always logs to stderr, regardless of DEBUG env var.
 * Use for actual errors that should never be silenced.
 */
export function logError(message: string, ...args: unknown[]): void {
  console.error(message, ...args);
  // Also send to debug channel so it appears in log files if configured
  logger(message, ...args);
}
