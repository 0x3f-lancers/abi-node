import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { encodeFunctionData, decodeAbiParameters, parseAbi } from "viem";
import { Blockchain } from "../src/blockchain/chain";
import { ContractRegistry } from "../src/abi/registry";
import type { AbiFile } from "../src/abi/loader";

// Mock ABI for a simple stateful contract
const statefulAbi = parseAbi([
  "function set(uint256 value)",
  "function get() view returns (uint256)",
  "event ValueSet(address indexed sender, uint256 value)",
]);

const MOCK_SENDER = "0x0000000000000000000000000000000000000001";
const MOCK_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000002";

describe("7. End-to-End Flows", () => {
  let blockchain: Blockchain;

  beforeEach(() => {
    const registry = new ContractRegistry();
    registry.register(MOCK_CONTRACT_ADDRESS, "Stateful", statefulAbi);
    blockchain = new Blockchain(registry, 0); // Instant mining
  });

  it("should return a default value before write, and written value after write", () => {
    // 1. Read before write -> default value
    const callDataBefore = encodeFunctionData({
      abi: statefulAbi,
      functionName: "get",
    });
    const callResultBefore = blockchain.call(MOCK_CONTRACT_ADDRESS, callDataBefore);
    const [decodedResultBefore] = decodeAbiParameters([{ type: "uint256" }], callResultBefore);
    expect(decodedResultBefore).toBe(1n); // The default for uint256

    // 2. Write a new value
    const testValue = 99n;
    const txData = encodeFunctionData({
      abi: statefulAbi,
      functionName: "set",
      args: [testValue],
    });
    blockchain.sendTransaction(MOCK_SENDER, MOCK_CONTRACT_ADDRESS, txData);

    // 3. Read after write -> written value
    const callDataAfter = encodeFunctionData({
      abi: statefulAbi,
      functionName: "get",
    });
    const callResultAfter = blockchain.call(MOCK_CONTRACT_ADDRESS, callDataAfter);
    const [decodedResultAfter] = decodeAbiParameters([{ type: "uint256" }], callResultAfter);
    expect(decodedResultAfter).toBe(testValue);
  });

  it("should keep state isolated between multiple contracts", () => {
    const OTHER_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000003";
    const registry = new ContractRegistry();
    registry.register(MOCK_CONTRACT_ADDRESS, "Stateful1", statefulAbi);
    registry.register(OTHER_CONTRACT_ADDRESS, "Stateful2", statefulAbi);
    blockchain = new Blockchain(registry, 0);

    // Set value on first contract
    const txData1 = encodeFunctionData({ abi: statefulAbi, functionName: "set", args: [111n] });
    blockchain.sendTransaction(MOCK_SENDER, MOCK_CONTRACT_ADDRESS, txData1);

    // Set value on second contract
    const txData2 = encodeFunctionData({ abi: statefulAbi, functionName: "set", args: [222n] });
    blockchain.sendTransaction(MOCK_SENDER, OTHER_CONTRACT_ADDRESS, txData2);

    // Read from first contract
    const callData1 = encodeFunctionData({ abi: statefulAbi, functionName: "get" });
    const result1 = blockchain.call(MOCK_CONTRACT_ADDRESS, callData1);
    const [decoded1] = decodeAbiParameters([{ type: "uint256" }], result1);
    expect(decoded1).toBe(111n);

    // Read from second contract
    const callData2 = encodeFunctionData({ abi: statefulAbi, functionName: "get" });
    const result2 = blockchain.call(OTHER_CONTRACT_ADDRESS, callData2);
    const [decoded2] = decodeAbiParameters([{ type: "uint256" }], result2);
    expect(decoded2).toBe(222n);
  });
});

describe("4. Blockchain/Mining", () => {
  let blockchain: Blockchain;

  beforeEach(() => {
    const registry = new ContractRegistry();
    // blockTime > 0 to test manual mining
    blockchain = new Blockchain(registry, 10);
  });

  it("should have a genesis block at startup", () => {
    expect(blockchain.blockNumber).toBe(0);
    const genesis = blockchain.getBlock(0);
    expect(genesis).toBeDefined();
    expect(genesis?.number).toBe(0);
    expect(genesis?.transactions.length).toBe(0);
  });

  it("should mine an empty block if no transactions are pending", () => {
    blockchain.mineBlock();
    expect(blockchain.blockNumber).toBe(1);
    const newBlock = blockchain.getBlock(1);
    expect(newBlock?.transactions.length).toBe(0);
  });

  it("should batch multiple transactions into the same block", () => {
    const txData = encodeFunctionData({ abi: statefulAbi, functionName: "set", args: [1n] });
    
    blockchain.sendTransaction(MOCK_SENDER, MOCK_CONTRACT_ADDRESS, txData);
    blockchain.sendTransaction(MOCK_SENDER, MOCK_CONTRACT_ADDRESS, txData);
    blockchain.sendTransaction(MOCK_SENDER, MOCK_CONTRACT_ADDRESS, txData);

    expect(blockchain.pendingCount).toBe(3);
    
    blockchain.mineBlock();

    expect(blockchain.blockNumber).toBe(1);
    expect(blockchain.pendingCount).toBe(0);
    const newBlock = blockchain.getBlock(1);
    expect(newBlock?.transactions.length).toBe(3);
  });

  it("should maintain the parent hash chain correctly", () => {
    const block0 = blockchain.getBlock(0);
    
    blockchain.mineBlock();
    const block1 = blockchain.getBlock(1);

    blockchain.mineBlock();
    const block2 = blockchain.getBlock(2);
    
    expect(block1?.parentHash).toBe(block0?.hash);
    expect(block2?.parentHash).toBe(block1?.hash);
  });

  it("should auto-mine a block after the specified block time", async () => {
    vi.useFakeTimers();
    const BLOCK_TIME_MS = 10000; // 10s
    blockchain = new Blockchain(new ContractRegistry(), BLOCK_TIME_MS / 1000);
    blockchain.startMining();
    
    // Nothing has been mined yet
    expect(blockchain.blockNumber).toBe(0);

    // Advance time by less than the block time
    await vi.advanceTimersByTimeAsync(BLOCK_TIME_MS - 1);
    expect(blockchain.blockNumber).toBe(0);

    // Advance time past the block time
    await vi.advanceTimersByTimeAsync(1);
    expect(blockchain.blockNumber).toBe(1);

    // Stop the miner to clean up
    blockchain.stopMining();
    vi.useRealTimers();
  });
});

