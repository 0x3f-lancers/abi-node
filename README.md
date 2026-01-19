> **Note:** PRs are not accepted at this time. If you encounter any issues, please [open an issue](https://github.com/0x3f-lancers/abi-node/issues) and we'll address it promptly.

# abi-node

**Your contract isn't deployed. Your frontend is.**

Stop waiting. Start building.

## The Problem

Your smart contract is still being written. Or audited. Or "almost done."

Meanwhile, your frontend team is blocked. Your indexer team is blocked. Everyone's waiting for a contract that doesn't exist yet-even though the **interface** was defined weeks ago.

The ABI is ready. The contract isn't. Why should that stop you?

## The Solution

`abi-node` is a mock Ethereum RPC server that speaks your contract's language from day one.

Give it your ABIs. Get a fully functional JSON-RPC endpoint. No Solidity compilation. No local blockchain. No waiting.

```bash
npx abi-node ./abis --port 8545
```

That's it. Your frontend now has a backend.

## How It Works

```
┌─────────────┐         ┌─────────────┐
│   Your App  │  ───▶   │  abi-node   │
│  (wagmi,    │  JSON   │             │
│   viem,     │   RPC   │  Reads ABI  │
│   ethers)   │         │  Mocks Data │
└─────────────┘         └─────────────┘
        │                      │
        │    When ready...     │
        ▼                      ▼
┌─────────────┐         ┌─────────────┐
│   Your App  │  ───▶   │  Real Chain │
│             │         │  (no code   │
│  Same code  │         │   changes)  │
└─────────────┘         └─────────────┘
```

Change one environment variable. That's your entire migration.

## Quick Start

```bash
# Install
pnpm add -D abi-node

# Initialize config (interactive)
pnpm abi-node init

# Or run directly with ABIs
pnpm abi-node ./abis --port 8545

# Point your app to it
RPC_URL=http://localhost:8545
```

## Features

- **Zero-chain** - No Anvil, no Hardhat node, no Docker
- **Lightweight** - Minimal memory footprint, instant startup
- **ABI-first** - If you have the interface, you have the mock
- **Stateful** - Writes persist in memory, reads reflect them
- **Realistic mining** - Mempool, blocks, pending transactions
- **Event logs** - Indexers and subgraphs work out of the box
- **Drop-in** - Standard JSON-RPC, works with any Web3 library
- **TypeScript ABIs** - Supports viem-style `.ts` exports
- **Hot reload** - Edit config, server updates instantly
- **Override system** - Custom return values with argument matching

## Supported Methods

| Method                      | Status |
| --------------------------- | ------ |
| `eth_chainId`               | Ready  |
| `eth_blockNumber`           | Ready  |
| `eth_call`                  | Ready  |
| `eth_sendTransaction`       | Ready  |
| `eth_getTransactionReceipt` | Ready  |
| `eth_getBlockByNumber`      | Ready  |
| `eth_getLogs`               | Ready  |
| `net_version`               | Ready  |

## Configuration

Initialize with interactive format selection:

```bash
abi-node init          # Prompts for TS/JS/JSON
abi-node init --ts     # TypeScript config (recommended)
abi-node init --js     # JavaScript config
abi-node init --json   # JSON config
```

Config files are loaded with precedence: `abi.config.ts` > `abi.config.js` > `abi.config.json`

### TypeScript Config (recommended)

```typescript
import type { Config } from "abi-node";

export default {
  port: 8545,
  blockTime: 1,
  contracts: {
    "0x1234...": "./abis/Token.json",
    "0x5678...": "./abis/Staking.ts",
  },
  overrides: {
    "Token.balanceOf": "1000000000000000000",
    "Staking.getUserDetails": { values: ["1000", "500", "true"] },
  },
  logging: {
    requests: true,
    blocks: true,
    hideEmptyBlocks: true,
  },
} satisfies Config;
```

### JSON Config

```json
{
  "port": 8545,
  "blockTime": 1,
  "contracts": {
    "0x1234...": "./abis/Token.json",
    "0x5678...": "./abis/Staking.ts"
  },
  "overrides": {
    "Token.balanceOf": "1000000000000000000"
  },
  "logging": {
    "requests": true,
    "blocks": true,
    "hideEmptyBlocks": true
  }
}
```

### Options

| Option      | Default | Description                                        |
| ----------- | ------- | -------------------------------------------------- |
| `port`      | 8545    | Server port                                        |
| `blockTime` | 1       | Seconds between blocks (0 = instant mining)        |
| `contracts` | -       | Map contract addresses to ABI files (.json or .ts) |
| `overrides` | -       | Custom return values per function                  |
| `logging`   | -       | Control console output                             |

## Overrides

Return custom values for specific functions:

```json
{
  "overrides": {
    "Token.totalSupply": "1000000000000000000000",

    "Staking.getUserInfo": {
      "values": ["1000", "500", "1680000000", "true"]
    },

    "Token.balanceOf(0xABC123...)": "5000000000000000000",

    "Staking.getStake(0xABC..., 1)": {
      "values": ["1000", "true"]
    },

    "Token.transfer": { "revert": "Transfers disabled" }
  }
}
```

**Lookup order:** Argument-specific > Generic > State > Default

## Hot Reload

Edit your config file while the server is running. Changes to contracts, overrides, and logging apply instantly without restart.

## Compatibility

Tested with **viem** and **wagmi**. Should work with ethers.js and other Web3 libraries using standard JSON-RPC. If you encounter issues, please [open an issue](https://github.com/0x3f-lancers/abi-node/issues).

## Limitations

**Static mock values** - Overrides return fixed values without interconnected logic. In real contracts, function outputs often depend on each other (e.g., a calculated value based on multiple state variables). Here, each function returns independent values.

This is by design - abi-node is for _integration testing_ (API calls work, data shapes are correct, UI renders), not _logic testing_. Business logic should be tested in contract unit tests.

**Workaround**: Manually set consistent override values that make sense together.

**Future solution**: JS/TS Override Scripts will let you write actual logic with access to shared state.

## Why Not Anvil/Hardhat?

Those are fantastic tools—for testing **contract logic**.

`abi-node` is for testing **integration**. You don't need EVM execution to build a UI. You need predictable responses that match your ABI.

|                | abi-node    | Anvil/Hardhat  |
| -------------- | ----------- | -------------- |
| Needs Solidity | No          | Yes            |
| Startup time   | Instant     | Seconds        |
| Memory         | Lightweight | Heavy          |
| Purpose        | Integration | Contract logic |
| Complexity     | Minimal     | Full EVM       |

## Philosophy

> The interface is the contract.

If two teams agree on an ABI, they can work in parallel. One builds the contract. One builds everything else. They meet at deployment-not before.

## Roadmap

- [ ] JS/TS Override Scripts
- [ ] Event Emission on Write
- [ ] Snapshot/Restore
- [ ] Scripted Scenarios for E2E testing
- [ ] AI Context Generator (`abi-node context`) - export ABI summary for AI-assisted override authoring

## License

MIT
