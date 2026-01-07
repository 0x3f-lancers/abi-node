import {
  type Abi,
  type AbiEvent,
  encodeAbiParameters,
  keccak256,
  toHex,
} from "viem";
import { generateDefaultValue } from "./defaults.js";

/**
 * Find events in ABI that might be emitted by a function.
 * Uses convention: function "transfer" might emit "Transfer" event.
 */
export function findMatchingEvents(abi: Abi, functionName: string): AbiEvent[] {
  const normalizedFn = functionName.toLowerCase();

  return abi.filter((item): item is AbiEvent => {
    if (item.type !== "event") return false;
    const eventName = item.name.toLowerCase();

    // Match if event name equals function name (case-insensitive)
    if (eventName === normalizedFn) return true;

    // Match if event name ends with function name (e.g., "ValueSet" matches "set")
    if (eventName.endsWith(normalizedFn)) return true;

    // Match if event name contains function name
    if (eventName.includes(normalizedFn)) return true;

    // setFoo -> Foo, FooSet, FooUpdated, FooChanged
    if (normalizedFn.startsWith("set") && normalizedFn.length > 3) {
      const baseName = normalizedFn.slice(3);
      if (
        eventName === baseName ||
        eventName === `${baseName}set` ||
        eventName === `${baseName}updated` ||
        eventName === `${baseName}changed`
      ) {
        return true;
      }
    }

    return false;
  });
}

/**
 * Generate event log data from an ABI event and function arguments.
 */
export function generateEventLog(
  event: AbiEvent,
  contractAddress: `0x${string}`,
  txFrom: `0x${string}`,
  functionArgs: readonly unknown[],
  functionInputNames?: string[]
): { topics: `0x${string}`[]; data: `0x${string}` } {
  const inputs = event.inputs ?? [];

  // Separate indexed and non-indexed inputs
  // const indexedInputs = inputs.filter((i) => i.indexed);
  const nonIndexedInputs = inputs.filter((i) => !i.indexed);

  // Build a map of function arg names to values
  const argMap = new Map<string, unknown>();
  if (functionInputNames) {
    for (let i = 0; i < functionInputNames.length; i++) {
      if (i < functionArgs.length) {
        argMap.set(functionInputNames[i].toLowerCase(), functionArgs[i]);
      }
    }
  }

  // Build values for each input
  const allValues: unknown[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const inputName = (input.name ?? "").toLowerCase();

    // Priority 1: Special handling for "from" or "sender" - use tx sender
    if (inputName === "from" || inputName === "sender") {
      allValues.push(txFrom);
      continue;
    }

    // Priority 2: Match by parameter name
    if (inputName && argMap.has(inputName)) {
      allValues.push(argMap.get(inputName));
      continue;
    }

    // Priority 3: For common patterns, try to find a match
    // "to" in event might match "to" or "recipient" in function
    if (inputName === "to") {
      const toValue =
        argMap.get("to") ?? argMap.get("recipient") ?? argMap.get("dst");
      if (toValue !== undefined) {
        allValues.push(toValue);
        continue;
      }
    }
    if (inputName === "amount" || inputName === "value") {
      const amountValue =
        argMap.get("amount") ?? argMap.get("value") ?? argMap.get("wad");
      if (amountValue !== undefined) {
        allValues.push(amountValue);
        continue;
      }
    }

    // Priority 4: Use default value
    allValues.push(generateDefaultValue(input));
  }

  // Build topics: first topic is event signature
  const topics: `0x${string}`[] = [];

  // Event signature (topic0)
  const eventSignature = `${event.name}(${inputs
    .map((i) => i.type)
    .join(",")})`;
  topics.push(keccak256(toHex(eventSignature)));

  // Indexed parameters (topics 1-3)
  for (let i = 0; i < inputs.length; i++) {
    if (inputs[i].indexed) {
      const value = allValues[i];
      // Encode indexed parameter as topic
      if (typeof value === "string" && value.startsWith("0x")) {
        // Address or bytes32 - pad to 32 bytes
        topics.push(`0x${value.slice(2).padStart(64, "0")}` as `0x${string}`);
      } else if (typeof value === "bigint") {
        topics.push(
          `0x${value.toString(16).padStart(64, "0")}` as `0x${string}`
        );
      } else if (typeof value === "boolean") {
        topics.push(
          `0x${(value ? "1" : "0").padStart(64, "0")}` as `0x${string}`
        );
      } else {
        // For complex types (strings, arrays), use hash
        topics.push(keccak256(toHex(String(value))));
      }
    }
  }

  // Encode non-indexed parameters as data
  let data: `0x${string}` = "0x";
  if (nonIndexedInputs.length > 0) {
    const nonIndexedValues = inputs
      .map((input, i) => (!input.indexed ? allValues[i] : null))
      .filter((v) => v !== null);

    try {
      data = encodeAbiParameters(nonIndexedInputs, nonIndexedValues);
    } catch {
      data = "0x";
    }
  }

  return { topics, data };
}
