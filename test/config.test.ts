import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig, loadConfigFromPath, findConfigFile, getConfigFormat } from "../src/config";

// Mock the 'fs/promises' module
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  access: vi.fn(),
}));

const { readFile, access } = await import("node:fs/promises");

describe("Config Loader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getConfigFormat", () => {
    it("should return 'ts' for .ts files", () => {
      expect(getConfigFormat("/path/to/abi.config.ts")).toBe("ts");
    });

    it("should return 'js' for .js files", () => {
      expect(getConfigFormat("/path/to/abi.config.js")).toBe("js");
    });

    it("should return 'json' for .json files", () => {
      expect(getConfigFormat("/path/to/abi.config.json")).toBe("json");
    });

    it("should return 'json' for unknown extensions", () => {
      expect(getConfigFormat("/path/to/config")).toBe("json");
    });
  });

  describe("findConfigFile", () => {
    it("should find abi.config.ts first (highest precedence)", async () => {
      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/abi.config.ts") return;
        throw new Error("Not found");
      });

      const result = await findConfigFile("/fake/cwd");
      expect(result).toBe("/fake/cwd/abi.config.ts");
    });

    it("should find abi.config.js if .ts doesn't exist", async () => {
      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/abi.config.js") return;
        throw new Error("Not found");
      });

      const result = await findConfigFile("/fake/cwd");
      expect(result).toBe("/fake/cwd/abi.config.js");
    });

    it("should find abi.config.json if .ts and .js don't exist", async () => {
      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/abi.config.json") return;
        throw new Error("Not found");
      });

      const result = await findConfigFile("/fake/cwd");
      expect(result).toBe("/fake/cwd/abi.config.json");
    });

    it("should return null if no config file exists", async () => {
      vi.mocked(access).mockRejectedValue(new Error("Not found"));

      const result = await findConfigFile("/fake/cwd");
      expect(result).toBeNull();
    });

    it("should use specific config file if provided with extension", async () => {
      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/custom.config.js") return;
        throw new Error("Not found");
      });

      const result = await findConfigFile("/fake/cwd", "custom.config.js");
      expect(result).toBe("/fake/cwd/custom.config.js");
    });

    it("should try extensions for config file without extension", async () => {
      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/my-config.js") return;
        throw new Error("Not found");
      });

      const result = await findConfigFile("/fake/cwd", "my-config");
      expect(result).toBe("/fake/cwd/my-config.js");
    });
  });

  describe("loadConfigFromPath - JSON", () => {
    it("should load and parse a valid JSON config file", async () => {
      const mockConfig = {
        port: 3000,
        blockTime: 5,
        contracts: {
          "0x123": "path/to/File.json",
        },
      };
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const config = await loadConfigFromPath("/fake/cwd/abi.config.json");
      expect(readFile).toHaveBeenCalledWith("/fake/cwd/abi.config.json", "utf-8");
      expect(config).toEqual(mockConfig);
    });
  });

  describe("loadConfigFromPath - TypeScript", () => {
    it("should parse export default { ... } syntax", async () => {
      const tsContent = `
        import type { Config } from "abi-node";

        export default {
          port: 8545,
          blockTime: 2,
          contracts: {
            "0xABC": "./Token.json",
          },
        } satisfies Config;
      `;
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfigFromPath("/fake/cwd/abi.config.ts");
      expect(config).toEqual({
        port: 8545,
        blockTime: 2,
        contracts: {
          "0xABC": "./Token.json",
        },
      });
    });

    it("should parse export const config = { ... } syntax", async () => {
      const tsContent = `
        export const config = {
          port: 9000,
          logging: {
            requests: false,
            blocks: true,
          },
        };
      `;
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfigFromPath("/fake/cwd/abi.config.ts");
      expect(config).toEqual({
        port: 9000,
        logging: {
          requests: false,
          blocks: true,
        },
      });
    });

    it("should handle nested objects and arrays", async () => {
      const tsContent = `
        export default {
          port: 8545,
          contracts: {
            "0x1": "./A.json",
            "0x2": "./B.json",
          },
          overrides: {
            "Token.balanceOf": "1000",
            "Token.transfer": { revert: "Disabled" },
          },
        };
      `;
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfigFromPath("/fake/cwd/abi.config.ts");
      expect(config).toEqual({
        port: 8545,
        contracts: {
          "0x1": "./A.json",
          "0x2": "./B.json",
        },
        overrides: {
          "Token.balanceOf": "1000",
          "Token.transfer": { revert: "Disabled" },
        },
      });
    });

    it("should handle trailing commas", async () => {
      const tsContent = `
        export default {
          port: 8545,
          blockTime: 1,
        };
      `;
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfigFromPath("/fake/cwd/abi.config.ts");
      expect(config.port).toBe(8545);
      expect(config.blockTime).toBe(1);
    });

    it("should ignore single-line comments", async () => {
      const tsContent = `
        export default {
          // This is the port
          port: 8545,
          // blockTime: 5, // commented out
          blockTime: 1,
        };
      `;
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfigFromPath("/fake/cwd/abi.config.ts");
      expect(config.port).toBe(8545);
      expect(config.blockTime).toBe(1);
    });

    it("should ignore multi-line comments", async () => {
      const tsContent = `
        export default {
          /*
           * Server port configuration
           */
          port: 8545,
          blockTime: 2,
        };
      `;
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfigFromPath("/fake/cwd/abi.config.ts");
      expect(config.port).toBe(8545);
      expect(config.blockTime).toBe(2);
    });
  });

  describe("loadConfigFromPath - JavaScript", () => {
    it("should parse module.exports = { ... } syntax", async () => {
      const jsContent = `
        module.exports = {
          port: 8545,
          blockTime: 3,
        };
      `;
      vi.mocked(readFile).mockResolvedValue(jsContent);

      const config = await loadConfigFromPath("/fake/cwd/abi.config.js");
      expect(config).toEqual({
        port: 8545,
        blockTime: 3,
      });
    });

    it("should parse export default { ... } syntax in JS", async () => {
      const jsContent = `
        /** @type {import("abi-node").Config} */
        export default {
          port: 7000,
          contracts: {},
        };
      `;
      vi.mocked(readFile).mockResolvedValue(jsContent);

      const config = await loadConfigFromPath("/fake/cwd/abi.config.js");
      expect(config).toEqual({
        port: 7000,
        contracts: {},
      });
    });
  });

  describe("loadConfig (full flow)", () => {
    it("should load and parse a valid config file", async () => {
      const mockConfig = {
        blockTime: 5,
        contracts: {
          "0x123": "path/to/File.json",
        },
      };

      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/abi.config.json") return;
        throw new Error("Not found");
      });
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const config = await loadConfig("/fake/cwd");
      expect(config).toEqual(mockConfig);
    });

    it("should return an empty object if no config file exists", async () => {
      vi.mocked(access).mockRejectedValue(new Error("File not found"));

      const config = await loadConfig("/fake/cwd");
      expect(config).toEqual({});
    });

    it("should return empty object on parse error", async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue("invalid { json }}}");

      const config = await loadConfig("/fake/cwd");
      expect(config).toEqual({});
    });

    it("should prefer TS config over JSON when both exist", async () => {
      vi.mocked(access).mockImplementation(async (path) => {
        // Both TS and JSON exist, TS should be chosen
        if (path === "/fake/cwd/abi.config.ts") return;
        if (path === "/fake/cwd/abi.config.json") return;
        throw new Error("Not found");
      });

      const tsContent = `export default { port: 9999 };`;
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfig("/fake/cwd");
      expect(config.port).toBe(9999);
    });
  });

  describe("loadConfig with overrides", () => {
    it("should load config with simple string overrides", async () => {
      const tsContent = `
        export default {
          port: 8545,
          overrides: {
            "Token.balanceOf": "1000000000000000000",
          },
        };
      `;

      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/abi.config.ts") return;
        throw new Error("Not found");
      });
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfig("/fake/cwd");
      expect(config.overrides).toEqual({
        "Token.balanceOf": "1000000000000000000",
      });
    });

    it("should load config with object overrides", async () => {
      const tsContent = `
        export default {
          overrides: {
            "Token.transfer": { revert: "Transfers disabled" },
            "Staking.getUserInfo": { values: ["100", "200", "true"] },
          },
        };
      `;

      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/abi.config.ts") return;
        throw new Error("Not found");
      });
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfig("/fake/cwd");
      expect(config.overrides?.["Token.transfer"]).toEqual({ revert: "Transfers disabled" });
      expect(config.overrides?.["Staking.getUserInfo"]).toEqual({ values: ["100", "200", "true"] });
    });
  });

  describe("loadConfig with logging", () => {
    it("should load logging configuration", async () => {
      const tsContent = `
        export default {
          logging: {
            requests: false,
            blocks: true,
            hideEmptyBlocks: true,
          },
        };
      `;

      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/abi.config.ts") return;
        throw new Error("Not found");
      });
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfig("/fake/cwd");
      expect(config.logging).toEqual({
        requests: false,
        blocks: true,
        hideEmptyBlocks: true,
      });
    });
  });

  describe("Edge cases", () => {
    it("should handle empty config object", async () => {
      const tsContent = `export default {};`;

      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/abi.config.ts") return;
        throw new Error("Not found");
      });
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfig("/fake/cwd");
      expect(config).toEqual({});
    });

    it("should handle string values with special characters", async () => {
      const tsContent = `
        export default {
          proxyRpc: "https://mainnet.infura.io/v3/abc123",
          contracts: {
            "0xdead...beef": "./path/to/Token.json",
          },
        };
      `;

      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/abi.config.ts") return;
        throw new Error("Not found");
      });
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfig("/fake/cwd");
      expect(config.proxyRpc).toBe("https://mainnet.infura.io/v3/abc123");
    });

    it("should handle boolean values", async () => {
      const tsContent = `
        export default {
          logging: {
            requests: true,
            blocks: false,
            hideEmptyBlocks: true,
          },
        };
      `;

      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/abi.config.ts") return;
        throw new Error("Not found");
      });
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfig("/fake/cwd");
      expect(config.logging?.requests).toBe(true);
      expect(config.logging?.blocks).toBe(false);
      expect(config.logging?.hideEmptyBlocks).toBe(true);
    });

    it("should handle zero values", async () => {
      const tsContent = `
        export default {
          port: 0,
          blockTime: 0,
        };
      `;

      vi.mocked(access).mockImplementation(async (path) => {
        if (path === "/fake/cwd/abi.config.ts") return;
        throw new Error("Not found");
      });
      vi.mocked(readFile).mockResolvedValue(tsContent);

      const config = await loadConfig("/fake/cwd");
      expect(config.port).toBe(0);
      expect(config.blockTime).toBe(0);
    });
  });
});
