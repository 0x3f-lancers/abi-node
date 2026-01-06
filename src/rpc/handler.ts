import { toHex } from "viem";
import type { Blockchain } from "../blockchain/chain.js";

type RpcResult =
  | { result: unknown }
  | { error: { code: number; message: string } };

interface EthCallParams {
  to: string;
  data: string;
  from?: string;
}

export function createRpcHandler(blockchain: Blockchain) {
  const handlers: Record<string, (params: unknown[]) => RpcResult> = {
    eth_chainId: () => ({
      result: toHex(blockchain.chainId),
    }),

    eth_blockNumber: () => ({
      result: toHex(blockchain.blockNumber),
    }),

    eth_call: (params) => {
      const [callParams] = params as [EthCallParams];
      const { to, data } = callParams;

      try {
        const result = blockchain.call(
          to as `0x${string}`,
          data as `0x${string}`
        );
        return { result };
      } catch (err) {
        return {
          error: {
            code: -32000,
            message:
              err instanceof Error ? err.message : "Failed to process call",
          },
        };
      }
    },

    eth_sendTransaction: (params) => {
      const [txParams] = params as [EthCallParams & { value?: string }];
      const { to, data, from = "0x0000000000000000000000000000000000000000" } = txParams;
      const value = txParams.value ? BigInt(txParams.value) : 0n;

      try {
        const txHash = blockchain.sendTransaction(
          from as `0x${string}`,
          to as `0x${string}`,
          data as `0x${string}`,
          value
        );

        return { result: txHash };
      } catch (err) {
        return {
          error: {
            code: -32000,
            message:
              err instanceof Error
                ? err.message
                : "Failed to process transaction",
          },
        };
      }
    },

    eth_getTransactionReceipt: (params) => {
      const [txHash] = params as [string];
      const receipt = blockchain.getTransactionReceipt(txHash as `0x${string}`);

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
  };

  return async function handleRpcRequest(
    method: string,
    params: unknown[]
  ): Promise<RpcResult> {
    const handler = handlers[method];

    if (!handler) {
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
