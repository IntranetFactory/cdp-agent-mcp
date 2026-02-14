/**
 * Screenshot directory management for cdp-agent-mcp.
 * Screenshots are saved to a persistent directory under /tmp and served via HTTP.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

function getConfiguredDir(): string {
  return process.env['SCREENSHOTS_DIR'] || '/tmp/cdp-agent-mcp-screenshots';
}

/**
 * Ensures the screenshots directory exists. Called once at startup.
 */
export async function initScreenshotsDir(): Promise<void> {
  await fs.mkdir(getConfiguredDir(), {recursive: true});
}

/**
 * Saves a screenshot to the screenshots directory with a unique filename.
 * Returns the filename (not full path) for use in URLs.
 */
export async function saveScreenshot(
  data: Uint8Array,
  extension: string,
): Promise<string> {
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
  const filePath = path.join(getConfiguredDir(), filename);
  await fs.writeFile(filePath, data);
  return filename;
}

/**
 * Returns the full filesystem path for a screenshot filename.
 */
export function getScreenshotPath(filename: string): string {
  return path.join(getConfiguredDir(), filename);
}

/**
 * Returns the screenshots directory path.
 */
export function getScreenshotsDir(): string {
  return getConfiguredDir();
}

/**
 * Builds the download URL for a screenshot given the BASE_URL and filename.
 */
export function getScreenshotUrl(filename: string): string {
  const baseUrl = process.env['BASE_URL'] || `http://localhost:${process.env['PORT'] || '3002'}`;
  return `${baseUrl.replace(/\/$/, '')}/screenshot/${filename}`;
}
