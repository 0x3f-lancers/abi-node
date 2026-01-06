# abi-node

**Your contract isn't deployed. Your frontend is.**

Stop waiting. Start building.

---

## The Problem

Your smart contract is still being written. Or audited. Or "almost done."

Meanwhile, your frontend team is blocked. Your indexer team is blocked. Everyone's waiting for a contract that doesn't exist yet—even though the **interface** was defined weeks ago.

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

# Run with your ABIs
pnpm abi-node ./abis --port 8545

# Point your app to it
RPC_URL=http://localhost:8545
```

## Features

- **Zero-chain** - No Anvil, no Hardhat node, no Docker
- **ABI-first** - If you have the interface, you have the mock
- **Stateful** - Writes persist in memory, reads reflect them
- **Realistic mining** - Mempool, blocks, pending transactions
- **Event logs** - Indexers and subgraphs work out of the box
- **Drop-in** - Standard JSON-RPC, works with any Web3 library

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

Create `abi.config.json` to customize behavior:

```json
{
  "port": 8545,
  "blockTime": 1,
  "contracts": {
    "0x1234...": "./abis/Token.json",
    "0x5678...": "./abis/Vault.json"
  }
}
```

| Option      | Default | Description                                    |
| ----------- | ------- | ---------------------------------------------- |
| `port`      | 8545    | Server port                                    |
| `blockTime` | 1       | Seconds between blocks (0 = instant mining)   |
| `contracts` | -       | Map contract addresses to ABI files           |

## Why Not Anvil/Hardhat?

Those are fantastic tools—for testing **contract logic**.

`abi-node` is for testing **integration**. You don't need EVM execution to build a UI. You need predictable responses that match your ABI.

|                | abi-node    | Anvil/Hardhat  |
| -------------- | ----------- | -------------- |
| Needs Solidity | No          | Yes            |
| Startup time   | Instant     | Seconds        |
| Purpose        | Integration | Contract logic |
| Complexity     | Minimal     | Full EVM       |

## Philosophy

> The interface is the contract.

If two teams agree on an ABI, they can work in parallel. One builds the contract. One builds everything else. They meet at deployment-not before.

## License

MIT
