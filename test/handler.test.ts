import { describe, it, expect } from "vitest";
import { createRpcHandler } from "../src/rpc/handler";
import type { Blockchain } from "../src/blockchain/chain";

describe("Optional: RPC Handler", () => {
  it("should return a Method not found error for unknown methods", async () => {
    const mockBlockchain = {} as Blockchain;
    const handler = createRpcHandler(mockBlockchain);

    const result = await handler("unknown_method", []);

    expect(result).toEqual({
      error: {
        code: -32601,
        message: "Method not found: unknown_method",
      },
    });
  });

  it("should format blockchain errors into a valid JSON-RPC error", async () => {
    const mockBlockchain = {
      call: () => {
        throw new Error("VM execution reverted");
      },
    } as unknown as Blockchain;
    const handler = createRpcHandler(mockBlockchain);

    const result = await handler("eth_call", [
      { to: "0x123", data: "0x456" },
    ]);

    expect(result).toEqual({
      error: {
        code: -32000,
        message: "VM execution reverted",
      },
    });
  });

  it("should return the result from a successful blockchain call", async () => {
    const mockBlockchain = {
      chainId: 1337,
    } as unknown as Blockchain;
    const handler = createRpcHandler(mockBlockchain);

    const result = await handler("eth_chainId", []);
    expect(result).toEqual({ result: "0x539" });
  });
});
