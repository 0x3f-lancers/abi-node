import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadAbisFromDirectory } from "../src/abi/loader";
import { buildRegistry, ContractRegistry } from "../src/abi/registry";
import { parseAbi } from "viem";

const rawAbi = parseAbi(["function foo()"]);
const artifact = {
  contractName: "MyContract",
  abi: rawAbi,
  bytecode: "0x123",
};

// Mock the 'fs/promises' module
vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

const { readdir, readFile } = await import("node:fs/promises");

describe("1. ABI Loading & Registry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("loadAbisFromDirectory", () => {
    it("should load raw ABI arrays", async () => {
      vi.mocked(readdir).mockResolvedValue(["Raw.json"] as any);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(rawAbi));

      const result = await loadAbisFromDirectory("/fake/dir");
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Raw");
      expect(result[0].abi).toEqual(rawAbi);
    });

    it("should load Hardhat/Foundry artifacts", async () => {
      vi.mocked(readdir).mockResolvedValue(["Artifact.json"] as any);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(artifact));

      const result = await loadAbisFromDirectory("/fake/dir");
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Artifact");
      expect(result[0].abi).toEqual(artifact.abi);
    });

    it("should skip invalid JSON files gracefully", async () => {
      vi.mocked(readdir).mockResolvedValue(["Invalid.json"] as any);
      vi.mocked(readFile).mockResolvedValue("not-json");

      const result = await loadAbisFromDirectory("/fake/dir");
      expect(result.length).toBe(0);
    });

    it("should handle an empty directory", async () => {
      vi.mocked(readdir).mockResolvedValue([]);
      const result = await loadAbisFromDirectory("/fake/dir");
      expect(result.length).toBe(0);
    });
  });

  describe("buildRegistry", () => {
    const abiFiles = [{ name: "MyContract", abi: rawAbi }];

    it("should auto-assign addresses when no config is provided", () => {
      const registry = buildRegistry(abiFiles, undefined);
      const contract = registry.get("0x0000000000000000000000000000000000000001");
      expect(contract).toBeDefined();
      expect(contract?.name).toBe("MyContract");
    });

    it("should use config-based address pinning", () => {
      const config = {
        "0x1234567890123456789012345678901234567890": "contracts/MyContract.json",
      };
      const registry = buildRegistry(abiFiles, config);
      const contract = registry.get("0x1234567890123456789012345678901234567890");
      expect(contract).toBeDefined();
      expect(contract?.name).toBe("MyContract");
    });
  });

  describe("ContractRegistry Class", () => {
    it("should perform case-insensitive address lookups", () => {
      const registry = new ContractRegistry();
      const address = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12";
      registry.register(address, "Test", rawAbi);

      const lookup1 = registry.get(address.toLowerCase());
      const lookup2 = registry.get(address.toUpperCase());

      expect(lookup1).toBeDefined();
      expect(lookup2).toBeDefined();
      expect(lookup1?.name).toBe("Test");
      expect(lookup2?.name).toBe("Test");
    });
  });
});
