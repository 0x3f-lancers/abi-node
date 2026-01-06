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
- `src/state/store.ts` - In-memory state with getter/setter convention
- `src/rpc/handler.ts` - JSON-RPC method handlers

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

Optional `abi.config.json`:
```json
{
  "port": 8545,
  "blockTime": 1,
  "proxyRpc": "https://sepolia.infura.io/v3/...",
  "contracts": {
    "0x1234...": "./abis/Token.json",
    "0x5678...": "./abis/Vault.json"
  }
}
```

- `blockTime`: Seconds between blocks (default: 1, set to 0 for instant mining)
