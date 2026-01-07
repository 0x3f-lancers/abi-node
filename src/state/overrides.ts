import type { ContractRegistry } from "../abi/registry.js";
import type { OverrideValue } from "../config.js";

export interface ResolvedOverride {
  type: "value" | "revert";
  value?: string;
  values?: string[];
  revertReason?: string;
}

/**
 * Stores and resolves function overrides from config
 */
export class OverrideStore {
  // Map of "address:functionName" -> override
  private overrides: Map<string, ResolvedOverride> = new Map();

  constructor(
    rawOverrides: Record<string, string | OverrideValue>,
    registry: ContractRegistry
  ) {
    // Build lookup from contract names to addresses
    const nameToAddresses = new Map<string, string[]>();
    for (const entry of registry.all()) {
      const existing = nameToAddresses.get(entry.name.toLowerCase()) ?? [];
      existing.push(entry.address.toLowerCase());
      nameToAddresses.set(entry.name.toLowerCase(), existing);
    }

    // Process each override
    for (const [key, value] of Object.entries(rawOverrides)) {
      const dotIndex = key.indexOf(".");
      if (dotIndex === -1) continue;

      const target = key.slice(0, dotIndex);
      const functionName = key.slice(dotIndex + 1);
      if (!target || !functionName) continue;

      const resolved = this.parseOverrideValue(value);

      // Check if target is an address or contract name
      if (target.startsWith("0x")) {
        // Direct address
        const normalizedKey = `${target.toLowerCase()}:${functionName}`;
        this.overrides.set(normalizedKey, resolved);
      } else {
        // Contract name - resolve to all matching addresses
        const addresses = nameToAddresses.get(target.toLowerCase()) ?? [];
        for (const addr of addresses) {
          const normalizedKey = `${addr}:${functionName}`;
          this.overrides.set(normalizedKey, resolved);
        }
      }
    }
  }

  private parseOverrideValue(
    value: string | OverrideValue
  ): ResolvedOverride {
    if (typeof value === "string") {
      return { type: "value", value };
    }
    if (value.revert !== undefined) {
      return { type: "revert", revertReason: value.revert };
    }
    return {
      type: "value",
      value: value.value,
      values: value.values,
    };
  }

  /**
   * Get override for a specific address and function
   */
  get(address: string, functionName: string): ResolvedOverride | undefined {
    const key = `${address.toLowerCase()}:${functionName}`;
    return this.overrides.get(key);
  }

  /**
   * Check if an override exists for a specific address and function
   */
  has(address: string, functionName: string): boolean {
    const key = `${address.toLowerCase()}:${functionName}`;
    return this.overrides.has(key);
  }

  /**
   * Get count of configured overrides (for logging)
   */
  get size(): number {
    return this.overrides.size;
  }
}
