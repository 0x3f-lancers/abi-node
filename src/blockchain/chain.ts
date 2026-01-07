import {
  decodeFunctionData,
  encodeAbiParameters,
  type Abi,
  type AbiFunction,
} from "viem";
import type { ContractRegistry } from "../abi/registry.js";
import { generateDefaultValues } from "../abi/defaults.js";
import { findMatchingEvents, generateEventLog } from "../abi/events.js";
import { StateStore } from "../state/store.js";
import type {
  Block,
  Transaction,
  TransactionReceipt,
  PendingTransaction,
  Log,
} from "./types.js";

const GENESIS_HASH: `0x${string}` = `0x${"0".repeat(64)}`;
const CHAIN_ID = 31337;

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

  constructor(
    private registry: ContractRegistry,
    private blockTime: number = 1,
    private onBlockMined?: (block: Block) => void
  ) {
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
      throw new Error(`Unknown contract address: ${to}`);
    }

    const decoded = decodeFunctionData({
      abi: contract.abi,
      data,
    });

    const abiFunc = getAbiFunction(contract.abi, decoded.functionName);
    if (!abiFunc || !abiFunc.outputs || abiFunc.outputs.length === 0) {
      return "0x";
    }

    // Check state first, then fall back to defaults
    const storedValues = this.state.get(
      to,
      decoded.functionName,
      decoded.args ?? []
    );
    const values = storedValues ?? generateDefaultValues(abiFunc.outputs);

    return encodeAbiParameters(abiFunc.outputs, values);
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
