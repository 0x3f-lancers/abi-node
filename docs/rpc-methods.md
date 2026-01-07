# RPC Methods

`abi-node` responds to a focused set of JSON-RPC methods for integration testing. Unsupported methods return a JSON-RPC error.

## Mocked Locally
- `eth_chainId`: Returns the configured chain ID.
- `eth_blockNumber`: Latest mined block number.
- `eth_call`: ABI-decoded read calls using overrides, state, and defaults.
- `eth_sendTransaction`: Enqueues a transaction for mining.
- `eth_getTransactionReceipt`: `null` while pending; populated after mining.
- `eth_getBlockByNumber`: Returns minimal block metadata and hashes.
- `eth_getLogs`: Emits ABI-encoded event logs from mined blocks.
- `net_version`: Stringified chain ID.
- `eth_getBalance`: Fixed mock balance (100 ETH).
- `eth_getCode`: `0x1` for known contracts, `0x` otherwise.
- `eth_gasPrice`, `eth_estimateGas`, `eth_getTransactionCount`, `eth_accounts`: Mocked defaults.

## Proxy-Enabled (when `proxyRpc` is set)
When `proxyRpc` is configured, system calls are forwarded to the upstream node:
- `eth_getBalance`, `eth_getCode`, `eth_gasPrice`, `eth_estimateGas`, `eth_getTransactionCount`, `eth_accounts`.
- `eth_getStorageAt` (only available in proxy mode).

## Behavior Notes
- Receipts are `null` until a block is mined.
- Logs are generated from ABI event definitions during mining.
- Unknown contract addresses in `eth_call`/`eth_sendTransaction` can be proxied when `proxyRpc` is set.
