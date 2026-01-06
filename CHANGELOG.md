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
