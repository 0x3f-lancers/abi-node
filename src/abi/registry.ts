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

export function buildRegistry(
  abiFiles: AbiFile[],
  configContracts?: Record<string, string>
): ContractRegistry {
  const registry = new ContractRegistry();

  // If config has contract mappings, use those
  if (configContracts) {
    const addressToName = new Map<string, string>();

    // Invert: config is address -> path, we need to match by filename
    for (const [address, path] of Object.entries(configContracts)) {
      const name = path.split("/").pop()?.replace(".json", "") ?? path;
      addressToName.set(name, address);
    }

    for (const { name, abi } of abiFiles) {
      const address = addressToName.get(name) ?? generateAddress(registry.all().length);
      registry.register(address, name, abi);
    }
  } else {
    // Auto-assign addresses
    for (let i = 0; i < abiFiles.length; i++) {
      const { name, abi } = abiFiles[i];
      registry.register(generateAddress(i), name, abi);
    }
  }

  return registry;
}
