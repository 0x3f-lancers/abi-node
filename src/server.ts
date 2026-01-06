import Fastify from "fastify";
import chalk from "chalk";
import { loadAbisFromDirectory } from "./abi/loader.js";
import { buildRegistry } from "./abi/registry.js";
import { loadConfig } from "./config.js";
import { createRpcHandler } from "./rpc/handler.js";

interface ServerOptions {
  port: number;
  abiDir: string;
}

export async function startServer(options: ServerOptions) {
  const { port, abiDir } = options;

  // Load config
  const config = await loadConfig(process.cwd());

  // Load ABIs and build registry
  const abiFiles = await loadAbisFromDirectory(abiDir);
  const registry = buildRegistry(abiFiles, config.contracts);

  // Create RPC handler with registry
  const handleRpcRequest = createRpcHandler(registry);

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

  console.log(chalk.green(`\nabi-node running on http://localhost:${port}\n`));

  // Print registered contracts
  const contracts = registry.all();
  if (contracts.length > 0) {
    console.log(chalk.dim("Registered contracts:"));
    for (const contract of contracts) {
      console.log(chalk.dim(`  ${contract.address} → ${contract.name}`));
    }
    console.log();
  } else {
    console.log(chalk.yellow(`No ABI files found in ${abiDir}\n`));
  }
}
