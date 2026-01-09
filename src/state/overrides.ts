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
 * Supports both generic overrides and argument-specific overrides:
 * - "Contract.functionName" - matches any call
 * - "Contract.functionName(arg1, arg2)" - matches specific arguments
 */
export class OverrideStore {
  // Map of "address:functionName" -> override (generic)
  private overrides: Map<string, ResolvedOverride> = new Map();
  // Map of "address:functionName(args)" -> override (argument-specific)
  private argOverrides: Map<string, ResolvedOverride> = new Map();

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
      let functionPart = key.slice(dotIndex + 1);
      if (!target || !functionPart) continue;

      const resolved = this.parseOverrideValue(value);

      // Check if function has arguments: functionName(arg1, arg2)
      const argsMatch = functionPart.match(/^(\w+)\((.+)\)$/);
      const hasArgs = argsMatch !== null;
      const functionName = hasArgs ? argsMatch[1] : functionPart;
      const argsString = hasArgs ? argsMatch[2] : null;

      // Get addresses for this target
      let addresses: string[];
      if (target.startsWith("0x")) {
        addresses = [target.toLowerCase()];
      } else {
        addresses = nameToAddresses.get(target.toLowerCase()) ?? [];
      }

      // Register the override
      for (const addr of addresses) {
        if (hasArgs && argsString) {
          // Argument-specific override
          const normalizedKey = `${addr}:${functionName}(${this.normalizeArgs(argsString)})`;
          this.argOverrides.set(normalizedKey, resolved);
        } else {
          // Generic override
          const normalizedKey = `${addr}:${functionName}`;
          this.overrides.set(normalizedKey, resolved);
        }
      }
    }
  }

  /**
   * Normalize arguments string for consistent matching
   * Removes spaces, lowercases addresses
   */
  private normalizeArgs(argsString: string): string {
    return argsString
      .split(",")
      .map((arg) => {
        const trimmed = arg.trim();
        // Lowercase addresses
        if (trimmed.startsWith("0x")) {
          return trimmed.toLowerCase();
        }
        return trimmed;
      })
      .join(",");
  }

  /**
   * Convert decoded args to a normalized string for matching
   */
  private argsToString(args: readonly unknown[]): string {
    return args
      .map((arg) => {
        if (typeof arg === "bigint") {
          return arg.toString();
        }
        if (typeof arg === "string" && arg.startsWith("0x")) {
          return arg.toLowerCase();
        }
        if (typeof arg === "boolean") {
          return arg.toString();
        }
        return String(arg);
      })
      .join(",");
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
    // Auto-detect: if "value" is an array, treat it as "values"
    if (Array.isArray(value.value)) {
      return {
        type: "value",
        values: value.value,
      };
    }
    return {
      type: "value",
      value: value.value,
      values: value.values,
    };
  }

  /**
   * Get override for a specific address, function, and optional args
   * Checks argument-specific override first, then falls back to generic
   */
  get(address: string, functionName: string, args?: readonly unknown[]): ResolvedOverride | undefined {
    const normalizedAddr = address.toLowerCase();

    // First, check for argument-specific override
    if (args && args.length > 0) {
      const argsString = this.argsToString(args);
      const argKey = `${normalizedAddr}:${functionName}(${argsString})`;
      const argOverride = this.argOverrides.get(argKey);
      if (argOverride) {
        return argOverride;
      }
    }

    // Fall back to generic override
    const genericKey = `${normalizedAddr}:${functionName}`;
    return this.overrides.get(genericKey);
  }

  /**
   * Check if an override exists for a specific address, function, and optional args
   */
  has(address: string, functionName: string, args?: readonly unknown[]): boolean {
    const normalizedAddr = address.toLowerCase();

    // Check for argument-specific override
    if (args && args.length > 0) {
      const argsString = this.argsToString(args);
      const argKey = `${normalizedAddr}:${functionName}(${argsString})`;
      if (this.argOverrides.has(argKey)) {
        return true;
      }
    }

    // Check for generic override
    const genericKey = `${normalizedAddr}:${functionName}`;
    return this.overrides.has(genericKey);
  }

  /**
   * Get count of configured overrides (for logging)
   */
  get size(): number {
    return this.overrides.size + this.argOverrides.size;
  }
}
