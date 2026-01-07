# Changelog

## [Unreleased]

### Phase 1: Skeleton - Complete

- CLI with commander: `--port` flag and ABI directory argument
- Fastify server handling JSON-RPC POST requests
- Implemented `eth_chainId` (returns 0x7a69 / 31337)
- Implemented `eth_blockNumber` (returns current block as hex)
- Milestone verified: `curl` requests return valid JSON-RPC responses
- Added README.md with project overview and usage guide

### Phase 2: ABI Loading & Routing - Complete

- ABI loader: reads JSON files from directory, supports raw arrays and Hardhat/Foundry artifacts
- Config file support: optional `abi.config.json` for pinning contract addresses
- Contract registry: auto-assigns deterministic addresses when not configured
- Request routing: looks up contract by `to` address
- Function decoding: uses viem to decode selector and arguments
- Startup output shows registered contracts with addresses
- Milestone verified: server logs decoded function calls (e.g., `Token.balanceOf(...)`)

### Phase 3: Mock Responses - Complete

- Default value generator: deterministic values per type (uint→1, bool→true, address→0x...dEaD, string→"mock")
- `eth_call` returns ABI-encoded mock responses based on function output types
- In-memory state store with convention-based getter/setter mapping (setFoo↔getFoo)
- `eth_sendTransaction` mutates state, increments block number, returns tx hash
- `eth_getTransactionReceipt` returns receipt for pending transactions
- Reads check state first, fall back to defaults
- Milestone verified: setScore(user, 50) → getScore(user) returns 50

### Phase 3.5: Blockchain Architecture - Complete

- Realistic blockchain simulation with mempool and block mining
- Genesis block created on startup (block 0)
- Configurable `blockTime` in `abi.config.json` (default: 1 second, 0 = instant)
- Transactions enter mempool, receipt returns `null` while pending
- Auto-mining loop produces blocks on interval (includes empty blocks)
- Transactions mined into blocks with proper receipts
- State changes applied only when block is mined
- Added `eth_getBlockByNumber` and `eth_getLogs` methods
- Console output shows block mining with transaction count
- Graceful shutdown stops mining loop
- Wrote test cases.

### Phase 4: Events & Logs - Complete

- Event matching: functions like `transfer` emit corresponding `Transfer` events
- Smart parameter matching: event parameters matched by name to function inputs
- Special handling: `from`/`sender` parameters automatically use tx sender address
- Common pattern support: `to`→`recipient`/`dst`, `amount`→`value`/`wad` aliases
- Proper topic encoding: indexed parameters encoded as topics (1-3), non-indexed as data
- Event signature hashing: topic0 contains keccak256 of event signature
- `eth_getLogs` filters by address, block range, and topics
- Tests: New tests covering phase events & logs.

### Phase 5: Polish - Complete

#### Proxy Mode

- Forward unknown contract calls to upstream RPC when `proxyRpc` is configured
- System methods (`eth_getBalance`, `eth_getCode`, `eth_gasPrice`, etc.) proxied to upstream
- Known contracts still mocked locally for hybrid mock/real setup
- Unknown RPC methods forwarded to proxy if available

#### Override System

- Per-function return value overrides via `abi.config.json`
- Support for `ContractName.function` or `0xAddress.function` formats
- Simple value overrides: `"Token.balanceOf": "1000000000000000000"`
- Multi-value overrides: `"Vault.getReserves": { "values": ["1000", "2000"] }`
- Revert simulation: `"Token.transfer": { "revert": "Transfer disabled" }`
- Override precedence: Override → State → Default

#### Error Handling

- Typed error classes: `UnknownContractError`, `DecodeError`, `RevertError`
- Improved error messages with context (address, selector, reason)
- Proper JSON-RPC error codes (3 for revert, -32000 for server errors)
- Better error response formatting in RPC handler

#### Config Format

```json
{
  "proxyRpc": "https://sepolia.infura.io/v3/...",
  "overrides": {
    "Token.balanceOf": "1000000000000000000",
    "Token.transfer": { "revert": "Transfer disabled" }
  }
}
```

- Tests: 71 tests covering all phases

### Phase 5.1: Testing & Developer Experience

#### CLI Improvements

- Clear error messages when no ABI source specified
- Helpful error when ABI directory not found (with example structure)
- Config-only mode: run with just `abi.config.json`, no abiDir required
- Custom config path: `--config` / `-c` flag

#### Config Contracts Loading

- `config.contracts` now loads ABIs directly from specified paths
- Works without abiDir when contracts are defined in config
- Example: `{ "contracts": { "0x123...": "./contracts/Token.json" } }`

#### Request Logging

- All RPC requests logged to console with method name
- Contract call details: `← eth_call to=0x5FbD...0aa3 0x70a08231`
- Response results: `→ 0x000...0001` or `→ error: message`

#### CORS Support

- Enabled CORS headers for browser requests
- Handles preflight OPTIONS requests
- Works with frontend apps on different ports (e.g., localhost:3000)

#### Logging Configuration

```json
{
  "logging": {
    "requests": true,
    "blocks": true,
    "hideEmptyBlocks": true
  }
}
```

- `requests`: Show/hide RPC request logs (default: true)
- `blocks`: Show/hide block mining messages (default: true)
- `hideEmptyBlocks`: Only show blocks with transactions (default: false)

#### Mock RPC Methods

- `eth_getBalance`: Returns 100 ETH (no proxy required)
- `eth_getCode`: Returns 0x1 for known contracts, 0x for unknown
- `eth_gasPrice`: Returns 1 gwei
- `eth_estimateGas`: Returns 21000 gas
- `eth_getTransactionCount`: Returns 0
- `eth_accounts`: Returns empty array

#### Test Organization

- Split `phase5.test.ts` into focused test files:
  - `override.test.ts` - Override system tests
  - `errors.test.ts` - Error handling tests
  - `proxy.test.ts` - Proxy mode tests

### Phase 5.2: Init Command & TypeScript ABI Support

#### Init Command

- `abi-node init`: Creates `abi.config.json` with default settings
- All logging features enabled by default
- `--force` flag to overwrite existing config
- Shows helpful next steps after creation

#### TypeScript ABI Files

- Support for `.ts` files with viem-style ABI exports
- Handles `export const abi = [...] as const` format
- Works with or without `as const` assertion
- Auto-derives contract name from export name (e.g., `stakingAbi` → `Staking`)
- Skips `.d.ts` declaration files automatically
- Supports both directory scanning and config `contracts` paths
- Mix `.json` and `.ts` files in the same directory
- Tests: 76 tests covering all phases
