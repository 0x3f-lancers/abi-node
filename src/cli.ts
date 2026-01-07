import { program } from "commander";
import { existsSync } from "node:fs";
import chalk from "chalk";
import { startServer } from "~/src/server.js";
import { loadConfig } from "~/src/config.js";

program
  .name("abi-node")
  .description("ABI-driven mock RPC node for Web3 development")
  .version("1.0.0")
  .argument("[abiDir]", "Directory containing ABI JSON files")
  .option("-p, --port <number>", "Port to run the server on", "8545")
  .option("-c, --config <path>", "Path to config file", "abi.config.json")
  .action(async (abiDir: string | undefined, options: { port: string; config: string }) => {
    const port = parseInt(options.port, 10);

    // Load config first
    const config = await loadConfig(process.cwd(), options.config);
    const hasConfigContracts = config.contracts && Object.keys(config.contracts).length > 0;

    // Determine abiDir
    let resolvedAbiDir = abiDir;

    if (!resolvedAbiDir && !hasConfigContracts) {
      // No abiDir provided and no contracts in config
      console.error(chalk.red("\n✖ Error: No ABI source specified\n"));
      console.log("You must either:");
      console.log(chalk.dim("  1. Provide an ABI directory:"));
      console.log(chalk.cyan("     abi-node ./abis\n"));
      console.log(chalk.dim("  2. Create an abi.config.json with contracts:"));
      console.log(chalk.cyan('     { "contracts": { "0x...": "./path/to/Abi.json" } }\n'));
      process.exit(1);
    }

    // If abiDir is provided, verify it exists
    if (resolvedAbiDir && !existsSync(resolvedAbiDir)) {
      console.error(chalk.red(`\n✖ Error: Directory not found: ${resolvedAbiDir}\n`));
      console.log("Make sure the directory exists and contains ABI JSON files.");
      console.log(chalk.dim("\nExample structure:"));
      console.log(chalk.dim("  ./abis/"));
      console.log(chalk.dim("    ├── Token.json"));
      console.log(chalk.dim("    └── Vault.json\n"));
      process.exit(1);
    }

    await startServer({ port, abiDir: resolvedAbiDir, configPath: options.config });
  });

program.parse();
