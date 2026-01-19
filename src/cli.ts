import { program } from "commander";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import chalk from "chalk";
import { startServer } from "~/src/server.js";
import { loadConfig, type Config, type ConfigFormat } from "~/src/config.js";

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

type PackageManager = "pnpm" | "yarn" | "npm";

/**
 * Detect the package manager used in the project
 * Priority: pnpm > yarn > npm
 */
function detectPackageManager(): PackageManager | null {
  const cwd = process.cwd();

  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  if (existsSync(join(cwd, "package.json"))) return "npm"; // Default to npm if package.json exists

  return null;
}

/**
 * Check if abi-node is already installed as a dependency
 */
function isAbiNodeInstalled(): boolean {
  const packageJsonPath = join(process.cwd(), "package.json");
  if (!existsSync(packageJsonPath)) return false;

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};
    return "abi-node" in deps || "abi-node" in devDeps;
  } catch {
    return false;
  }
}

/**
 * Install abi-node as a dev dependency
 */
function installAbiNode(pm: PackageManager): boolean {
  const commands: Record<PackageManager, string> = {
    pnpm: "pnpm add -D abi-node",
    yarn: "yarn add -D abi-node",
    npm: "npm install -D abi-node",
  };

  try {
    console.log(chalk.dim(`\nInstalling abi-node for TypeScript types...`));
    execSync(commands[pm], { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate TypeScript config file content with import
 */
function generateTsConfigWithImport(config: Config): string {
  return `import type { Config } from "abi-node";

export default {
  port: ${config.port},
  blockTime: ${config.blockTime},
  contracts: {
    // "0x1234...": "./abis/Token.json",
  },
  overrides: {
    // "Token.balanceOf": "1000000000000000000",
  },
  logging: {
    requests: ${config.logging?.requests ?? true},
    blocks: ${config.logging?.blocks ?? true},
    hideEmptyBlocks: ${config.logging?.hideEmptyBlocks ?? false},
  },
} satisfies Config;
`;
}

/**
 * Generate TypeScript config file content with inline types (fallback)
 */
function generateTsConfigInline(config: Config): string {
  return `interface Config {
  port?: number;
  blockTime?: number;
  proxyRpc?: string;
  contracts?: Record<string, string>;
  overrides?: Record<string, string | { value?: string; values?: string[]; revert?: string }>;
  logging?: {
    requests?: boolean;
    blocks?: boolean;
    hideEmptyBlocks?: boolean;
  };
}

export default {
  port: ${config.port},
  blockTime: ${config.blockTime},
  contracts: {
    // "0x1234...": "./abis/Token.json",
  },
  overrides: {
    // "Token.balanceOf": "1000000000000000000",
  },
  logging: {
    requests: ${config.logging?.requests ?? true},
    blocks: ${config.logging?.blocks ?? true},
    hideEmptyBlocks: ${config.logging?.hideEmptyBlocks ?? false},
  },
} satisfies Config;
`;
}

/**
 * Generate JavaScript config file content
 */
function generateJsConfig(config: Config): string {
  return `/** @type {import("abi-node").Config} */
export default {
  port: ${config.port},
  blockTime: ${config.blockTime},
  contracts: {
    // "0x1234...": "./abis/Token.json",
  },
  overrides: {
    // "Token.balanceOf": "1000000000000000000",
  },
  logging: {
    requests: ${config.logging?.requests ?? true},
    blocks: ${config.logging?.blocks ?? true},
    hideEmptyBlocks: ${config.logging?.hideEmptyBlocks ?? false},
  },
};
`;
}

/**
 * Generate JSON config file content
 */
function generateJsonConfig(config: Config): string {
  return JSON.stringify(config, null, 2) + "\n";
}

/**
 * Prompt user for config format selection
 */
async function promptForFormat(): Promise<ConfigFormat> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log(chalk.cyan("\nSelect config file format:\n"));
    console.log("  1. TypeScript (abi.config.ts) - recommended for type safety");
    console.log("  2. JavaScript (abi.config.js)");
    console.log("  3. JSON (abi.config.json)\n");

    rl.question(chalk.yellow("Enter choice (1-3) [1]: "), (answer) => {
      rl.close();

      const choice = answer.trim() || "1";

      switch (choice) {
        case "2":
          resolve("js");
          break;
        case "3":
          resolve("json");
          break;
        case "1":
        default:
          resolve("ts");
          break;
      }
    });
  });
}

/**
 * Check if any config file already exists
 */
function findExistingConfig(): string | null {
  const extensions = [".ts", ".js", ".json"];
  for (const ext of extensions) {
    const path = join(process.cwd(), `abi.config${ext}`);
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

program
  .name("abi-node")
  .description("ABI-driven mock RPC node for Web3 development")
  .version("1.0.0");

program
  .command("init")
  .description("Initialize abi.config with default settings")
  .option("-f, --force", "Overwrite existing config file")
  .option("--ts", "Create TypeScript config (abi.config.ts)")
  .option("--js", "Create JavaScript config (abi.config.js)")
  .option("--json", "Create JSON config (abi.config.json)")
  .option("--skip-install", "Skip auto-installing abi-node for TypeScript types")
  .action(async (options: { force?: boolean; ts?: boolean; js?: boolean; json?: boolean; skipInstall?: boolean }) => {
    const existingConfig = findExistingConfig();

    if (existingConfig && !options.force) {
      const fileName = existingConfig.split("/").pop();
      console.error(chalk.red(`\n✖ Error: ${fileName} already exists\n`));
      console.log(chalk.dim("Use --force to overwrite the existing file:\n"));
      console.log(chalk.cyan("  abi-node init --force\n"));
      process.exit(1);
    }

    // Determine format: flag > prompt
    let format: ConfigFormat;
    if (options.ts) {
      format = "ts";
    } else if (options.js) {
      format = "js";
    } else if (options.json) {
      format = "json";
    } else {
      format = await promptForFormat();
    }

    // Generate config content
    let content: string;
    let fileName: string;
    let useInlineTypes = false;

    switch (format) {
      case "ts": {
        fileName = "abi.config.ts";

        // Check if we need to install abi-node for types
        const pm = detectPackageManager();
        const alreadyInstalled = isAbiNodeInstalled();

        if (alreadyInstalled) {
          // Types are available via local installation
          content = generateTsConfigWithImport(DEFAULT_CONFIG);
        } else if (pm && !options.skipInstall) {
          // Try to install abi-node
          const installed = installAbiNode(pm);
          if (installed) {
            content = generateTsConfigWithImport(DEFAULT_CONFIG);
          } else {
            console.log(chalk.yellow("\n⚠ Could not install abi-node, using inline types\n"));
            content = generateTsConfigInline(DEFAULT_CONFIG);
            useInlineTypes = true;
          }
        } else if (!pm) {
          // No package.json, use inline types
          console.log(chalk.dim("\nNo package.json found, using inline types"));
          content = generateTsConfigInline(DEFAULT_CONFIG);
          useInlineTypes = true;
        } else {
          // --skip-install flag used
          content = generateTsConfigInline(DEFAULT_CONFIG);
          useInlineTypes = true;
        }
        break;
      }
      case "js":
        content = generateJsConfig(DEFAULT_CONFIG);
        fileName = "abi.config.js";
        break;
      case "json":
        content = generateJsonConfig(DEFAULT_CONFIG);
        fileName = "abi.config.json";
        break;
    }

    const configPath = join(process.cwd(), fileName);

    // If overwriting, remove old config files
    if (options.force && existingConfig) {
      const { unlinkSync } = await import("node:fs");
      try {
        unlinkSync(existingConfig);
      } catch {
        // Ignore if file doesn't exist
      }
    }

    writeFileSync(configPath, content);

    console.log(chalk.green(`\n✔ Created ${fileName}\n`));
    console.log(chalk.dim("Default configuration:"));
    console.log(chalk.dim(`  • Port: ${DEFAULT_CONFIG.port}`));
    console.log(chalk.dim(`  • Block time: ${DEFAULT_CONFIG.blockTime}s`));
    console.log(chalk.dim("  • Logging: all enabled\n"));

    if (useInlineTypes) {
      console.log(chalk.dim("Note: Using inline types. For better type support, run:"));
      console.log(chalk.cyan("  npm install -D abi-node\n"));
    }

    console.log("Next steps:");
    console.log(chalk.dim("  1. Add your contract ABIs to the contracts section:"));
    if (format === "json") {
      console.log(chalk.cyan('     "contracts": { "0x...": "./abis/Token.json" }\n'));
    } else {
      console.log(chalk.cyan('     contracts: { "0x...": "./abis/Token.json" }\n'));
    }
    console.log(chalk.dim("  2. Start the server:"));
    console.log(chalk.cyan("     abi-node\n"));
  });

program
  .command("start", { isDefault: true })
  .description("Start the mock RPC server")
  .argument("[abiDir]", "Directory containing ABI JSON files")
  .option("-p, --port <number>", "Port to run the server on", "8545")
  .option("-c, --config <path>", "Path to config file")
  .action(async (abiDir: string | undefined, options: { port: string; config?: string }) => {
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
      console.log(chalk.dim("  2. Create an abi.config.ts (or .js/.json) with contracts:"));
      console.log(chalk.cyan('     contracts: { "0x...": "./path/to/Abi.json" }\n'));
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
