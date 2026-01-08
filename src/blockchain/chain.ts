import {
  decodeFunctionData,
  encodeAbiParameters,
  type Abi,
  type AbiFunction,
} from "viem";
import type { ContractRegistry } from "../abi/registry.js";
import { generateDefaultValue, generateDefaultValues } from "../abi/defaults.js";
import { findMatchingEvents, generateEventLog } from "../abi/events.js";
import { StateStore } from "../state/store.js";
import type { OverrideStore, ResolvedOverride } from "../state/overrides.js";
import { UnknownContractError, DecodeError, RevertError } from "../errors.js";
import type {
  Block,
  Transaction,
  TransactionReceipt,
  PendingTransaction,
  Log,
} from "./types.js";

const GENESIS_HASH: `0x${string}` = `0x${"0".repeat(64)}`;
const CHAIN_ID = 31337;

// Fallback responses for common selectors not in ABI
// Returns sensible defaults so probing contracts doesn't fail
const SELECTOR_FALLBACKS: Record<string, `0x${string}`> = {
  // ERC-165: supportsInterface(bytes4) -> false
  "0x01ffc9a7": `0x${"0".repeat(64)}`,
  // ERC-20: name() -> "Mock"
  "0x06fdde03": "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000044d6f636b00000000000000000000000000000000000000000000000000000000",
  // ERC-20: symbol() -> "MOCK"
  "0x95d89b41": "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000044d4f434b00000000000000000000000000000000000000000000000000000000",
  // ERC-20: decimals() -> 18
  "0x313ce567": "0x0000000000000000000000000000000000000000000000000000000000000012",
  // ERC-20: totalSupply() -> 1000000 * 10^18
  "0x18160ddd": "0x00000000000000000000000000000000000000000000d3c21bcecceda1000000",
  // ERC-20: balanceOf(address) -> 0
  "0x70a08231": `0x${"0".repeat(64)}`,
  // ERC-20: allowance(address,address) -> 0
  "0xdd62ed3e": `0x${"0".repeat(64)}`,
  // ERC-721: ownerOf(uint256) -> zero address
  "0x6352211e": "0x0000000000000000000000000000000000000000000000000000000000000000",
};

function generateBlockHash(blockNumber: number): `0x${string}` {
  const hex = blockNumber.toString(16).padStart(64, "0");
  return `0x${hex}`;
}

function generateTxHash(nonce: number): `0x${string}` {
  const hex = nonce.toString(16).padStart(64, "0");
  return `0x${hex}`;
}

function getAbiFunction(abi: Abi, name: string): AbiFunction | undefined {
  return abi.find(
    (item): item is AbiFunction =>
      item.type === "function" && item.name === name
  );
}

export class Blockchain {
  private blocks: Block[] = [];
  private mempool: PendingTransaction[] = [];
  private state: StateStore = new StateStore();
  private txNonce = 0;
  private miningInterval: NodeJS.Timeout | null = null;
  private receipts: Map<string, TransactionReceipt> = new Map();
  private overrides?: OverrideStore;

  constructor(
    private registry: ContractRegistry,
    private blockTime: number = 1,
    private onBlockMined?: (block: Block) => void,
    overrides?: OverrideStore
  ) {
    this.overrides = overrides;
    // Create genesis block
    this.blocks.push({
      number: 0,
      hash: GENESIS_HASH,
      parentHash: GENESIS_HASH,
      timestamp: Math.floor(Date.now() / 1000),
      transactions: [],
      receipts: [],
    });
  }

  get chainId(): number {
    return CHAIN_ID;
  }

  get latestBlock(): Block {
    return this.blocks[this.blocks.length - 1];
  }

  get blockNumber(): number {
    return this.latestBlock.number;
  }

  get pendingCount(): number {
    return this.mempool.length;
  }

  /**
   * Update the override store (used for hot reload)
   */
  setOverrides(overrides: OverrideStore | undefined): void {
    this.overrides = overrides;
  }

  /**
   * Check if an address is a known (registered) contract
   */
  isKnownContract(address: `0x${string}`): boolean {
    return this.registry.get(address) !== undefined;
  }

  /**
   * Start the auto-mining loop
   */
  startMining(): void {
    if (this.miningInterval) return;

    if (this.blockTime === 0) {
      // Instant mining mode - mine on each tx
      return;
    }

    this.miningInterval = setInterval(() => {
      this.mineBlock();
    }, this.blockTime * 1000);
  }

  /**
   * Stop the auto-mining loop
   */
  stopMining(): void {
    if (this.miningInterval) {
      clearInterval(this.miningInterval);
      this.miningInterval = null;
    }
  }

