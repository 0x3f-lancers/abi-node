import type { AbiParameter } from "viem";

const DEFAULT_ADDRESS = "0x000000000000000000000000000000000000dEaD";

export function generateDefaultValue(param: AbiParameter): unknown {
  const type = param.type;

  // Handle arrays
  if (type.endsWith("[]")) {
    // Return empty array for dynamic arrays
    return [];
  }

  // Handle fixed-size arrays like uint256[3]
  const fixedArrayMatch = type.match(/^(.+)\[(\d+)\]$/);
  if (fixedArrayMatch) {
    const baseType = fixedArrayMatch[1];
    const size = parseInt(fixedArrayMatch[2], 10);
    const baseParam = { ...param, type: baseType } as AbiParameter;
    return Array.from({ length: size }, () => generateDefaultValue(baseParam));
  }

  // Handle tuples
  if (type === "tuple" && "components" in param && param.components) {
    const result: Record<string, unknown> = {};
    for (const component of param.components) {
      result[component.name || ""] = generateDefaultValue(component);
    }
    return result;
  }

  // Handle basic types
  if (type.startsWith("uint")) {
    return 1n;
  }

  if (type.startsWith("int")) {
    return 0n;
  }

  if (type === "bool") {
    return true;
  }

  if (type === "address") {
    return DEFAULT_ADDRESS;
  }

  if (type === "string") {
    return "mock";
  }

  if (type.startsWith("bytes")) {
    // bytes32, bytes, etc.
    if (type === "bytes") {
      return "0x";
    }
    // Fixed bytes like bytes32
    const size = parseInt(type.slice(5), 10);
    return ("0x" + "00".repeat(size)) as `0x${string}`;
  }

  // Fallback
  return null;
}

export function generateDefaultValues(params: readonly AbiParameter[]): unknown[] {
  return params.map((p) => generateDefaultValue(p));
}
