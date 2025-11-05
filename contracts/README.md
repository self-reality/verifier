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

## Prerequisites
1. Install dependencies:
```bash
cd contracts/registry
pnpm install
```

2. Set up your environment configuration:
```bash
cp .env.template .env
```

3. Edit `.env` and add your credentials. You have two options:

**Option A: Private Key (Recommended)**
```bash
DEPLOYER_KEY=0xyourprivatekeyhere
BASE_SEPOLIA_RPC=https://sepolia.base.org
```

**Option B: Mnemonic File**
```bash
MNEMONIC_FILE_PATH=/path/to/your/mnemonic.js
BASE_SEPOLIA_RPC=https://sepolia.base.org
```

The mnemonic file should be a `.js` file with the following structure:
```javascript
module.exports = { 
  mnemonic: "your twelve or twenty-four word mnemonic phrase here"
}
```

The deployment will use the first address (index 0) derived from the mnemonic.

4. Ensure your deployer address has sufficient funds on the target network.

## Deploy to a Network

### Testnet Deploy (Base Sepolia)
```bash
pnpm hardhat run scripts/deploy.js --network baseSepolia
```

### Mainnet Deploy
```bash
# Base Mainnet
pnpm hardhat run scripts/deploy.js --network base

# Polygon
pnpm hardhat run scripts/deploy.js --network polygon

# Arbitrum
pnpm hardhat run scripts/deploy.js --network arbitrum

# Optimism
pnpm hardhat run scripts/deploy.js --network optimism

# Ethereum Mainnet
pnpm hardhat run scripts/deploy.js --network mainnet
```

The deployment script will:
- Verify your deployer address has funds
- Read fee configuration from `scripts/config.json`
- Deploy the VerifierRegistry contract
- Update `registry/constants.json` with the deployed address and configuration

## Network Configuration

Before deploying to a network, ensure it's configured in `scripts/config.json`. The file should contain fee settings for each network:

```json
{
  "base": {
    "config": {
      "minFee": "0",
      "maxFee": "0"
    }
  },
  "polygon": {
    "config": {
      "minFee": "2500000000000",
      "maxFee": "1300000000000000"
    }
  }
}
```

Network names should match the network names in `hardhat.config.js` (lowercase).

## After Deployment

After deployment completes:
1. The deployed contract address will be printed to the console
2. `constants.json` will be updated with deployment details
3. Share the `constants.json` file with your frontend and worker services
4. Consider verifying the contract on the block explorer (e.g., Basescan, Etherscan)

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
      "minFee": "2500000000000",
      "maxFee": "1300000000000000",
      "owner": "0x0123...4567"
    }
  }
}
```

