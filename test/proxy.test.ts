import { describe, it, expect, beforeEach } from "vitest";
import { parseAbi, encodeFunctionData, decodeAbiParameters } from "viem";
import { Blockchain } from "../src/blockchain/chain";
import { ContractRegistry } from "../src/abi/registry";
import { createRpcHandler } from "../src/rpc/handler";
import type { ProxyClient } from "../src/rpc/proxy";

// Mock ABI for testing
const tokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function getReserves() view returns (uint256, uint256)",
]);

const MOCK_ADDRESS = "0x0000000000000000000000000000000000000001";
const MOCK_SENDER = "0x0000000000000000000000000000000000000099";

describe("Proxy Mode", () => {
  let registry: ContractRegistry;
  let blockchain: Blockchain;

  beforeEach(() => {
    registry = new ContractRegistry();
    registry.register(MOCK_ADDRESS, "Token", tokenAbi);
    blockchain = new Blockchain(registry, 0);
  });

  it("should identify known contracts correctly", () => {
    expect(blockchain.isKnownContract(MOCK_ADDRESS)).toBe(true);
    expect(
      blockchain.isKnownContract(
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as `0x${string}`
      )
    ).toBe(false);
  });

  it("should forward unknown contract calls to proxy when configured", async () => {
    // Create a mock proxy
    const mockProxy = {
      call: async (method: string, params: unknown[]) => {
        if (method === "eth_call") {
          return "0x0000000000000000000000000000000000000000000000000000000000000001";
        }
        throw new Error("Unknown method");
      },
      url: "http://mock-proxy",
    };

    const handler = createRpcHandler({
      blockchain,
      proxy: mockProxy as unknown as ProxyClient,
    });

    const unknownAddress = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const callData = encodeFunctionData({
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [MOCK_SENDER],
    });

    const result = await handler("eth_call", [
      { to: unknownAddress, data: callData },
    ]);

    expect(result).toHaveProperty("result");
    expect((result as { result: string }).result).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000001"
    );
  });

  it("should handle known contracts locally even with proxy configured", async () => {
    const mockProxy = {
      call: async () => {
        throw new Error("Should not be called for known contracts");
      },
      url: "http://mock-proxy",
    };

    const handler = createRpcHandler({
      blockchain,
      proxy: mockProxy as unknown as ProxyClient,
    });

    const callData = encodeFunctionData({
      abi: tokenAbi,
      functionName: "totalSupply",
    });

    const result = await handler("eth_call", [
      { to: MOCK_ADDRESS, data: callData },
    ]);

    // Should return local mock result (default 1n for uint256)
    expect(result).toHaveProperty("result");
    const [supply] = decodeAbiParameters(
      [{ type: "uint256" }],
      (result as { result: `0x${string}` }).result
    );
    expect(supply).toBe(1n); // Default value
  });

  it("should use local handlers even when proxy is configured (local wins)", async () => {
    const mockProxy = {
      call: async () => {
        throw new Error("Should not be called - local handlers take precedence");
      },
      url: "http://mock-proxy",
    };

    const handler = createRpcHandler({
      blockchain,
      proxy: mockProxy as unknown as ProxyClient,
    });

    // eth_getBalance has a local handler, so proxy should NOT be called
    const result = await handler("eth_getBalance", [MOCK_ADDRESS, "latest"]);

    expect(result).toHaveProperty("result");
    // Local handler returns 100 ETH (0x56bc75e2d63100000)
    expect((result as { result: string }).result).toBe("0x56bc75e2d63100000");
  });

  it("should forward truly unknown methods to proxy", async () => {
    const mockProxy = {
      call: async (method: string) => {
        if (method === "eth_someCustomMethod") {
          return "0xabcd";
        }
        throw new Error("Unknown method");
      },
      url: "http://mock-proxy",
    };

    const handler = createRpcHandler({
      blockchain,
      proxy: mockProxy as unknown as ProxyClient,
    });

    // Custom method not in local handlers should be proxied
    const result = await handler("eth_someCustomMethod", []);

    expect(result).toHaveProperty("result");
    expect((result as { result: string }).result).toBe("0xabcd");
  });
});
