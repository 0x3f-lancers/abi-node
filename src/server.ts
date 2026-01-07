import Fastify from "fastify";
import chalk from "chalk";
import { loadAbisFromDirectory } from "./abi/loader.js";
import { buildRegistry } from "./abi/registry.js";
import { loadConfig, type LogConfig } from "./config.js";
import { createRpcHandler } from "./rpc/handler.js";
import { ProxyClient } from "./rpc/proxy.js";
import { Blockchain } from "./blockchain/chain.js";
import { OverrideStore } from "./state/overrides.js";

// Make BigInt JSON serializable globally
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

interface ServerOptions {
  port: number;
  abiDir?: string;
  configPath?: string;
}

export async function startServer(options: ServerOptions) {
  const { port, abiDir, configPath } = options;

  // Load config
  const config = await loadConfig(process.cwd(), configPath);
  const blockTime = config.blockTime ?? 1; // default 1 second

  // Logging config with defaults
  const logging: Required<LogConfig> = {
    requests: config.logging?.requests ?? true,
    blocks: config.logging?.blocks ?? true,
    hideEmptyBlocks: config.logging?.hideEmptyBlocks ?? false,
  };

  // Load ABIs from directory if provided
  const abiFiles = abiDir ? await loadAbisFromDirectory(abiDir) : [];

  // Build registry from abiFiles and config.contracts
  const registry = await buildRegistry(abiFiles, config.contracts);

  // Create proxy client if configured
  const proxy = config.proxyRpc ? new ProxyClient(config.proxyRpc) : undefined;

  // Create override store if configured
  const overrides = config.overrides
    ? new OverrideStore(config.overrides, registry)
    : undefined;

  // Create blockchain with mining callback and overrides
  const blockchain = new Blockchain(registry, blockTime, (block) => {
    if (!logging.blocks) return;

    const txCount = block.transactions.length;
    if (txCount > 0) {
      console.log(
        chalk.cyan(`[block ${block.number}]`) +
          chalk.dim(` mined with ${txCount} tx`)
      );
      for (const tx of block.transactions) {
        if (tx.contractName && tx.functionName) {
          console.log(
            chalk.dim(`  └─ ${tx.contractName}.${tx.functionName}()`)
          );
        }
      }
    } else if (!logging.hideEmptyBlocks) {
      console.log(chalk.dim(`[block ${block.number}] mined (empty)`));
    }
  }, overrides);

  // Create RPC handler with blockchain and proxy
  const handleRpcRequest = createRpcHandler({ blockchain, proxy });

  const server = Fastify();

  // Enable CORS for browser requests
  server.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
  });

  // Handle preflight OPTIONS requests
  server.options("/", async (_request, reply) => {
    return reply.status(204).send();
  });

  server.post("/", async (request, reply) => {
    const body = request.body as {
      jsonrpc: string;
      method: string;
      params?: unknown[];
      id: number | string;
    };

    // Log incoming request
    if (logging.requests) {
      const contractInfo = getContractInfo(body.method, body.params);
      console.log(
        chalk.yellow(`← ${body.method}`) +
        (contractInfo ? chalk.dim(` ${contractInfo}`) : "")
      );
    }

    const result = await handleRpcRequest(body.method, body.params ?? []);

    // Log response
    if (logging.requests) {
      const isError = "error" in result;
      if (isError) {
        const err = result.error as { message: string };
        console.log(chalk.red(`→ error: ${err.message}`));
      } else {
        const resultStr = formatResult(result.result);
        console.log(chalk.green(`→ ${resultStr}`));
      }
    }

    return reply.send({
      jsonrpc: "2.0",
      id: body.id,
      ...result,
    });
  });

  await server.listen({ port, host: "0.0.0.0" });

  console.log(chalk.green(`\nabi-node running on http://localhost:${port}`));
  console.log(
    chalk.dim(
      `Block time: ${blockTime === 0 ? "instant" : `${blockTime}s`}`
    )
  );

  // Print proxy mode status
  if (proxy) {
    console.log(chalk.dim(`Proxy mode: ${config.proxyRpc}`));
  }

  // Print registered contracts
  const contracts = registry.all();
  if (contracts.length > 0) {
    console.log(chalk.dim("\nRegistered contracts:"));
    for (const contract of contracts) {
      console.log(chalk.dim(`  ${contract.address} → ${contract.name}`));
    }
  } else {
    console.log(chalk.yellow("\nNo contracts registered"));
    console.log(chalk.dim("Add ABIs via directory or config.contracts"));
  }

  // Print override count
  if (overrides && overrides.size > 0) {
    console.log(chalk.dim(`\nOverrides: ${overrides.size} configured`));
  }

  console.log(chalk.dim("\nGenesis block created (block 0)"));
  console.log(chalk.dim("Waiting for requests...\n"));

  // Start mining
  blockchain.startMining();

  // Graceful shutdown
  process.on("SIGINT", () => {
    blockchain.stopMining();
    server.close();
    process.exit(0);
  });

  // Return server and blockchain so tests can control them
  return { server, blockchain };
}

/**
 * Extract contract info from RPC params for logging
 */
function getContractInfo(method: string, params?: unknown[]): string | null {
  if (!params || params.length === 0) return null;

  if (method === "eth_call" || method === "eth_sendTransaction") {
    const tx = params[0] as { to?: string; data?: string } | undefined;
    if (tx?.to) {
      const shortAddr = `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}`;
      const selector = tx.data?.slice(0, 10) || "";
      return `to=${shortAddr} ${selector}`;
    }
  }

  if (method === "eth_getTransactionReceipt") {
    const hash = params[0] as string;
    return `hash=${hash.slice(0, 10)}...`;
  }

  return null;
}

/**
 * Format result for logging
 */
function formatResult(result: unknown): string {
  if (result === null || result === undefined) {
    return "null";
  }

  if (typeof result === "string") {
    if (result.length > 66) {
      return `${result.slice(0, 34)}...${result.slice(-8)}`;
    }
    return result;
  }

  if (typeof result === "object") {
    const keys = Object.keys(result);
    return `{${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", ..." : ""}}`;
  }

  return String(result);
}
