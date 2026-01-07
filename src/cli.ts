import { program } from "commander";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { startServer } from "~/src/server.js";
import { loadConfig, type Config } from "~/src/config.js";

const DEFAULT_CONFIG: Config = {
  port: 8545,
  blockTime: 1,
  contracts: {},
  overrides: {},
  logging: {
    requests: true,
    blocks: true,
    hideEmptyBlocks: false,
  },
};

program
  .name("abi-node")
  .description("ABI-driven mock RPC node for Web3 development")
  .version("1.0.0");

program
  .command("init")
  .description("Initialize abi.config.json with default settings")
  .option("-f, --force", "Overwrite existing config file")
  .action((options: { force?: boolean }) => {
    const configPath = join(process.cwd(), "abi.config.json");

    if (existsSync(configPath) && !options.force) {
      console.error(chalk.red("\n✖ Error: abi.config.json already exists\n"));
      console.log(chalk.dim("Use --force to overwrite the existing file:\n"));
      console.log(chalk.cyan("  abi-node init --force\n"));
      process.exit(1);
    }

    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");

    console.log(chalk.green("\n✔ Created abi.config.json\n"));
    console.log(chalk.dim("Default configuration:"));
    console.log(chalk.dim(`  • Port: ${DEFAULT_CONFIG.port}`));
    console.log(chalk.dim(`  • Block time: ${DEFAULT_CONFIG.blockTime}s`));
    console.log(chalk.dim("  • Logging: all enabled\n"));
    console.log("Next steps:");
    console.log(chalk.dim("  1. Add your contract ABIs to the contracts section:"));
    console.log(chalk.cyan('     "contracts": { "0x...": "./abis/Token.json" }\n'));
    console.log(chalk.dim("  2. Start the server:"));
    console.log(chalk.cyan("     abi-node\n"));
  });

program
  .command("start", { isDefault: true })
  .description("Start the mock RPC server")
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
