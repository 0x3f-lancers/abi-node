import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig } from "../src/config";

// Mock the 'fs/promises' module
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

const { readFile } = await import("node:fs/promises");

describe("Optional: Config Loader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should load and parse a valid config file", async () => {
    const mockConfig = {
      blockTime: 5,
      contracts: {
        "0x123": "path/to/File.json",
      },
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));

    const config = await loadConfig("/fake/cwd");
    expect(readFile).toHaveBeenCalledWith("/fake/cwd/abi.config.json", "utf-8");
    expect(config).toEqual(mockConfig);
  });

  it("should return an empty object if the config file does not exist", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("File not found"));

    const config = await loadConfig("/fake/cwd");
    expect(config).toEqual({});
  });
});
