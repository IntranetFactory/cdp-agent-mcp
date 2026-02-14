/**
 * Config file loader for cdp-agent-mcp.
 * Reads cdp-agent-mcp.config.json and provides typed settings.
 * CLI args override config file values; config file overrides defaults.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {logger} from './logger.js';

export interface BrowserConfig {
  cdpEndpoint?: string;
  wsEndpoint?: string;
  headless?: boolean;
  executablePath?: string;
  channel?: 'stable' | 'canary' | 'beta' | 'dev';
  isolated?: boolean;
  userDataDir?: string;
  viewport?: string;
  chromeArgs?: string[];
  acceptInsecureCerts?: boolean;
  proxyServer?: string;
}

export interface ServerConfig {
  transport?: 'http' | 'stdio';
  port?: number;
  host?: string;
  baseUrl?: string;
}

export interface ScreenshotsConfig {
  dir?: string;
}

export interface CategoriesConfig {
  emulation?: boolean;
  performance?: boolean;
  network?: boolean;
}

export interface TelemetryConfig {
  usageStatistics?: boolean;
  performanceCrux?: boolean;
}

export interface AppConfig {
  browser?: BrowserConfig;
  server?: ServerConfig;
  screenshots?: ScreenshotsConfig;
  categories?: CategoriesConfig;
  telemetry?: TelemetryConfig;
}

const DEFAULT_CONFIG_FILENAME = 'cdp-agent-mcp.config.json';

/**
 * Search paths for config file, in order of priority:
 * 1. Explicit --config path
 * 2. ./cdp-agent-mcp.config.json (CWD)
 * 3. /config/cdp-agent-mcp.config.json (Docker volume convention)
 */
const CONFIG_SEARCH_PATHS = [
  path.resolve(process.cwd(), DEFAULT_CONFIG_FILENAME),
  path.resolve('/config', DEFAULT_CONFIG_FILENAME),
];

/**
 * Loads config from the given path, or searches default locations.
 * Returns empty config if no file is found.
 */
export function loadConfig(configPath?: string): AppConfig {
  if (configPath) {
    const resolvedPath = path.resolve(configPath);
    return readConfigFile(resolvedPath, true);
  }

  for (const candidate of CONFIG_SEARCH_PATHS) {
    try {
      fs.accessSync(candidate);
      return readConfigFile(candidate, false);
    } catch {
      // not found, try next
    }
  }

  logger('No config file found, using defaults/CLI args');
  return {};
}

function readConfigFile(filePath: string, explicit: boolean): AppConfig {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(content) as AppConfig;
    console.error(`Loaded config from ${filePath}`);
    return config;
  } catch (err) {
    if (explicit) {
      console.error(`Warning: Could not load config from ${filePath}: ${(err as Error).message}`);
    }
    return {};
  }
}

/**
 * Checks whether a CLI flag was explicitly passed in process.argv.
 * Handles both --flag-name and --flagName (camelCase) forms.
 */
function wasExplicitlySet(flagName: string): boolean {
  const argv = process.argv.slice(2);
  const kebab = flagName.replace(/([A-Z])/g, '-$1').toLowerCase();
  const camel = flagName;
  for (const arg of argv) {
    if (
      arg === `--${kebab}` ||
      arg.startsWith(`--${kebab}=`) ||
      arg === `--${camel}` ||
      arg.startsWith(`--${camel}=`) ||
      arg === `--no-${kebab}` ||
      arg === `--no-${camel}`
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Applies config file values to the parsed CLI args object.
 * Only sets values that were NOT explicitly passed on the command line.
 * Mutates `args` in place.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyConfigToArgs(args: Record<string, any>, config: AppConfig): void {
  const b = config.browser ?? {};
  const s = config.server ?? {};
  const sc = config.screenshots ?? {};
  const c = config.categories ?? {};
  const t = config.telemetry ?? {};

  // Browser settings
  if (b.cdpEndpoint && !wasExplicitlySet('browser-url')) {
    args.browserUrl = b.cdpEndpoint;
  }
  if (b.wsEndpoint && !wasExplicitlySet('ws-endpoint')) {
    args.wsEndpoint = b.wsEndpoint;
  }
  if (b.headless !== undefined && !wasExplicitlySet('headless')) {
    args.headless = b.headless;
  }
  if (b.executablePath && !wasExplicitlySet('executable-path')) {
    args.executablePath = b.executablePath;
  }
  if (b.channel && !wasExplicitlySet('channel')) {
    args.channel = b.channel;
  }
  if (b.isolated !== undefined && !wasExplicitlySet('isolated')) {
    args.isolated = b.isolated;
  }
  if (b.userDataDir && !wasExplicitlySet('user-data-dir')) {
    args.userDataDir = b.userDataDir;
  }
  if (b.viewport && !wasExplicitlySet('viewport')) {
    const [width, height] = b.viewport.split('x').map(Number);
    if (width && height) {
      args.viewport = {width, height};
    }
  }
  if (b.chromeArgs?.length && !wasExplicitlySet('chrome-arg')) {
    args.chromeArg = b.chromeArgs;
  }
  if (b.acceptInsecureCerts !== undefined && !wasExplicitlySet('accept-insecure-certs')) {
    args.acceptInsecureCerts = b.acceptInsecureCerts;
  }
  if (b.proxyServer && !wasExplicitlySet('proxy-server')) {
    args.proxyServer = b.proxyServer;
  }

  // Server settings
  if (s.transport && !wasExplicitlySet('transport')) {
    args.transport = s.transport;
  }
  if (s.port !== undefined && !wasExplicitlySet('port')) {
    args.port = s.port;
  }
  if (s.baseUrl) {
    process.env['BASE_URL'] = s.baseUrl;
  }

  // Screenshots directory
  if (sc.dir) {
    process.env['SCREENSHOTS_DIR'] = sc.dir;
  }

  // Categories
  if (c.emulation !== undefined && !wasExplicitlySet('category-emulation')) {
    args.categoryEmulation = c.emulation;
  }
  if (c.performance !== undefined && !wasExplicitlySet('category-performance')) {
    args.categoryPerformance = c.performance;
  }
  if (c.network !== undefined && !wasExplicitlySet('category-network')) {
    args.categoryNetwork = c.network;
  }

  // Telemetry
  if (t.usageStatistics !== undefined && !wasExplicitlySet('usage-statistics')) {
    args.usageStatistics = t.usageStatistics;
  }
  if (t.performanceCrux !== undefined && !wasExplicitlySet('performance-crux')) {
    args.performanceCrux = t.performanceCrux;
  }

  // Re-evaluate channel default: if config set a browser connection endpoint,
  // clear the yargs-defaulted channel so it doesn't conflict
  if (
    (args.browserUrl || args.wsEndpoint) &&
    !wasExplicitlySet('channel') &&
    !b.channel
  ) {
    args.channel = undefined;
  }
}
