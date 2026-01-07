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
}

// Generate deterministic addresses for auto-assignment
function generateAddress(index: number): string {
  const hex = (index + 1).toString(16).padStart(40, "0");
  return `0x${hex}`;
}

/**
 * Load ABI from a file path
 */
async function loadAbiFromPath(filePath: string, cwd: string): Promise<Abi | null> {
  const fullPath = resolve(cwd, filePath);

  if (!existsSync(fullPath)) {
    console.warn(`ABI file not found: ${fullPath}`);
    return null;
  }

  try {
    const content = await readFile(fullPath, "utf-8");
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

export async function buildRegistry(
  abiFiles: AbiFile[],
  configContracts?: Record<string, string>,
  cwd = process.cwd()
): Promise<ContractRegistry> {
  const registry = new ContractRegistry();

  // First, load contracts from config (address -> path mapping)
  if (configContracts) {
    for (const [address, path] of Object.entries(configContracts)) {
      const abi = await loadAbiFromPath(path, cwd);
      if (abi) {
        const name = path.split("/").pop()?.replace(".json", "") ?? path;
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

  return registry;
}
