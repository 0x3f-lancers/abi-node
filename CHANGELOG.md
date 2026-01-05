# Changelog

## [Unreleased]

### Phase 1: Skeleton - Complete
- CLI with commander: `--port` flag and ABI directory argument
- Fastify server handling JSON-RPC POST requests
- Implemented `eth_chainId` (returns 0x7a69 / 31337)
- Implemented `eth_blockNumber` (returns current block as hex)
- Milestone verified: `curl` requests return valid JSON-RPC responses
- Added README.md with project overview and usage guide
