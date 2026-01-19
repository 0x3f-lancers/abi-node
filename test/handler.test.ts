import { describe, it, expect } from "vitest";
import { createRpcHandler } from "../src/rpc/handler";
import type { Blockchain } from "../src/blockchain/chain";
import { parseAbi, createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { ContractRegistry } from "../src/abi/registry";
import { Blockchain as RealBlockchain } from "../src/blockchain/chain";

describe("Optional: RPC Handler", () => {
  it("should return a Method not found error for unknown methods", async () => {
    const mockBlockchain = {} as Blockchain;
    const handler = createRpcHandler({ blockchain: mockBlockchain });

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
      isKnownContract: () => true,
      call: () => {
        throw new Error("VM execution reverted");
      },
    } as unknown as Blockchain;
    const handler = createRpcHandler({ blockchain: mockBlockchain });

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
    const handler = createRpcHandler({ blockchain: mockBlockchain });

    const result = await handler("eth_chainId", []);
    expect(result).toEqual({ result: "0x539" });
  });
});

describe("eth_sendRawTransaction signer recovery", () => {
  it("should recover the correct signer address from a signed transaction", async () => {
    // Setup: Create a real blockchain with a registered contract
    const tokenAbi = parseAbi([
      "function transfer(address to, uint256 amount) returns (bool)",
    ]);
    const CONTRACT_ADDRESS = "0x1000000000000000000000000000000000000001";

    const registry = new ContractRegistry();
    registry.register(CONTRACT_ADDRESS, "Token", tokenAbi);
    const blockchain = new RealBlockchain(registry, 0); // instant mining

    const handler = createRpcHandler({ blockchain });

    // Create a wallet from a known private key
    const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const account = privateKeyToAccount(privateKey);
    const expectedAddress = account.address; // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

    // Create and sign a transaction
    const walletClient = createWalletClient({
      account,
      chain: mainnet,
      transport: http(),
    });

    const callData = encodeFunctionData({
      abi: tokenAbi,
      functionName: "transfer",
      args: ["0x0000000000000000000000000000000000000002", 1000n],
    });

    // Sign the transaction (this creates a serialized signed tx)
    const signedTx = await walletClient.signTransaction({
      to: CONTRACT_ADDRESS as `0x${string}`,
      data: callData,
      gas: 100000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 1000000000n,
      nonce: 0,
    });

    // Send the raw transaction
    const result = await handler("eth_sendRawTransaction", [signedTx]);
    expect(result).toHaveProperty("result");

    const txHash = (result as { result: string }).result;

    // Get the receipt and verify the from address
    const receiptResult = await handler("eth_getTransactionReceipt", [txHash]);
    expect(receiptResult).toHaveProperty("result");

    const receipt = (receiptResult as { result: { from: string } }).result;
    expect(receipt.from.toLowerCase()).toBe(expectedAddress.toLowerCase());
  });
});
