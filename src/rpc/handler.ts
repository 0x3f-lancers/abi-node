import { toHex } from "viem";

const CHAIN_ID = 31337;
let blockNumber = 1;

type RpcResult = { result: unknown } | { error: { code: number; message: string } };

const handlers: Record<string, (params: unknown[]) => RpcResult> = {
  eth_chainId: () => ({
    result: toHex(CHAIN_ID),
  }),

  eth_blockNumber: () => ({
    result: toHex(blockNumber),
  }),
};

export async function handleRpcRequest(
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
}
