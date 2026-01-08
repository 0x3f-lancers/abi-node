import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Abi } from "viem";
import type { AbiFile } from "./loader.js";

export interface ContractEntry {
  address: string;
  name: string;
  abi: Abi;
}

export class ContractRegistry {
  private contracts: Map<string, ContractEntry> = new Map();

  register(address: string, name: string, abi: Abi): void {
    const normalized = address.toLowerCase();
    this.contracts.set(normalized, { address: normalized, name, abi });
  }

  get(address: string): ContractEntry | undefined {
    return this.contracts.get(address.toLowerCase());
  }

  all(): ContractEntry[] {
    return Array.from(this.contracts.values());
  }

  clear(): void {
    this.contracts.clear();
  }
}

// Generate deterministic addresses for auto-assignment
function generateAddress(index: number): string {
  const hex = (index + 1).toString(16).padStart(40, "0");
  return `0x${hex}`;
}

/**
 * Convert JavaScript object notation to JSON
 */
function jsToJson(content: string): string {
  return (
    content
      // Remove single-line comments
      .replace(/\/\/[^\n]*/g, "")
      // Remove multi-line comments
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
      .replace(/,\s*([}\]])/g, "$1")
  );
}

/**
 * Extract the complete array by counting brackets
 */
function extractArray(content: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let i = startIndex;

  while (i < content.length) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : "";

    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (!inString) {
      if (char === "[") depth++;
      if (char === "]") {
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
 * Parse a TypeScript file that exports an ABI in viem format
 */
function parseTsAbi(content: string): Abi | null {
  const exportMatch = content.match(/export\s+const\s+\w+\s*=\s*\[/);
  if (!exportMatch) {
    return null;
  }

  const arrayStartIndex = exportMatch.index! + exportMatch[0].length - 1;
  const arrayContent = extractArray(content, arrayStartIndex);
  if (!arrayContent) {
    return null;
  }

  const jsonContent = jsToJson(arrayContent);

  try {
    return JSON.parse(jsonContent) as Abi;
  } catch {
    return null;
  }
}

/**
 * Load ABI from a file path (.json or .ts)
 */
async function loadAbiFromPath(filePath: string, cwd: string): Promise<Abi | null> {
  const fullPath = resolve(cwd, filePath);

  if (!existsSync(fullPath)) {
    console.warn(`ABI file not found: ${fullPath}`);
    return null;
  }

  try {
    const content = await readFile(fullPath, "utf-8");

    // Handle TypeScript files
    if (filePath.endsWith(".ts")) {
      const abi = parseTsAbi(content);
      if (!abi) {
        console.warn(`No ABI export found in: ${filePath}`);
        return null;
      }
      return abi;
    }

    // Handle JSON files
    const parsed = JSON.parse(content);

    // Handle both raw ABI arrays and objects with "abi" property
    const abi: Abi = Array.isArray(parsed)
      ? parsed
      : (parsed as Record<string, unknown>)?.abi as Abi;

    if (!abi) {
      console.warn(`No ABI found in: ${filePath}`);
      return null;
    }

    return abi;
  } catch (err) {
    console.warn(`Failed to load ABI from ${filePath}: ${err instanceof Error ? err.message : "Unknown error"}`);
    return null;
  }
}

/**
 * Populate a registry with contracts from config
 * Used for both initial build and hot reload
 */
export async function populateRegistry(
  registry: ContractRegistry,
  abiFiles: AbiFile[],
  configContracts?: Record<string, string>,
  cwd = process.cwd()
): Promise<void> {
  // First, load contracts from config (address -> path mapping)
  if (configContracts) {
    for (const [address, path] of Object.entries(configContracts)) {
      const abi = await loadAbiFromPath(path, cwd);
      if (abi) {
        const name = path.split("/").pop()?.replace(/\.(json|ts)$/, "") ?? path;
        registry.register(address, name, abi);
      }
    }
  }

  // Then, add any abiFiles that weren't already registered
  // Auto-assign addresses for files not in config
  for (const { name, abi } of abiFiles) {
    // Check if already registered by config
    const alreadyRegistered = registry.all().some(c => c.name === name);
    if (!alreadyRegistered) {
      registry.register(generateAddress(registry.all().length), name, abi);
    }
  }
}

export async function buildRegistry(
  abiFiles: AbiFile[],
  configContracts?: Record<string, string>,
  cwd = process.cwd()
): Promise<ContractRegistry> {
  const registry = new ContractRegistry();
  await populateRegistry(registry, abiFiles, configContracts, cwd);
  return registry;
}
