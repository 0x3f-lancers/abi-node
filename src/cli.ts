import { program } from "commander";
import { startServer } from "~/src/server.js";

program
  .name("abi-node")
  .description("ABI-driven mock RPC node for Web3 development")
  .version("1.0.0")
  .argument("[abiDir]", "Directory containing ABI JSON files", "./abis")
  .option("-p, --port <number>", "Port to run the server on", "8545")
  .action(async (abiDir: string, options: { port: string }) => {
    const port = parseInt(options.port, 10);

    await startServer({ port, abiDir });
  });

program.parse();
