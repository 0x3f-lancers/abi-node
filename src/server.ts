import Fastify from "fastify";
import chalk from "chalk";
import { loadAbisFromDirectory } from "./abi/loader.js";
import { buildRegistry } from "./abi/registry.js";
import { loadConfig } from "./config.js";
import { createRpcHandler } from "./rpc/handler.js";
import { ProxyClient } from "./rpc/proxy.js";
import { Blockchain } from "./blockchain/chain.js";
import { OverrideStore } from "./state/overrides.js";

interface ServerOptions {
  port: number;
  abiDir: string;
}

export async function startServer(options: ServerOptions) {
  const { port, abiDir } = options;

  // Load config
  const config = await loadConfig(process.cwd());
  const blockTime = config.blockTime ?? 1; // default 1 second

  // Load ABIs and build registry
  const abiFiles = await loadAbisFromDirectory(abiDir);
  const registry = buildRegistry(abiFiles, config.contracts);

  // Create proxy client if configured
  const proxy = config.proxyRpc ? new ProxyClient(config.proxyRpc) : undefined;

  // Create override store if configured
  const overrides = config.overrides
    ? new OverrideStore(config.overrides, registry)
    : undefined;

  // Create blockchain with mining callback and overrides
  const blockchain = new Blockchain(registry, blockTime, (block) => {
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
    } else {
      console.log(chalk.dim(`[block ${block.number}] mined (empty)`));
    }
  }, overrides);

  // Create RPC handler with blockchain and proxy
  const handleRpcRequest = createRpcHandler({ blockchain, proxy });

  const server = Fastify();

  server.post("/", async (request, reply) => {
    const body = request.body as {
      jsonrpc: string;
      method: string;
      params?: unknown[];
      id: number | string;
    };

    const result = await handleRpcRequest(body.method, body.params ?? []);

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
    console.log(chalk.yellow(`\nNo ABI files found in ${abiDir}`));
  }

  // Print override count
  if (overrides && overrides.size > 0) {
    console.log(chalk.dim(`\nOverrides: ${overrides.size} configured`));
  }

  console.log(chalk.dim("\nGenesis block created (block 0)"));
  console.log();

  // Start mining
  blockchain.startMining();

  // Graceful shutdown
  process.on("SIGINT", () => {
    blockchain.stopMining();
    server.close();
    process.exit(0);
  });
}
