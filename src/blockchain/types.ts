export interface Transaction {
  hash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
  nonce: number;
  // Decoded info for internal use
  contractName?: string;
  functionName?: string;
  args?: readonly unknown[];
}

export interface TransactionReceipt {
  transactionHash: `0x${string}`;
  transactionIndex: number;
  blockNumber: number;
  blockHash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  gasUsed: bigint;
  cumulativeGasUsed: bigint;
  status: "0x1" | "0x0";
  logs: Log[];
}

export interface Log {
  address: `0x${string}`;
  topics: `0x${string}`[];
  data: `0x${string}`;
  blockNumber: number;
  blockHash: `0x${string}`;
  transactionHash: `0x${string}`;
  transactionIndex: number;
  logIndex: number;
}

export interface Block {
  number: number;
  hash: `0x${string}`;
  parentHash: `0x${string}`;
  timestamp: number;
  transactions: Transaction[];
  receipts: TransactionReceipt[];
}

export interface PendingTransaction {
  tx: Transaction;
  addedAt: number;
}
