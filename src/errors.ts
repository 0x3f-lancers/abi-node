/**
 * Base class for all abi-node errors
 */
export abstract class AbiNodeError extends Error {
  abstract readonly code: number;
  abstract readonly data?: unknown;
}

/**
 * Contract address not registered in the mock
 */
export class UnknownContractError extends AbiNodeError {
  readonly code = -32000;
  readonly data: { address: string };

  constructor(address: string) {
    super(
      `Unknown contract address: ${address}. Register it in abi.config.json or add ABI to the abis directory.`
    );
    this.name = "UnknownContractError";
    this.data = { address };
  }
}

/**
 * Failed to decode calldata against ABI
 */
export class DecodeError extends AbiNodeError {
  readonly code = -32602;
  readonly data: { address: string; selector: string; reason: string };

  constructor(address: string, data: string, originalError: unknown) {
    const selector = data.slice(0, 10);
    const reason =
      originalError instanceof Error
        ? originalError.message
        : "Unknown decode error";
    super(
      `Failed to decode calldata for ${address}. Selector: ${selector}. ${reason}`
    );
    this.name = "DecodeError";
    this.data = { address, selector, reason };
  }
}

/**
 * Simulated revert (from override or explicit simulation)
 */
export class RevertError extends AbiNodeError {
  readonly code = 3; // Standard EVM revert code
  readonly data: { reason: string };

  constructor(reason: string) {
    super(reason || "Execution reverted");
    this.name = "RevertError";
    this.data = { reason };
  }
}

/**
 * Function not found in ABI
 */
export class FunctionNotFoundError extends AbiNodeError {
  readonly code = -32602;
  readonly data: { address: string; selector: string; contractName: string };

  constructor(address: string, selector: string, contractName: string) {
    super(
      `Function with selector ${selector} not found in ${contractName} (${address})`
    );
    this.name = "FunctionNotFoundError";
    this.data = { address, selector, contractName };
  }
}
