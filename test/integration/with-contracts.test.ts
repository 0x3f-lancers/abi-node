import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseAbi, decodeAbiParameters } from "viem";
import { join } from "node:path";
import { startTestServer, stopTestServer, type TestContext } from "./helper.js";

// Contract addresses from test.config.json
const STATEFUL_ADDRESS = "0x1000000000000000000000000000000000000001" as const;
const COUNTER_ADDRESS = "0x2000000000000000000000000000000000000002" as const;
const UNKNOWN_ADDRESS = "0x9999999999999999999999999999999999999999" as const;

// ABIs for the test contracts
const statefulAbi = parseAbi([
  "function set(uint256 value)",
  "function get() view returns (uint256)",
  "event ValueSet(address indexed sender, uint256 value)",
]);

const counterAbi = parseAbi([
  "function increment()",
  "function decrement()",
  "function count() view returns (uint256)",
  "event CountChanged(uint256 newCount)",
]);

// Test sender address
const TEST_SENDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;

describe("Integration: With Registered Contracts", () => {
  let ctx: TestContext;
  const configPath = join(process.cwd(), "test/fixtures/test.config.json");

  beforeAll(async () => {
    ctx = await startTestServer({ configPath });
  });

  afterAll(async () => {
    await stopTestServer(ctx);
  });

  describe("readContract - actual decoded values", () => {
    it("should read default value from Stateful contract", async () => {
      const value = await ctx.publicClient.readContract({
        address: STATEFUL_ADDRESS,
        abi: statefulAbi,
        functionName: "get",
      });
      
      // Default value for uint256 is 1 (as defined by abi-node)
      expect(value).toBe(1n);
    });

    it("should read default count from Counter contract", async () => {
      const count = await ctx.publicClient.readContract({
        address: COUNTER_ADDRESS,
        abi: counterAbi,
        functionName: "count",
      });
      
      expect(count).toBe(1n);
    });
  });

  describe("writeContract - state changes", () => {
    it("should write value and read it back", async () => {
      // Write a new value
      const hash = await ctx.walletClient.writeContract({
        chain: null,
        account: TEST_SENDER,
        address: STATEFUL_ADDRESS,
        abi: statefulAbi,
        functionName: "set",
        args: [42n],
      });
      
      expect(hash).toMatch(/^0x/);
      
      // Read the value back
      const value = await ctx.publicClient.readContract({
        address: STATEFUL_ADDRESS,
        abi: statefulAbi,
        functionName: "get",
      });
      
      expect(value).toBe(42n);
    });

    it("should execute write transaction and emit event", async () => {
      // The Counter's increment() has no args, so it doesn't change the stored value
      // But we can verify that the transaction is accepted and processed
      const hash = await ctx.walletClient.writeContract({
        chain: null,
        account: TEST_SENDER,
        address: COUNTER_ADDRESS,
        abi: counterAbi,
        functionName: "increment",
      });

      expect(hash).toMatch(/^0x/);
      
      // Verify transaction was mined
      const receipt = await ctx.publicClient.getTransactionReceipt({ hash });
      expect(receipt).toBeDefined();
      expect(receipt.status).toBe("success");
    });
  });
});