  /**
   * Submit a transaction to the mempool
   */
  sendTransaction(
    from: `0x${string}`,
    to: `0x${string}`,
    data: `0x${string}`,
    value: bigint = 0n
  ): `0x${string}` {
    const nonce = this.txNonce++;
    const hash = generateTxHash(nonce);

    // Decode transaction for logging
    const contract = this.registry.get(to);
    let contractName: string | undefined;
    let functionName: string | undefined;
    let args: readonly unknown[] | undefined;

    if (contract) {
      try {
        const decoded = decodeFunctionData({
          abi: contract.abi,
          data,
        });
        contractName = contract.name;
        functionName = decoded.functionName;
        args = decoded.args;
      } catch {
        // Ignore decode errors
      }
    }

    const tx: Transaction = {
      hash,
      from,
      to,
      data,
      value,
      nonce,
      contractName,
      functionName,
      args,
    };

    this.mempool.push({
      tx,
      addedAt: Date.now(),
    });

    // If instant mining mode, mine immediately
    if (this.blockTime === 0) {
      this.mineBlock();
    }

    return hash;
  }

  /**
   * Mine a new block with all pending transactions
   */
  mineBlock(): Block | null {
    const parentBlock = this.latestBlock;
    const blockNumber = parentBlock.number + 1;
    const blockHash = generateBlockHash(blockNumber);
    const timestamp = Math.floor(Date.now() / 1000);

    // Get pending transactions
    const pending = this.mempool.splice(0, this.mempool.length);
    const transactions: Transaction[] = [];
    const blockReceipts: TransactionReceipt[] = [];
    const blockLogs: Log[] = [];

    // Execute each transaction
    for (let i = 0; i < pending.length; i++) {
      const { tx } = pending[i];
      transactions.push(tx);

      // Execute transaction and update state
      const logs = this.executeTransaction(tx, blockNumber, blockHash, i);
      blockLogs.push(...logs);

      // Create receipt
      const receipt: TransactionReceipt = {
        transactionHash: tx.hash,
        transactionIndex: i,
        blockNumber,
        blockHash,
        from: tx.from,
        to: tx.to,
        gasUsed: 21000n,
        cumulativeGasUsed: BigInt(21000 * (i + 1)),
        status: "0x1",
        logs,
      };

      blockReceipts.push(receipt);
      this.receipts.set(tx.hash, receipt);
    }

    // Create block
    const block: Block = {
      number: blockNumber,
      hash: blockHash,
      parentHash: parentBlock.hash,
      timestamp,
      transactions,
      receipts: blockReceipts,
    };

    this.blocks.push(block);

    if (this.onBlockMined) {
      this.onBlockMined(block);
    }

    return block;
  }

  /**
   * Execute a transaction and update state
   */
  private executeTransaction(
    tx: Transaction,
    blockNumber: number,
    blockHash: `0x${string}`,
    txIndex: number
  ): Log[] {
    const contract = this.registry.get(tx.to);
    if (!contract) return [];

    try {
      const decoded = decodeFunctionData({
        abi: contract.abi,
        data: tx.data,
      });

      // Store state (value)
      // For set(value): keyArgs=[], values=[value]
      // For setFoo(key, value): keyArgs=[key], values=[value]
      if (decoded.args && decoded.args.length > 0) {
        const args = [...decoded.args];
        if (args.length === 1) {
          // Single arg: it's the value, no keys
          this.state.set(tx.to, decoded.functionName, [], args);
        } else {
          // Multiple args: last is value, rest are keys
          const value = args.pop()!;
          this.state.set(tx.to, decoded.functionName, args, [value]);
        }
      }

      // Generate event logs based on ABI events
      const matchingEvents = findMatchingEvents(
        contract.abi,
        decoded.functionName
      );
      const logs: Log[] = [];

      // Get function input names for better event parameter matching
      const abiFunc = getAbiFunction(contract.abi, decoded.functionName);
      const functionInputNames = abiFunc?.inputs.map((i) => i.name ?? "") ?? [];

      for (let i = 0; i < matchingEvents.length; i++) {
        const event = matchingEvents[i];
        const { topics, data } = generateEventLog(
          event,
          tx.to,
          tx.from,
          decoded.args ?? [],
          functionInputNames
        );

        logs.push({
          address: tx.to,
          topics,
          data,
          blockNumber,
          blockHash,
          transactionHash: tx.hash,
          transactionIndex: txIndex,
          logIndex: i,
        });
      }

      return logs;
    } catch {
      return [];
    }
  }

