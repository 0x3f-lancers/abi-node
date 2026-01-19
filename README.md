> **Note:** PRs are not accepted at this time. If you encounter any issues, please [open an issue](https://github.com/0x3f-lancers/abi-node/issues) and we'll address it promptly.

# abi-node

**This tool lies to you. On purpose.**

`abi-node` is a fake Ethereum RPC server that returns structurally correct but semantically meaningless responses. It exists to unblock frontend development when contracts aren't ready.

It does **not** simulate the EVM. It does **not** validate your logic. It **will** make your UI work - and that's exactly the problem.

> _abi-node is a consciously dishonest tool that saves time - not correctness._

If you don't understand that tradeoff, **do not use this tool**.

---

## What It Actually Does

Give it ABIs. Get a JSON-RPC endpoint that:

- Accepts any call to registered contracts
- Returns ABI-compliant mock data
- Pretends transactions succeed
- Emits fake events
- Lies about everything else

```bash
npx abi-node ./abis --port 8545
```

Your frontend now has a "backend." It's fake. But it responds.

---

## Non-Goals

This tool explicitly does **NOT**:

|                        |                                                             |
| ---------------------- | ----------------------------------------------------------- |
| Simulate EVM execution | No opcodes, no gas computation, no actual state transitions |
| Enforce invariants     | No require/revert logic unless you manually override        |
| Validate permissions   | No access control, no ownership checks                      |
| Check balances         | Infinite money for everyone                                 |
| Preserve atomicity     | No transaction rollbacks, no proper revert handling         |
| Replace testnets       | This is not a substitute for real chain testing             |
| Guarantee correctness  | If it works here, it might still break on mainnet           |

**If you need any of the above, use Anvil, Hardhat, or Foundry.**

---

## When NOT to Use abi-node

**Do not use this tool if:**

- You're testing contract logic (use Foundry/Hardhat)
- You need real gas estimation (we return fake values)
- You're debugging why something reverts (we don't revert by default)
- You think "works locally" means "works in production"
- You're a junior engineer without strong protocol understanding
- Your team doesn't have clear contract ownership

**abi-node is for:**

- Experienced frontend engineers who know this is a hack
- Protocol teams with strong contract ownership
- Parallel development when the ABI is stable but contracts aren't deployed
- Quick UI iteration, not correctness validation

---

## Reality & Limitations

### ABI Describes Shape, Not Behavior

An ABI tells you function signatures. It tells you nothing about:

- When functions revert
- What state they actually modify
- Access control rules
- Cross-function dependencies
- Invariants

**Risk:** UI works against abi-node, breaks on real chain. Engineers blame contracts, not mocks.

### State Is Not the EVM

State "persists" in memory, but:

- No atomicity
- No proper reverts
- No cross-call coupling
- No reentrancy

**Risk:** Multi-step flows that work here will break on real chains.

### Overrides Rot Silently

Overrides encode assumptions at a point in time. When ABIs change:

- Overrides don't update
- No warnings by default
- Tests validate the wrong reality

**Risk:** Phantom bugs and false confidence.

### Gas Estimation Is Fake

We return hardcoded values. They're wrong. Always.

**Risk:** Gas-sensitive UI logic is never exercised. Prod failures during fee spikes.

### Proxy Fallback Creates Split Reality

When using `proxyRpc`, some calls hit real chain, some hit mocks.

**Risk:** Inconsistent data. "Works locally, breaks on testnet" syndrome.

---

## Supported Methods (25 total)

