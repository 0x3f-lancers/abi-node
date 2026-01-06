import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface Config {
  port?: number;
  blockTime?: number; // seconds between blocks (default: 1, 0 = instant mining)
  proxyRpc?: string;
  contracts?: Record<string, string>; // address -> ABI file path
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
