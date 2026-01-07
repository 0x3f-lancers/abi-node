import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
}

export async function loadConfig(cwd: string): Promise<Config> {
  const configPath = join(cwd, "abi.config.json");

  try {
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content) as Config;
  } catch {
    // Config file is optional
    return {};
  }
}