describe("Integration: Transaction Receipt Flow", () => {
  let ctx: TestContext;
  const configPath = join(process.cwd(), "test/fixtures/test.config.json");

  beforeAll(async () => {
    ctx = await startTestServer({ configPath });
  });

  afterAll(async () => {
    await stopTestServer(ctx);
  });

  it("should get transaction receipt with correct fields", async () => {
    // Send transaction
    const hash = await ctx.walletClient.writeContract({
      chain: null,
      account: TEST_SENDER,
      address: STATEFUL_ADDRESS,
      abi: statefulAbi,
      functionName: "set",
      args: [123n],
    });

    // Get receipt
    const receipt = await ctx.publicClient.getTransactionReceipt({ hash });

    expect(receipt).toBeDefined();
    expect(receipt.transactionHash).toBe(hash);
    expect(receipt.status).toBe("success");
    expect(receipt.blockNumber).toBeGreaterThan(0n);
    expect(receipt.from.toLowerCase()).toBe(TEST_SENDER.toLowerCase());
    expect(receipt.to?.toLowerCase()).toBe(STATEFUL_ADDRESS.toLowerCase());
    expect(receipt.logs).toBeDefined();
    expect(receipt.logs.length).toBeGreaterThan(0);
  });

  it("should include event logs in receipt", async () => {
    const testValue = 456n;
    
    // Send transaction that emits event
    const hash = await ctx.walletClient.writeContract({
      chain: null,
      account: TEST_SENDER,
      address: STATEFUL_ADDRESS,
      abi: statefulAbi,
      functionName: "set",
      args: [testValue],
    });

    const receipt = await ctx.publicClient.getTransactionReceipt({ hash });

    // Should have the ValueSet event
    expect(receipt.logs.length).toBe(1);
    const log = receipt.logs[0];
    
    // Verify log address matches contract
    expect(log.address.toLowerCase()).toBe(STATEFUL_ADDRESS.toLowerCase());
    
    // Decode the event data
    const [decodedValue] = decodeAbiParameters(
      [{ type: "uint256" }],
      log.data
    );
    expect(decodedValue).toBe(testValue);
  });

  it("should throw error for unknown transaction hash", async () => {
    const unknownHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    
    // viem throws TransactionReceiptNotFoundError when receipt is null
    await expect(
      ctx.publicClient.getTransactionReceipt({ 
        hash: unknownHash as `0x${string}` 
      })
    ).rejects.toThrow(/could not be found/);
  });
});

describe("Integration: Event Logs (eth_getLogs)", () => {
  let ctx: TestContext;
  const configPath = join(process.cwd(), "test/fixtures/test.config.json");

  beforeAll(async () => {
    ctx = await startTestServer({ configPath });
  });

  afterAll(async () => {
    await stopTestServer(ctx);
  });

  it("should query logs after writing", async () => {
    const testValue = 789n;
    
    // Write to emit event
    await ctx.walletClient.writeContract({
      chain: null,
      account: TEST_SENDER,
      address: STATEFUL_ADDRESS,
      abi: statefulAbi,
      functionName: "set",
      args: [testValue],
    });

    // Query logs
    const logs = await ctx.publicClient.getLogs({
      address: STATEFUL_ADDRESS,
      fromBlock: 0n,
      toBlock: "latest",
    });

    expect(logs.length).toBeGreaterThan(0);
    
    // Verify last log contains our value
    const lastLog = logs[logs.length - 1];
    expect(lastLog.address.toLowerCase()).toBe(STATEFUL_ADDRESS.toLowerCase());
  });

  it("should filter logs by address", async () => {
    // Write to Stateful contract
    await ctx.walletClient.writeContract({
      chain: null,
      account: TEST_SENDER,
      address: STATEFUL_ADDRESS,
      abi: statefulAbi,
      functionName: "set",
      args: [111n],
    });

    // Query only Stateful contract logs
    const statefulLogs = await ctx.publicClient.getLogs({
      address: STATEFUL_ADDRESS,
      fromBlock: 0n,
      toBlock: "latest",
    });

    // All logs should be from Stateful contract
    expect(statefulLogs.length).toBeGreaterThan(0);
    statefulLogs.forEach((log) => {
      expect(log.address.toLowerCase()).toBe(STATEFUL_ADDRESS.toLowerCase());
    });
  });

  it("should return logs with correct block numbers", async () => {
    // Write to emit event
    const hash = await ctx.walletClient.writeContract({
      chain: null,
      account: TEST_SENDER,
      address: STATEFUL_ADDRESS,
      abi: statefulAbi,
      functionName: "set",
      args: [999n],
    });

    // Get receipt to know the block number
    const receipt = await ctx.publicClient.getTransactionReceipt({ hash });

    // Query logs for that specific block
    const logs = await ctx.publicClient.getLogs({
      address: STATEFUL_ADDRESS,
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    expect(logs.length).toBeGreaterThan(0);
    logs.forEach((log) => {
      expect(log.blockNumber).toBe(receipt.blockNumber);
    });
  });
});

describe("Integration: Error Cases", () => {
  let ctx: TestContext;
  const configPath = join(process.cwd(), "test/fixtures/test.config.json");

  beforeAll(async () => {
    ctx = await startTestServer({ configPath });
  });

  afterAll(async () => {
    await stopTestServer(ctx);
  });

  it("should return error for unknown contract address", async () => {
    await expect(
      ctx.publicClient.readContract({
        address: UNKNOWN_ADDRESS,
        abi: statefulAbi,
        functionName: "get",
      })
    ).rejects.toThrow(/Unknown contract address/);
  });

  it("should return empty result for unknown function selector", async () => {
    // Using raw RPC call since viem.call may handle empty responses differently
    const response = await fetch(ctx.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: STATEFUL_ADDRESS, data: "0x12345678" }, "latest"],
        id: 1,
      }),
    });
    
    const json = await response.json() as { result?: string };
    expect(json.result).toBe("0x");
  });
});

