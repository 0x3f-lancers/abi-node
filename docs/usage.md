# Usage

`abi-node` runs a local JSON-RPC server from your contract ABIs so frontend or indexer work can start before deployment.

## Install & Run
```bash
pnpm add -D abi-node
npx abi-node ./abis --port 8545
```

The CLI accepts an ABI directory or a config file:
```bash
abi-node ./abis
abi-node --config ./abi.config.json
abi-node init # generates a starter config file
```

## Configuration (`abi.config.json`)
The config file is optional. If `contracts` is provided, you can run without an ABI directory. Use `--config` to point to a custom path.

```json
{
  "port": 8545,
  "blockTime": 1,
  "proxyRpc": "https://sepolia.infura.io/v3/YOUR_KEY",
  "contracts": {
    "0x1111111111111111111111111111111111111111": "./abis/Token.json"
  },
  "overrides": {
    "Token.name": "Mock Token",
    "Token.balanceOf": { "value": "1000000000000000000" },
    "Token.getScore": { "value": "42" },
    "0x1111111111111111111111111111111111111111.transfer": {
      "revert": "Transfers disabled in mock mode"
    }
  },
  "logging": {
    "requests": true,
    "blocks": true,
    "hideEmptyBlocks": false
  }
}
```

### Config Notes
- `blockTime: 0` enables instant mining.
- `contracts` maps contract addresses to ABI files (relative to the project root).
- `overrides` keys are `ContractName.functionName` or `0xAddress.functionName`.
- Use `values: ["1", "2"]` when a function returns multiple outputs.
- `proxyRpc` forwards system calls to an upstream RPC when configured.

