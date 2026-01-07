import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { localhost } from "viem/chains";
import { startServer } from "../../src/server.js";
import type { FastifyInstance } from "fastify";
import type { Blockchain } from "../../src/blockchain/chain.js";

export interface TestContext {
  server: FastifyInstance;
  blockchain: Blockchain;
  publicClient: PublicClient;
  walletClient: WalletClient;
  rpcUrl: string;
  port: number;
}

/**
 * Start a test server on a random available port.
 * Returns a context object with clients and cleanup utilities.
 */
export async function startTestServer(options?: {
  abiDir?: string;
  configPath?: string;
}): Promise<TestContext> {
  // Port 0 tells the OS to pick an available port
  const { server, blockchain } = await startServer({
    port: 0,
    abiDir: options?.abiDir,
    configPath: options?.configPath,
  });

  // Get the actual port the server is listening on
  const address = server.addresses()[0];
  const port = address.port;
  const rpcUrl = `http://localhost:${port}`;

  // Create a custom chain for localhost with the actual port
  const testChain = {
    ...localhost,
    id: 1337,
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
  };

  // Create viem clients pointing to the test server
  const publicClient = createPublicClient({
    chain: testChain,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    chain: testChain,
    transport: http(rpcUrl),
  });

  return {
    server,
    blockchain,
    publicClient,
    walletClient,
    rpcUrl,
    port,
  };
}

/**
 * Stop the test server and clean up resources.
 */
export async function stopTestServer(ctx: TestContext): Promise<void> {
  ctx.blockchain.stopMining();
  await ctx.server.close();
}
