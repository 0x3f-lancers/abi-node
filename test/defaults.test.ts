import { describe, it, expect } from "vitest";
import { generateDefaultValues } from "../src/abi/defaults";
import { parseAbiItem } from "viem";
import type { AbiParameter } from "viem";

function getOutputs(signature: string): readonly AbiParameter[] {
  const item = parseAbiItem(`function mock() returns (${signature})`);
  if (item.type === "function") {
    return item.outputs;
  }
  throw new Error("Invalid signature");
}

describe("2. Default Value Generator", () => {
  it("should generate default for uint256", () => {
    const outputs = getOutputs("uint256");
    const [result] = generateDefaultValues(outputs);
    expect(result).toBe(1n);
  });

  it("should generate default for bool", () => {
    const outputs = getOutputs("bool");
    const [result] = generateDefaultValues(outputs);
    expect(result).toBe(true);
  });

  it("should generate default for address", () => {
    const outputs = getOutputs("address");
    const [result] = generateDefaultValues(outputs);
    expect(result).toBe("0x000000000000000000000000000000000000dEaD");
  });

  it("should generate default for string", () => {
    const outputs = getOutputs("string");
    const [result] = generateDefaultValues(outputs);
    expect(result).toBe("mock");
  });

  it("should generate default for bytes32", () => {
    const outputs = getOutputs("bytes32");
    const [result] = generateDefaultValues(outputs);
    expect(result).toBe(`0x${"0".repeat(64)}`);
  });

  it("should generate default for dynamic bytes", () => {
    const outputs = getOutputs("bytes");
    const [result] = generateDefaultValues(outputs);
    expect(result).toBe("0x");
  });

  it("should generate default for fixed arrays", () => {
    const outputs = getOutputs("uint256[3]");
    const [result] = generateDefaultValues(outputs);
    expect(result).toEqual([1n, 1n, 1n]);
  });

  it("should generate default for dynamic arrays", () => {
    const outputs = getOutputs("address[]");
    const [result] = generateDefaultValues(outputs);
    expect(result).toEqual([]);
  });

  it("should generate default for tuples/structs", () => {
    const outputs = getOutputs("(uint256 id, string name)");
    const [result] = generateDefaultValues(outputs);
    expect(result).toEqual({ id: 1n, name: "mock" });
  });

  it("should generate default for nested tuples", () => {
    const outputs = getOutputs(
      "(uint256 id, (address owner, bool active) user)"
    );
    const [result] = generateDefaultValues(outputs);
    expect(result).toEqual({
      id: 1n,
      user: {
        owner: "0x000000000000000000000000000000000000dEaD",
        active: true,
      },
    });
  });

  it("should generate default for int256", () => {
    const outputs = getOutputs("int256");
    const [result] = generateDefaultValues(outputs);
    expect(result).toBe(0n);
  });
});