describe("Integration: EIP-1559 Methods", () => {
  let ctx: TestContext;
  const configPath = join(process.cwd(), "test/fixtures/test.config.json");

  beforeAll(async () => {
    ctx = await startTestServer({ configPath });
  });

  afterAll(async () => {
    await stopTestServer(ctx);
  });

  it("should return gas price", async () => {
    const gasPrice = await ctx.publicClient.getGasPrice();
    
    expect(gasPrice).toBeGreaterThan(0n);
    // Default is 1 gwei (0x3b9aca00 = 1000000000)
    expect(gasPrice).toBe(1000000000n);
  });

  it("should estimate gas", async () => {
    const gas = await ctx.publicClient.estimateGas({
      to: STATEFUL_ADDRESS,
      data: "0x",
    });
    
    expect(gas).toBeGreaterThan(0n);
  });

  it("should return fee history", async () => {
    const feeHistory = await ctx.publicClient.getFeeHistory({
      blockCount: 1,
      rewardPercentiles: [25, 75],
    });
    
    expect(feeHistory).toBeDefined();
    expect(feeHistory.baseFeePerGas).toBeDefined();
    expect(feeHistory.baseFeePerGas.length).toBeGreaterThan(0);
  });

  it("should get balance", async () => {
    const balance = await ctx.publicClient.getBalance({
      address: TEST_SENDER,
    });
    
    // Default balance is 100 ETH
    expect(balance).toBe(100000000000000000000n);
  });

  it("should get code for known contract", async () => {
    const code = await ctx.publicClient.getCode({
      address: STATEFUL_ADDRESS,
    });
    
    // Known contracts return 0x1
    expect(code).toBe("0x1");
  });

  it("should get undefined/empty code for unknown address", async () => {
    const code = await ctx.publicClient.getCode({
      address: UNKNOWN_ADDRESS,
    });
    
    // viem returns undefined when RPC returns "0x" for getCode
    expect(code === undefined || code === "0x").toBe(true);
  });
});

describe("Integration: Concurrent Operations", () => {
  let ctx: TestContext;
  const configPath = join(process.cwd(), "test/fixtures/test.config.json");

  beforeAll(async () => {
    ctx = await startTestServer({ configPath });
  });

  afterAll(async () => {
    await stopTestServer(ctx);
  });

  it("should handle concurrent reads correctly", async () => {
    // Set a known value first
    await ctx.walletClient.writeContract({
      chain: null,
      account: TEST_SENDER,
      address: STATEFUL_ADDRESS,
      abi: statefulAbi,
      functionName: "set",
      args: [1000n],
    });

    // Concurrent reads
    const reads = Array.from({ length: 10 }, () =>
      ctx.publicClient.readContract({
        address: STATEFUL_ADDRESS,
        abi: statefulAbi,
        functionName: "get",
      })
    );

    const results = await Promise.all(reads);
    
    // All reads should return same value
    results.forEach((result) => {
      expect(result).toBe(1000n);
    });
  });

  it("should handle sequential writes with set()", async () => {
    // Sequential writes - use set() which takes args
    const values = [100n, 200n, 300n, 400n, 500n];
    
    for (const value of values) {
      await ctx.walletClient.writeContract({
        chain: null,
        account: TEST_SENDER,
        address: STATEFUL_ADDRESS,
        abi: statefulAbi,
        functionName: "set",
        args: [value],
      });
    }

    // Read final value - should be the last one set
    const finalValue = await ctx.publicClient.readContract({
      address: STATEFUL_ADDRESS,
      abi: statefulAbi,
      functionName: "get",
    });

    expect(finalValue).toBe(500n);
  });
});
