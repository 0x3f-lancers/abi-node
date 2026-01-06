import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface Config {
  port?: number;
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
