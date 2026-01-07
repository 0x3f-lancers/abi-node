import { describe, it, expect, beforeEach } from "vitest";
import { parseAbi, encodeFunctionData } from "viem";
import { Blockchain } from "../src/blockchain/chain";
import { ContractRegistry } from "../src/abi/registry";
import { OverrideStore } from "../src/state/overrides";
import { createRpcHandler } from "../src/rpc/handler";
import { UnknownContractError, DecodeError } from "../src/errors";

// Mock ABI for testing
const tokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function getReserves() view returns (uint256, uint256)",
]);

const MOCK_ADDRESS = "0x0000000000000000000000000000000000000001";
const MOCK_SENDER = "0x0000000000000000000000000000000000000099";

describe("Error Handling", () => {
  let registry: ContractRegistry;
  let blockchain: Blockchain;

  beforeEach(() => {
    registry = new ContractRegistry();
    registry.register(MOCK_ADDRESS, "Token", tokenAbi);
    blockchain = new Blockchain(registry, 0);
  });

  it("should throw UnknownContractError for unregistered addresses", () => {
    const unknownAddress = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const callData = encodeFunctionData({
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [MOCK_SENDER],
    });

    expect(() =>
      blockchain.call(unknownAddress as `0x${string}`, callData)
    ).toThrow(UnknownContractError);
  });

  it("should throw DecodeError for invalid calldata", () => {
    const invalidData = "0x12345678"; // Invalid selector

    expect(() =>
      blockchain.call(MOCK_ADDRESS, invalidData as `0x${string}`)
    ).toThrow(DecodeError);
  });

  it("should format RevertError correctly in RPC response", async () => {
    const overrides = new OverrideStore(
      { "Token.transfer": { revert: "Insufficient balance" } },
      registry
    );
    const blockchainWithOverride = new Blockchain(
      registry,
      0,
      undefined,
      overrides
    );
    const handler = createRpcHandler({ blockchain: blockchainWithOverride });

    const callData = encodeFunctionData({
      abi: tokenAbi,
      functionName: "transfer",
      args: [MOCK_SENDER, 100n],
    });

    const result = await handler("eth_call", [
      { to: MOCK_ADDRESS, data: callData },
    ]);

    expect(result).toHaveProperty("error");
    expect((result as { error: { code: number } }).error.code).toBe(3);
    expect((result as { error: { message: string } }).error.message).toContain(
      "Insufficient balance"
    );
  });

  it("should format UnknownContractError correctly in RPC response", async () => {
    const handler = createRpcHandler({ blockchain });
    const unknownAddress = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const callData = encodeFunctionData({
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [MOCK_SENDER],
    });

    const result = await handler("eth_call", [
      { to: unknownAddress, data: callData },
    ]);

    expect(result).toHaveProperty("error");
    expect((result as { error: { code: number } }).error.code).toBe(-32000);
    expect((result as { error: { message: string } }).error.message).toContain(
      "Unknown contract"
    );
  });
});
