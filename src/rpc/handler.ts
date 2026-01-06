import { toHex, decodeFunctionData } from "viem";
import type { ContractRegistry } from "../abi/registry.js";

const CHAIN_ID = 31337;
let blockNumber = 1;

type RpcResult =
  | { result: unknown }
  | { error: { code: number; message: string } };

interface EthCallParams {
  to: string;
  data: string;
  from?: string;
}

export function createRpcHandler(registry: ContractRegistry) {
  const handlers: Record<string, (params: unknown[]) => RpcResult> = {
    eth_chainId: () => ({
      result: toHex(CHAIN_ID),
    }),

    eth_blockNumber: () => ({
      result: toHex(blockNumber),
    }),

    eth_call: (params) => {
      const [callParams] = params as [EthCallParams];
      const { to, data } = callParams;

      // Look up contract in registry
      const contract = registry.get(to);
      if (!contract) {
        return {
          error: {
            code: -32000,
            message: `Unknown contract address: ${to}`,
          },
        };
      }

      // Decode function selector and args
      try {
        const decoded = decodeFunctionData({
          abi: contract.abi,
          data: data as `0x${string}`,
        });

        console.log(
          `[eth_call] ${contract.name}.${decoded.functionName}(${formatArgs(
            decoded.args
          )})`
        );

        // TODO: Phase 3 - Generate mock response based on ABI return types
        return {
          result: "0x",
        };
      } catch (err) {
        return {
          error: {
            code: -32000,
            message: `Failed to decode function: ${
              err instanceof Error ? err.message : "unknown error"
            }`,
          },
        };
      }
    },
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

function formatArgs(args: readonly unknown[] | undefined): string {
  if (!args || args.length === 0) return "";
  return args.map((a) => JSON.stringify(a)).join(", ");
}
