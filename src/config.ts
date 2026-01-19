import { readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Override value for a function
 * Can be a simple string value or structured object
 */
export interface OverrideValue {
  /** Single return value (for functions with one output) */
  value?: string;
  /** Multiple return values (for functions with multiple outputs) */
  values?: string[];
  /** Revert with this reason */
  revert?: string;
}

/**
 * Logging configuration
 */
export interface LogConfig {
  /** Show RPC requests and responses (default: true) */
  requests?: boolean;
  /** Show block mining messages (default: true) */
  blocks?: boolean;
  /** Only show blocks with transactions, hide empty blocks (default: false) */
  hideEmptyBlocks?: boolean;
}

export interface Config {
  port?: number;
  blockTime?: number; // seconds between blocks (default: 1, 0 = instant mining)
  proxyRpc?: string;
  contracts?: Record<string, string>; // address -> ABI file path
  /**
   * Override return values for specific functions
   * Key format: "ContractName.functionName" or "0xAddress.functionName"
   * Value: string (simple value) or OverrideValue object
   */
  overrides?: Record<string, string | OverrideValue>;
  /**
   * Logging configuration
   */
  logging?: LogConfig;
}

export interface LoadConfigResult {
  config: Config;
  configPath: string | null;
}

/**
 * Supported config file extensions in order of precedence
 */
const CONFIG_EXTENSIONS = [".ts", ".js", ".json"] as const;
export type ConfigFormat = "ts" | "js" | "json";

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert JavaScript object notation to JSON
 * Handles: { key: value } -> { "key": value }
 */
function jsToJson(content: string): string {
  // First, temporarily replace string contents to avoid modifying them
  // Use a format that won't match \w+ to avoid being treated as an unquoted key
  const stringPlaceholders: string[] = [];
  let processed = content
    // Replace double-quoted strings with placeholders
    .replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
      stringPlaceholders.push(match);
      return `\u0000${stringPlaceholders.length - 1}\u0000`;
    })
    // Replace single-quoted strings with placeholders (convert to double quotes)
    .replace(/'(?:[^'\\]|\\.)*'/g, (match) => {
      // Convert single quotes to double quotes
      const converted = '"' + match.slice(1, -1).replace(/"/g, '\\"').replace(/\\'/g, "'") + '"';
      stringPlaceholders.push(converted);
      return `\u0000${stringPlaceholders.length - 1}\u0000`;
    });

  // Now process the content safely
  processed = processed
    // Remove single-line comments (// ...)
    .replace(/\/\/[^\n]*/g, "")
    // Remove multi-line comments (/* ... */)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Add quotes around unquoted keys (word characters followed by colon)
    .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
    // Handle trailing commas (invalid in JSON)
    .replace(/,\s*([}\]])/g, "$1");

  // Restore string placeholders
  processed = processed.replace(/\u0000(\d+)\u0000/g, (_, index) => {
    return stringPlaceholders[parseInt(index, 10)];
  });

  return processed;
}

/**
 * Extract a complete object by counting braces
 */
function extractObject(content: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let i = startIndex;

  while (i < content.length) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : "";

    // Handle string boundaries
    if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    // Count braces only outside strings
    if (!inString) {
      if (char === "{") depth++;
      if (char === "}") {
        depth--;
        if (depth === 0) {
          return content.slice(startIndex, i + 1);
        }
      }
    }
    i++;
  }
  return null;
}

/**
 * Parse a TypeScript/JavaScript config file
 * Supports:
 * - export default { ... }
 * - export const config = { ... }
 * - module.exports = { ... }
 * - defineConfig({ ... })
 */
function parseTsJsConfig(content: string): Config | null {
  // Try patterns in order of preference
  const patterns = [
    // export default { ... }
    /export\s+default\s*\{/,
    // export const config = { ... }
    /export\s+const\s+config\s*=\s*\{/,
    // module.exports = { ... }
    /module\.exports\s*=\s*\{/,
    // defineConfig({ ... }) - for potential future use
    /defineConfig\s*\(\s*\{/,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      // Find the start of the object
      const objectStartIndex = match.index! + match[0].length - 1; // Position of '{'
      const objectContent = extractObject(content, objectStartIndex);

      if (objectContent) {
        try {
          const jsonContent = jsToJson(objectContent);
          return JSON.parse(jsonContent) as Config;
        } catch {
          // Try next pattern
          continue;
        }
      }
    }
  }

  return null;
}

/**
 * Find the config file path, checking multiple extensions
 * Returns the path if found, null otherwise
 */
export async function findConfigFile(cwd: string, configFile?: string): Promise<string | null> {
  // If a specific config file is provided
  if (configFile) {
    const configPath = configFile.startsWith("/") ? configFile : join(cwd, configFile);

    // If the path has an extension, use it directly
    if (configFile.match(/\.(ts|js|json)$/)) {
      if (await fileExists(configPath)) {
        return configPath;
      }
      return null;
    }

    // Otherwise, try each extension
    for (const ext of CONFIG_EXTENSIONS) {
      const pathWithExt = configPath + ext;
      if (await fileExists(pathWithExt)) {
        return pathWithExt;
      }
    }
    return null;
  }

  // Default: look for abi.config with each extension
  const baseName = "abi.config";
  for (const ext of CONFIG_EXTENSIONS) {
    const configPath = join(cwd, baseName + ext);
    if (await fileExists(configPath)) {
      return configPath;
    }
  }
  return null;
}

/**
 * Get the format of a config file based on its extension
 */
export function getConfigFormat(configPath: string): ConfigFormat {
  if (configPath.endsWith(".ts")) return "ts";
  if (configPath.endsWith(".js")) return "js";
  return "json";
}

/**
 * Load config from a specific path
 */
export async function loadConfigFromPath(configPath: string): Promise<Config> {
  const content = await readFile(configPath, "utf-8");
  const format = getConfigFormat(configPath);

  if (format === "json") {
    return JSON.parse(content) as Config;
  }

  // For TS/JS files, parse the content
  const config = parseTsJsConfig(content);
  if (config) {
    return config;
  }

  // Fallback: try dynamic import for JS files (handles more complex cases)
  if (format === "js") {
    try {
      // Use file URL for cross-platform compatibility
      const fileUrl = pathToFileURL(resolve(configPath)).href;
      // Add timestamp to bust cache
      const module = await import(`${fileUrl}?t=${Date.now()}`);
      return (module.default || module.config || module) as Config;
    } catch {
      // Fall through to return empty config
    }
  }

  throw new Error(`Failed to parse config file: ${configPath}`);
}

/**
 * Load configuration from file
 * Supports abi.config.ts, abi.config.js, or abi.config.json
 * Returns both the config and the resolved path (for hot reload)
 */
export async function loadConfig(cwd: string, configFile?: string): Promise<Config> {
  const configPath = await findConfigFile(cwd, configFile);

  if (!configPath) {
    // Config file is optional
    return {};
  }

  try {
    return await loadConfigFromPath(configPath);
  } catch {
    // Config file is optional, return empty on parse error
    return {};
  }
}

/**
 * Load configuration and return both config and path
 * Used by server for hot reload support
 */
export async function loadConfigWithPath(cwd: string, configFile?: string): Promise<LoadConfigResult> {
  const configPath = await findConfigFile(cwd, configFile);

  if (!configPath) {
    return { config: {}, configPath: null };
  }

  try {
    const config = await loadConfigFromPath(configPath);
    return { config, configPath };
  } catch {
    return { config: {}, configPath };
  }
}
