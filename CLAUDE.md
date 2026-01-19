# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**abi-node** (ABI-Mocker) is a schema-first mock RPC tool for Web3 development. It provides an ABI-driven local JSON-RPC server that replaces a real blockchain during development, allowing frontend, backend, and indexer teams to integrate immediately using only the contract ABI—without waiting for contract deployment.

### Core Concept
- Load real ABIs from your project
- Expose a standard Ethereum JSON-RPC endpoint (http://localhost:<port>)
- Intercept `eth_call`, `eth_sendTransaction`, and `eth_getLogs`
- Return ABI-encoded mock outputs with deterministic defaults
- Simulate stateful writes in memory
- Emit ABI-correct event logs for indexer development

## Build Commands

```bash
pnpm dev          # Development with hot reload (tsx --watch)
pnpm build        # Production build (tsup)
pnpm start        # Run built CLI
pnpm test         # Run all tests (vitest)
pnpm test <file>  # Run specific test file
```

## Architecture

### Tech Stack
- **Server**: Fastify (JSON-RPC HTTP server)
- **ABI Engine**: Viem (decode/encode calldata and event logs)
- **CLI**: Commander.js (flags, config loading)
- **Terminal UX**: Chalk (console output)

### Blockchain Simulation
Realistic blockchain with mempool and block mining:
- Genesis block created on startup (block 0)
- Transactions enter mempool → receipt returns `null` while pending
- Auto-mining loop produces blocks on configurable interval
- State changes applied only when block is mined
- Empty blocks are mined (realistic behavior)

### Response Pipeline
Single layered system with precedence: **Override → State → Default**

1. **ABI Defaults**: Zero-config deterministic values (uint256→1, bool→true, address→0x...dEaD, string→"mock")
2. **In-Memory State**: Writes mutate state, reads check state first then fall back to defaults
3. **Overrides**: Per-function custom handlers for edge cases

### Multi-Contract Support
Contract registry maps addresses to ABIs. Incoming requests routed by "to" field, decoded via function selector.

### Key Source Files
- `src/blockchain/chain.ts` - Core blockchain with mempool and mining loop
- `src/blockchain/types.ts` - Block, Transaction, Receipt types
- `src/abi/registry.ts` - Contract address → ABI mapping
- `src/abi/defaults.ts` - Default value generator for ABI types
- `src/abi/loader.ts` - ABI loading from JSON and TypeScript files
- `src/state/store.ts` - In-memory state with getter/setter convention
- `src/state/overrides.ts` - Override system with argument-based matching
- `src/rpc/handler.ts` - JSON-RPC method handlers
- `src/server.ts` - Fastify server with hot reload support

### Optional Proxy Mode
System calls (`eth_blockNumber`, `eth_chainId`, `eth_getBalance`) can be proxied to real upstream RPC while contract calls are mocked locally.

### RPC Surface (v0)
Required: `eth_chainId`, `eth_blockNumber`, `eth_call`, `eth_sendTransaction`, `eth_getTransactionReceipt`, `eth_getLogs`

Optional: `eth_getCode`, `eth_getBalance`, `net_version`

## Design Principles

- **Zero-Chain**: No Solidity compilation or local blockchain required
- **Drop-in Replacement**: Change only RPC_URL to switch from mock to real
- **Interface Simulator, Not Blockchain**: Simulates JSON-RPC interface, not EVM execution
- **Deterministic Defaults**: Predictable mock values for reliable test assertions

## Configuration

Config files are supported in three formats with precedence: `abi.config.ts` > `abi.config.js` > `abi.config.json`

Initialize config:
- `abi-node init` - Interactive prompt for format selection
- `abi-node init --ts` / `--js` / `--json` - Direct format selection
- `abi-node init --skip-install` - Skip auto-installing abi-node package

For TypeScript configs, `abi-node init` will:
1. Detect package manager (pnpm > yarn > npm)
2. Auto-install `abi-node` as devDependency for type support
3. Fall back to inline types if no package.json exists

### TypeScript Config (recommended)
```typescript
import type { Config } from "abi-node";

export default {
  port: 8545,
  blockTime: 1,
  contracts: {
    "0x1234...": "./abis/Token.json",
    "0x5678...": "./abis/Vault.ts",
  },
  overrides: {
    "Token.balanceOf": "1000000000000000000",
    "Staking.getUserDetails": { values: ["1000", "500", "true"] },
  },
  logging: {
    requests: true,
    blocks: true,
    hideEmptyBlocks: false,
  },
} satisfies Config;
```

### JavaScript Config
```javascript
/** @type {import("abi-node").Config} */
export default {
  port: 8545,
  blockTime: 1,
  contracts: {
    "0x1234...": "./abis/Token.json",
  },
};
```

### JSON Config
```json
{
  "port": 8545,
  "blockTime": 1,
  "contracts": {
    "0x1234...": "./abis/Token.json"
  }
}
```

Configuration options:
- `port`: Server port (default: 8545)
- `blockTime`: Seconds between blocks (default: 1, set to 0 for instant mining)
- `proxyRpc`: Optional upstream RPC URL for proxying system calls
- `contracts`: Map of contract addresses to ABI file paths (supports .json and .ts files)
- `overrides`: Custom return values per function (see Override System below)
- `logging.requests`: Show RPC requests and responses (default: true)
- `logging.blocks`: Show block mining messages (default: true)
- `logging.hideEmptyBlocks`: Hide empty blocks from console (default: false)

### Hot Reload
The config file is watched for changes. When modified, the server automatically:
- Reloads contract registry from updated `contracts` mapping
- Updates override rules from `overrides` section
- Applies new logging settings
No server restart required

### Override System
Custom return values for specific functions with argument-based matching:

**Format**: `"ContractName.functionName"` or `"ContractName.functionName(arg1, arg2)"`

**Value types**:
- Simple string: `"1000000000000000000"`
- Object with single value: `{ "value": "1000" }`
- Object with multiple values (tuples/structs): `{ "values": ["1000", "500", "true"] }`
- Revert simulation: `{ "revert": "Error message" }`

**Precedence**: Argument-specific → Generic → State → Default

**Examples**:
```json
{
  "overrides": {
    "Token.totalSupply": "1000000000000000000",
    "Token.balanceOf": "500000000000000000",
    "Token.balanceOf(0xABC123...)": "5000000000000000000",
    "Staking.getUserInfo": { "values": ["1000", "500", "true"] },
    "Token.transfer": { "revert": "Transfers disabled" }
  }
}
```

Implementation: `src/state/overrides.ts` handles parsing and lookup with normalized argument matching

## Testing

Tests are located in `test/` directory using Vitest:

**Unit tests**:
- `test/defaults.test.ts` - ABI default value generation
- `test/store.test.ts` - State management
- `test/override.test.ts` - Override system with argument matching
- `test/registry.test.ts` - Contract registry
- `test/events.test.ts` - Event log generation
- `test/blockchain.test.ts` - Blockchain simulation
- `test/handler.test.ts` - RPC handler
- `test/proxy.test.ts` - Proxy client
- `test/config.test.ts` - Configuration loading
- `test/errors.test.ts` - Error handling

**Integration tests**:
- `test/integration/e2e.test.ts` - End-to-end RPC flow
- `test/integration/with-contracts.test.ts` - Multi-contract interactions

Run tests with:
```bash
pnpm test                    # All tests with watch mode
pnpm test test/defaults      # Specific test file
pnpm test --run              # Single run without watch
```