  /**
   * Execute a read call (eth_call)
   */
  call(to: `0x${string}`, data: `0x${string}`): `0x${string}` {
    const contract = this.registry.get(to);
    if (!contract) {
      throw new UnknownContractError(to);
    }

    let decoded;
    try {
      decoded = decodeFunctionData({
        abi: contract.abi,
        data,
      });
    } catch {
      // Function not in ABI - return fallback for common selectors
      const selector = data.slice(0, 10).toLowerCase();
      const fallback = SELECTOR_FALLBACKS[selector];
      if (fallback) {
        return fallback;
      }
      // Unknown selector - return empty
      return "0x";
    }

    const abiFunc = getAbiFunction(contract.abi, decoded.functionName);
    if (!abiFunc || !abiFunc.outputs || abiFunc.outputs.length === 0) {
      return "0x";
    }

    // Check overrides first (highest precedence)
    if (this.overrides?.has(to, decoded.functionName)) {
      const override = this.overrides.get(to, decoded.functionName)!;
      return this.applyOverride(override, abiFunc);
    }

    // Check state, then fall back to defaults
    const storedValues = this.state.get(
      to,
      decoded.functionName,
      decoded.args ?? []
    );
    const values = storedValues ?? generateDefaultValues(abiFunc.outputs);

    return encodeAbiParameters(abiFunc.outputs, values);
  }

  /**
   * Apply an override to generate return value
   */
  private applyOverride(
    override: ResolvedOverride,
    abiFunc: AbiFunction
  ): `0x${string}` {
    if (override.type === "revert") {
      throw new RevertError(override.revertReason ?? "");
    }

    const outputs = abiFunc.outputs ?? [];
    const values: unknown[] = [];

    if (override.values && override.values.length > 0) {
      // Multiple return values
      for (let i = 0; i < outputs.length; i++) {
        values.push(
          this.parseOverrideValue(outputs[i].type, override.values[i] ?? "0")
        );
      }
    } else if (override.value !== undefined) {
      // Single return value
      if (outputs.length === 1) {
        values.push(this.parseOverrideValue(outputs[0].type, override.value));
      } else {
        // If function has multiple outputs but only one value provided,
        // use it for first output and defaults for rest
        values.push(this.parseOverrideValue(outputs[0].type, override.value));
        for (let i = 1; i < outputs.length; i++) {
          values.push(generateDefaultValue(outputs[i]));
        }
      }
    } else {
      // No value specified, use defaults
      return encodeAbiParameters(outputs, generateDefaultValues(outputs));
    }

    return encodeAbiParameters(outputs, values);
  }

  /**
   * Parse a string value to the appropriate type
   */
  private parseOverrideValue(type: string, value: string): unknown {
    if (type.startsWith("uint") || type.startsWith("int")) {
      return BigInt(value);
    }
    if (type === "bool") {
      return value === "true" || value === "1";
    }
    if (type === "address") {
      return value;
    }
    if (type === "string") {
      return value;
    }
    if (type.startsWith("bytes")) {
      return value.startsWith("0x") ? value : `0x${value}`;
    }
    return value;
  }

  /**
   * Get transaction receipt (null if pending)
   */
  getTransactionReceipt(hash: `0x${string}`): TransactionReceipt | null {
    return this.receipts.get(hash) ?? null;
  }

  /**
   * Check if transaction is pending
   */
  isPending(hash: `0x${string}`): boolean {
    return this.mempool.some((p) => p.tx.hash === hash);
  }

  /**
   * Get block by number
   */
  getBlock(numberOrTag: number | "latest" | "pending"): Block | null {
    if (numberOrTag === "latest") {
      return this.latestBlock;
    }
    if (numberOrTag === "pending") {
      // Return a virtual pending block
      return {
        number: this.latestBlock.number + 1,
        hash: `0x${"0".repeat(64)}`,
        parentHash: this.latestBlock.hash,
        timestamp: Math.floor(Date.now() / 1000),
        transactions: this.mempool.map((p) => p.tx),
        receipts: [],
      };
    }
    return this.blocks[numberOrTag] ?? null;
  }

  /**
   * Get logs matching filter
   */
  getLogs(filter: {
    fromBlock?: number;
    toBlock?: number;
    address?: `0x${string}`;
    topics?: (`0x${string}` | null)[];
  }): Log[] {
    const fromBlock = filter.fromBlock ?? 0;
    const toBlock = filter.toBlock ?? this.blockNumber;
    const logs: Log[] = [];

    for (let i = fromBlock; i <= toBlock; i++) {
      const block = this.blocks[i];
      if (!block) continue;

      for (const receipt of block.receipts) {
        for (const log of receipt.logs) {
          // Filter by address
          if (
            filter.address &&
            log.address.toLowerCase() !== filter.address.toLowerCase()
          ) {
            continue;
          }

          // Filter by topics
          if (filter.topics) {
            let match = true;
            for (let t = 0; t < filter.topics.length; t++) {
              if (
                filter.topics[t] !== null &&
                filter.topics[t] !== log.topics[t]
              ) {
                match = false;
                break;
              }
            }
            if (!match) continue;
          }

          logs.push(log);
        }
      }
    }

    return logs;
  }
}