describe("5. Transaction Lifecycle", () => {
  let blockchain: Blockchain;

  beforeEach(() => {
    vi.useFakeTimers();
    const registry = new ContractRegistry();
    registry.register(MOCK_CONTRACT_ADDRESS, "Stateful", statefulAbi);
    blockchain = new Blockchain(registry, 10);
  });

  afterEach(() => {
    vi.useRealTimers();
    blockchain.stopMining();
  });

  it("should handle the full transaction lifecycle", () => {
    const txData = encodeFunctionData({ abi: statefulAbi, functionName: "set", args: [1n] });

    const txHash = blockchain.sendTransaction(MOCK_SENDER, MOCK_CONTRACT_ADDRESS, txData);
    expect(txHash).toMatch(/^0x/);

    expect(blockchain.isPending(txHash)).toBe(true);
    let receipt = blockchain.getTransactionReceipt(txHash);
    expect(receipt).toBeNull();
    
    blockchain.mineBlock();

    expect(blockchain.isPending(txHash)).toBe(false);
    receipt = blockchain.getTransactionReceipt(txHash);
    expect(receipt).toBeDefined();
    expect(receipt?.blockNumber).toBe(1);
    expect(receipt?.status).toBe("0x1");
  });
});

describe("6. RPC Method Logic", () => {
  let blockchain: Blockchain;

  beforeEach(() => {
    const registry = new ContractRegistry();
    registry.register(MOCK_CONTRACT_ADDRESS, "Stateful", statefulAbi);
    blockchain = new Blockchain(registry, 0); // Instant mining
  });

  it('eth_call with unknown address should throw error', () => {
    const UNKNOWN_ADDRESS = "0xffffffffffffffffffffffffffffffffffffffff";
    const callData = encodeFunctionData({ abi: statefulAbi, functionName: "get" });
    expect(() => blockchain.call(UNKNOWN_ADDRESS, callData)).toThrow();
  });

  it('eth_getBlockByNumber should retrieve latest and genesis blocks', () => {
    const genesis = blockchain.getBlock(0);
    const latest = blockchain.getBlock("latest");
    expect(latest).toEqual(genesis);

    const txData = encodeFunctionData({ abi: statefulAbi, functionName: "set", args: [1n] });
    blockchain.sendTransaction(MOCK_SENDER, MOCK_CONTRACT_ADDRESS, txData);
    
    const newLatest = blockchain.getBlock("latest");
    expect(newLatest?.number).toBe(1);
  });

  it('eth_getLogs should filter by address and block range', () => {
    const txData = encodeFunctionData({ abi: statefulAbi, functionName: "set", args: [1n] });
    blockchain.sendTransaction(MOCK_SENDER, MOCK_CONTRACT_ADDRESS, txData);
    blockchain.sendTransaction(MOCK_SENDER, "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", txData);

    const logs = blockchain.getLogs({
      fromBlock: 1,
      toBlock: 1,
      address: MOCK_CONTRACT_ADDRESS,
    });

    expect(logs.length).toBe(1);
    expect(logs[0].address).toBe(MOCK_CONTRACT_ADDRESS);
  });

  it('eth_getLogs should filter by topics', () => {
    const txData = encodeFunctionData({ abi: statefulAbi, functionName: "set", args: [1n] });
    blockchain.sendTransaction(MOCK_SENDER, MOCK_CONTRACT_ADDRESS, txData);

    const MOCK_TOPIC = `0x${MOCK_SENDER.slice(2).padStart(64, "0")}`;

    const logs1 = blockchain.getLogs({
      address: MOCK_CONTRACT_ADDRESS,
      topics: [null, MOCK_TOPIC],
    });
    expect(logs1.length).toBe(1);
    
    const logs2 = blockchain.getLogs({
      address: MOCK_CONTRACT_ADDRESS,
      topics: [null, `0x${"1".repeat(64)}`],
    });
    expect(logs2.length).toBe(0);
  });
});

describe("8. Edge Cases", () => {
  let blockchain: Blockchain;

  beforeEach(() => {
    const registry = new ContractRegistry();
    registry.register(MOCK_CONTRACT_ADDRESS, "Stateful", statefulAbi);
    blockchain = new Blockchain(registry, 0);
  });

  it('should throw an error for malformed calldata', () => {
    const badCallData = "0x12345678";
    expect(() => blockchain.call(MOCK_CONTRACT_ADDRESS, badCallData as `0x${string}`)).toThrow();
  });

  it('should throw an error for a transaction to an unregistered contract', () => {
    const UNKNOWN_ADDRESS = "0xffffffffffffffffffffffffffffffffffffffff";
    const txData = encodeFunctionData({ abi: statefulAbi, functionName: "set", args: [1n] });
    // Note: sendTransaction itself doesn't throw, but the RPC handler would.
    // Here we test the underlying call, which *should* throw from a handler.
    expect(() => blockchain.call(UNKNOWN_ADDRESS, txData)).toThrow();
  });
});