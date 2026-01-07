import { toHex } from "viem";
import type { Blockchain } from "../blockchain/chain.js";
import { ProxyClient, ProxyError } from "./proxy.js";
import {
  AbiNodeError,
  UnknownContractError,
  RevertError,
} from "../errors.js";

type RpcResult =
  | { result: unknown }
  | { error: { code: number; message: string; data?: unknown } };

interface EthCallParams {
  to: string;
  data: string;
  from?: string;
}

interface HandlerOptions {
  blockchain: Blockchain;
  proxy?: ProxyClient;
}

// System methods that should be proxied when proxy is configured
const PROXY_SYSTEM_METHODS = [
  "eth_getBalance",
  "eth_getCode",
  "eth_gasPrice",
  "eth_estimateGas",
  "eth_getTransactionCount",
  "eth_accounts",
  "eth_getStorageAt",
];

export function createRpcHandler(options: HandlerOptions) {
  const { blockchain, proxy } = options;

  const handlers: Record<
    string,
    (params: unknown[]) => RpcResult | Promise<RpcResult>
  > = {
    eth_chainId: () => ({
      result: toHex(blockchain.chainId),
    }),

    eth_blockNumber: () => ({
      result: toHex(blockchain.blockNumber),
    }),

    eth_call: async (params) => {
      const [callParams] = params as [EthCallParams];
      const { to, data } = callParams;

      // Check if contract is known locally
      const isKnown = blockchain.isKnownContract(to as `0x${string}`);

      // If unknown and proxy configured, forward to upstream
      if (!isKnown && proxy) {
        try {
          const result = await proxy.call<string>("eth_call", params);
          return { result };
        } catch (err) {
          if (err instanceof ProxyError) {
            return { error: { code: err.code, message: err.message, data: err.data } };
          }
          return { error: { code: -32603, message: "Proxy error" } };
        }
      }

      // Local mock execution
      try {
        const result = blockchain.call(
          to as `0x${string}`,
          data as `0x${string}`
        );
        return { result };
      } catch (err) {
        return formatError(err);
      }
    },

    eth_sendTransaction: async (params) => {
      const [txParams] = params as [EthCallParams & { value?: string }];
      const {
        to,
        data,
        from = "0x0000000000000000000000000000000000000000",
      } = txParams;
      const value = txParams.value ? BigInt(txParams.value) : 0n;

      // Check if contract is known locally
      const isKnown = blockchain.isKnownContract(to as `0x${string}`);

      // If unknown and proxy configured, forward to upstream
      if (!isKnown && proxy) {
        try {
          const result = await proxy.call<string>("eth_sendTransaction", params);
          return { result };
        } catch (err) {
          if (err instanceof ProxyError) {
            return { error: { code: err.code, message: err.message, data: err.data } };
          }
          return { error: { code: -32603, message: "Proxy error" } };
        }
      }

      try {
        const txHash = blockchain.sendTransaction(
          from as `0x${string}`,
          to as `0x${string}`,
          data as `0x${string}`,
          value
        );
        return { result: txHash };
      } catch (err) {
        return formatError(err);
      }
    },

    eth_getTransactionReceipt: (params) => {
      const [txHash] = params as [string];
      const receipt = blockchain.getTransactionReceipt(
        txHash as `0x${string}`
      );

      if (!receipt) {
        // Check if pending
        if (blockchain.isPending(txHash as `0x${string}`)) {
          // Transaction is pending, return null (standard behavior)
          return { result: null };
        }
        // Unknown transaction
        return { result: null };
      }

      // Format receipt for JSON-RPC
      return {
        result: {
          transactionHash: receipt.transactionHash,
          transactionIndex: toHex(receipt.transactionIndex),
          blockNumber: toHex(receipt.blockNumber),
          blockHash: receipt.blockHash,
          from: receipt.from,
          to: receipt.to,
          gasUsed: toHex(receipt.gasUsed),
          cumulativeGasUsed: toHex(receipt.cumulativeGasUsed),
          status: receipt.status,
          logs: receipt.logs.map((log) => ({
            address: log.address,
            topics: log.topics,
            data: log.data,
            blockNumber: toHex(log.blockNumber),
            blockHash: log.blockHash,
            transactionHash: log.transactionHash,
            transactionIndex: toHex(log.transactionIndex),
            logIndex: toHex(log.logIndex),
          })),
        },
      };
    },

    eth_getBlockByNumber: (params) => {
      const [blockTag, _includeTransactions] = params as [string, boolean];

      let blockNum: number | "latest" | "pending";
      if (blockTag === "latest") {
        blockNum = "latest";
      } else if (blockTag === "pending") {
        blockNum = "pending";
      } else {
        blockNum = parseInt(blockTag, 16);
      }

      const block = blockchain.getBlock(blockNum);
      if (!block) {
        return { result: null };
      }

      return {
        result: {
          number: toHex(block.number),
          hash: block.hash,
          parentHash: block.parentHash,
          timestamp: toHex(block.timestamp),
          transactions: block.transactions.map((tx) => tx.hash),
        },
      };
    },

    eth_getLogs: (params) => {
      const [filter] = params as [
        {
          fromBlock?: string;
          toBlock?: string;
          address?: string;
          topics?: (string | null)[];
        }
      ];

      const fromBlock = filter.fromBlock
        ? filter.fromBlock === "latest"
          ? blockchain.blockNumber
          : parseInt(filter.fromBlock, 16)
        : 0;

      const toBlock = filter.toBlock
        ? filter.toBlock === "latest"
          ? blockchain.blockNumber
          : parseInt(filter.toBlock, 16)
        : blockchain.blockNumber;

      const logs = blockchain.getLogs({
        fromBlock,
        toBlock,
        address: filter.address as `0x${string}` | undefined,
        topics: filter.topics as (`0x${string}` | null)[] | undefined,
      });

      return {
        result: logs.map((log) => ({
          address: log.address,
          topics: log.topics,
          data: log.data,
          blockNumber: toHex(log.blockNumber),
          blockHash: log.blockHash,
          transactionHash: log.transactionHash,
          transactionIndex: toHex(log.transactionIndex),
          logIndex: toHex(log.logIndex),
        })),
      };
    },

    net_version: () => ({
      result: String(blockchain.chainId),
    }),

    // Mock eth_getBalance - returns a default balance
    eth_getBalance: () => ({
      result: "0x56bc75e2d63100000", // 100 ETH in wei
    }),

    // Mock eth_getCode - returns empty for unknown, 0x1 for known contracts
    eth_getCode: (params) => {
      const [address] = params as [string];
      const isKnown = blockchain.isKnownContract(address as `0x${string}`);
      return { result: isKnown ? "0x1" : "0x" };
    },

    // Mock eth_gasPrice
    eth_gasPrice: () => ({
      result: "0x3b9aca00", // 1 gwei
    }),

    // Mock eth_estimateGas
    eth_estimateGas: () => ({
      result: "0x5208", // 21000 gas
    }),

    // Mock eth_getTransactionCount
    eth_getTransactionCount: () => ({
      result: "0x0",
    }),

    // Mock eth_accounts - return empty array
    eth_accounts: () => ({
      result: [],
    }),
  };

  // Add proxy-only system methods when proxy is configured
  if (proxy) {
    for (const method of PROXY_SYSTEM_METHODS) {
      handlers[method] = async (params) => {
        try {
          const result = await proxy.call(method, params);
          return { result };
        } catch (err) {
          if (err instanceof ProxyError) {
            return { error: { code: err.code, message: err.message, data: err.data } };
          }
          return { error: { code: -32603, message: `Failed to proxy ${method}` } };
        }
      };
    }
  }

  return async function handleRpcRequest(
    method: string,
    params: unknown[]
  ): Promise<RpcResult> {
    const handler = handlers[method];

    if (!handler) {
      // If proxy exists, try forwarding unknown methods
      if (proxy) {
        try {
          const result = await proxy.call(method, params);
          return { result };
        } catch (err) {
          if (err instanceof ProxyError) {
            return { error: { code: err.code, message: err.message, data: err.data } };
          }
        }
      }
      return {
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
    }

    return handler(params);
  };
}

/**
 * Format an error for JSON-RPC response
 */
function formatError(err: unknown): RpcResult {
  if (err instanceof RevertError) {
    return {
      error: {
        code: 3,
        message: `execution reverted: ${err.message}`,
        data: err.data,
      },
    };
  }
  if (err instanceof AbiNodeError) {
    return {
      error: {
        code: err.code,
        message: err.message,
        data: err.data,
      },
    };
  }
  return {
    error: {
      code: -32000,
      message: err instanceof Error ? err.message : "Internal error",
    },
  };
}