| Method                         | Accuracy      | Notes                                   |
| ------------------------------ | ------------- | --------------------------------------- |
| `eth_chainId`                  | Mocked        | Returns hardcoded 31337                 |
| `eth_blockNumber`              | Simulated     | Increments with fake mining             |
| `eth_call`                     | **Fake**      | Returns mock data, no execution         |
| `eth_sendTransaction`          | **Fake**      | Always "succeeds", no validation        |
| `eth_sendRawTransaction`       | **Fake**      | Decodes tx, recovers signer address     |
| `eth_getTransactionReceipt`    | **Fake**      | Fabricated receipts                     |
| `eth_getTransactionByHash`     | **Fake**      | Returns fabricated tx data              |
| `eth_getBlockByNumber`         | Simulated     | Fake blocks with fake txs               |
| `eth_getBlockByHash`           | Simulated     | Search blocks by hash                   |
| `eth_getLogs`                  | **Fake**      | Synthetic events from writes            |
| `eth_estimateGas`              | **Unsafe**    | Returns 1M gas (do not trust)           |
| `eth_gasPrice`                 | Mocked        | Returns 1 gwei                          |
| `eth_maxPriorityFeePerGas`     | Mocked        | Returns 1 gwei                          |
| `eth_feeHistory`               | Mocked        | Fabricated fee history                  |
| `eth_getBalance`               | **Fake**      | Everyone has 100 ETH                    |
| `eth_getCode`                  | Identity-only | Returns 0x1 for known contracts         |
| `eth_getTransactionCount`      | Mocked        | Always returns 0                        |
| `eth_accounts`                 | Mocked        | Returns empty array                     |
| `net_version`                  | Mocked        | Returns chain ID as string              |
| `web3_clientVersion`           | Mocked        | Returns "abi-node/1.0.0"                |
| `eth_syncing`                  | Mocked        | Always returns false                    |
| `eth_mining`                   | Mocked        | Always returns false                    |
| `eth_hashrate`                 | Mocked        | Always returns 0                        |
| `eth_getUncleCountByBlockHash` | Mocked        | Always returns 0                        |
| `eth_getUncleCountByBlockNumber`| Mocked       | Always returns 0                        |

**Legend:**

- **Mocked** - Hardcoded value, doesn't change
- **Simulated** - Changes over time, but not real
- **Fake** - Completely fabricated, no real logic
- **Unsafe** - Will cause problems if trusted
- **Identity-only** - Just checks existence, no real data

---

## Quick Start

```bash
# Install
pnpm add -D abi-node

# Initialize config
abi-node init

# Run
abi-node ./abis --port 8545

# Point your app to the lie
RPC_URL=http://localhost:8545
```

---

## Configuration

```bash
abi-node init          # Prompts for TS/JS/JSON
abi-node init --ts     # TypeScript (recommended)
abi-node init --js     # JavaScript
abi-node init --json   # JSON
```

Precedence: `abi.config.ts` > `abi.config.js` > `abi.config.json`

### TypeScript Config

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

### Options

| Option      | Default | Description                          |
| ----------- | ------- | ------------------------------------ |
| `port`      | 8545    | Server port                          |
| `blockTime` | 1       | Seconds between blocks (0 = instant) |
| `contracts` | -       | Address → ABI file mapping           |
| `overrides` | -       | Custom return values                 |
| `logging`   | -       | Console output control               |
| `proxyRpc`  | -       | Upstream RPC for unmocked calls      |

---

## Overrides

Override default mock values:

```json
{
  "overrides": {
    "Token.totalSupply": "1000000000000000000000",
    "Token.balanceOf(0xABC...)": "5000000000000000000",
    "Staking.getUserInfo": { "values": ["1000", "500", "true"] },
    "Token.transfer": { "revert": "Transfers disabled" }
  }
}
```

**Resolution order:** Argument-specific → Generic → State → Default

**Warning:** Overrides don't validate against ABI. They can become stale.

---

## Why Not Anvil/Hardhat?

Those tools simulate the EVM. They're correct. They're also heavier.

|                | abi-node      | Anvil/Hardhat    |
| -------------- | ------------- | ---------------- |
| Needs Solidity | No            | Yes              |
| Startup        | Instant       | Seconds          |
| Memory         | Light         | Heavy            |
| Correctness    | **None**      | High             |
| Purpose        | UI unblocking | Contract testing |

**Use abi-node when:** You need speed and don't care about correctness yet.

**Use Anvil when:** You need correctness and can wait for setup.

---

## Roadmap

- [ ] JS/TS Override Scripts - Write logic, not just values
- [ ] Event Emission on Write - Auto-emit events when state changes
- [ ] Snapshot/Restore - Reset state for repeatable testing
- [ ] Scripted Scenarios - Pre-defined state sequences for E2E
- [ ] AI Context Generator - Export ABI summary for AI-assisted override authoring
- [ ] Chaos Mode - Random reverts, delays, failures for resilience testing

---

## The Bottom Line

abi-node is a **productivity hack**, not an **infrastructure layer**.

It helps you move fast. It does not help you move correctly.

Use it to unblock work. Then test on a real chain. Then test again.

> _The interface is the contract - but the contract is not the behavior._

---

## License

MIT
