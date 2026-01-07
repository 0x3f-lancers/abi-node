import { describe, it, expect, beforeEach } from "vitest";
import { parseAbi, encodeFunctionData, decodeAbiParameters } from "viem";
import { Blockchain } from "../src/blockchain/chain";
import { ContractRegistry } from "../src/abi/registry";
import { OverrideStore } from "../src/state/overrides";
import { RevertError } from "../src/errors";

// Mock ABI for testing
const tokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function getReserves() view returns (uint256, uint256)",
]);

const MOCK_ADDRESS = "0x0000000000000000000000000000000000000001";
const MOCK_SENDER = "0x0000000000000000000000000000000000000099";

describe("Override System", () => {
  let registry: ContractRegistry;

  beforeEach(() => {
    registry = new ContractRegistry();
    registry.register(MOCK_ADDRESS, "Token", tokenAbi);
  });

  it("should apply a simple value override", () => {
    const overrides = new OverrideStore(
      { "Token.balanceOf": "1000000000000000000" },
      registry
    );

    const blockchain = new Blockchain(registry, 0, undefined, overrides);

    const callData = encodeFunctionData({
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [MOCK_SENDER],
    });

    const result = blockchain.call(MOCK_ADDRESS, callData);
    const [balance] = decodeAbiParameters([{ type: "uint256" }], result);

    expect(balance).toBe(1000000000000000000n);
  });

  it("should apply an override by address", () => {
    const overrides = new OverrideStore(
      { [`${MOCK_ADDRESS}.totalSupply`]: "5000000000000000000000" },
      registry
    );

    const blockchain = new Blockchain(registry, 0, undefined, overrides);

    const callData = encodeFunctionData({
      abi: tokenAbi,
      functionName: "totalSupply",
    });

    const result = blockchain.call(MOCK_ADDRESS, callData);
    const [supply] = decodeAbiParameters([{ type: "uint256" }], result);

    expect(supply).toBe(5000000000000000000000n);
  });

  it("should apply a revert override", () => {
    const overrides = new OverrideStore(
      { "Token.transfer": { revert: "Transfer disabled" } },
      registry
    );

    const blockchain = new Blockchain(registry, 0, undefined, overrides);

    const callData = encodeFunctionData({
      abi: tokenAbi,
      functionName: "transfer",
      args: [MOCK_SENDER, 100n],
    });

    expect(() => blockchain.call(MOCK_ADDRESS, callData)).toThrow(RevertError);
    expect(() => blockchain.call(MOCK_ADDRESS, callData)).toThrow(
      "Transfer disabled"
    );
  });

  it("should apply multi-value overrides", () => {
    const overrides = new OverrideStore(
      { "Token.getReserves": { values: ["1000000", "2000000"] } },
      registry
    );

    const blockchain = new Blockchain(registry, 0, undefined, overrides);

    const callData = encodeFunctionData({
      abi: tokenAbi,
      functionName: "getReserves",
    });

    const result = blockchain.call(MOCK_ADDRESS, callData);
    const [reserve0, reserve1] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      result
    );

    expect(reserve0).toBe(1000000n);
    expect(reserve1).toBe(2000000n);
  });

  it("should prioritize override over state", () => {
    const overrides = new OverrideStore(
      { "Token.balanceOf": "999" },
      registry
    );

    const blockchain = new Blockchain(registry, 0, undefined, overrides);

    // Override should take precedence regardless of state
    const callData = encodeFunctionData({
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [MOCK_SENDER],
    });

    const result = blockchain.call(MOCK_ADDRESS, callData);
    const [balance] = decodeAbiParameters([{ type: "uint256" }], result);

    expect(balance).toBe(999n);
  });
});
