Verifier Smart Contracts

Overview
- This folder contains the on-chain components for Verifier.
- Primary package: `registry/` which holds the `VerifierRegistry.sol` contract, Hardhat setup, tests, and deployment scripts.

Structure
- `registry/contracts/VerifierRegistry.sol`: Core registry contract.
- `registry/scripts/deploy.js`: Deployment script.
- `registry/test/VerifierRegistry.t.js`: Test suite.
- `registry/constants.json`: Last deployed addresses by network.
- `registry/hardhat.config.js`: Hardhat configuration.

Requirements
- Node.js 18+
- pnpm or npm
- Foundry (optional) if you prefer, but project is Hardhat-based

Getting Started
```
cd contracts/registry
pnpm i # or npm i
```

Build
```
pnpm hardhat compile
```

Test
```
pnpm hardhat test
```

Local Node (optional)
```
pnpm hardhat node
```

Deploy
1) Configure environment variables for the target network:
```
export RPC_URL="https://your.rpc"
export PRIVATE_KEY="0x..."
```
2) Run deploy:
```
pnpm hardhat run scripts/deploy.js --network <networkName>
```
3) The script will update `registry/constants.json` with the deployed address.

Notes
- Use `constants.json` as the single source of truth for frontends and workers.
- Review `hardhat.config.js` for configured networks and compiler settings.
- For reproducible installs, prefer `pnpm` as used across the repo.


## constants.json Schema Example

```
{
  "sepolia": {
    "address": "0x...",
    "chainId": 11155111,
    "deployedAt": "2024-07-01T11:11:00.000Z",
    "config": {
      "minCommission": "2500000000000",
      "maxCommission": "1300000000000000",
      "owner": "0x0123...4567"
    }
  }
}
```

