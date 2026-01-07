# FAQ

## I see "No ABI source specified"
Provide an ABI directory (`abi-node ./abis`) or configure `contracts` in `abi.config.json`. You can generate a starter config with `abi-node init`.

## Unknown contract address errors
Make sure the address in your RPC calls is registered in `contracts`. When using an ABI directory, check the startup logs for auto-assigned addresses and use those in your client.

## Overrides are not taking effect
Keys must be `ContractName.functionName` or `0xAddress.functionName`. Contract names come from the ABI filename (e.g., `Token.json` → `Token`). Numeric override values must be strings.

## Empty blocks are noisy in the logs
Set `logging.hideEmptyBlocks` to `true` or disable block logs with `logging.blocks: false`.

## Proxy mode does nothing
Set `proxyRpc` to a valid RPC URL (with any required API key). When enabled, system methods are forwarded and unknown contract calls can be proxied.

