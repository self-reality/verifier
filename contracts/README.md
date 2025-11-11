Verifier Smart Contracts

Overview
- This folder contains the on-chain components for Verifier.
- Primary package: `registry/` which holds the `VerifierRegistry.sol` contract, Hardhat setup, tests, and deployment scripts.

Structure
- `registry/contracts/VerifierRegistry.sol`: Core registry contract.
- `registry/scripts/deploy.js`: Deployment script.
- `registry/scripts/manage.js`: Management script for updating fees and ownership.
- `registry/scripts/verify.js`: Verification script for block explorers.
- `registry/scripts/config.json`: Source configuration for deployments and management.
- `registry/test/VerifierRegistry.t.js`: Test suite.
- `registry/constants.json`: Last deployed addresses by network.
- `registry/hardhat.config.js`: Hardhat configuration.

Requirements
- Node.js 18+
- pnpm or npm

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

## Deploy

### Prerequisites
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

### Network Configuration

Before deploying, ensure the network is configured in `scripts/config.json`. Network names should match the network names in `hardhat.config.js` (lowercase).

```json
{
  "base": {
    "config": {
      "minFee": "0",
      "maxFee": "0",
      "owner": "0x0000000000000000000000000000000000000000"
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

### Deploy to a Network

Testnet (Base Sepolia):
```bash
pnpm hardhat run scripts/deploy.js --network baseSepolia
```

Mainnet (Base):
```bash
pnpm hardhat run scripts/deploy.js --network base
```

### After Deployment

After deployment completes:
1. The deployed contract address will be printed to the console
2. `constants.json` will be updated with deployment details
3. Share the `constants.json` file with your frontend and worker services

## Managing Contract Parameters

After deployment, update contract parameters (fees and owner) using the `manage.js` script:

```bash
npx hardhat run scripts/manage.js --network <network-name>
```

This script will:
1. Read the desired configuration from `config.json` for the selected network
2. Connect to the deployed contract and read current values
3. Show a comparison of current vs desired values
4. Ask for confirmation before making any changes
5. Update fees and/or transfer ownership if confirmed
6. Update `constants.json` with the new configuration

**Note:** Ensure you have `DEPLOYER_KEY` or `MNEMONIC_FILE_PATH` set in your `.env` file, and that the deployer account is the current owner of the contract.

## Verification

After deployment, verify your contract on block explorers:

### 1. Get API Key
- For Base: Get API key from [Basescan](https://basescan.org/myapikey)
- For other networks: Get from respective block explorer

### 2. Add API Key to .env
Add one of these to your `.env` file (both work):
```bash
ETHERSCAN_API_KEY=your_api_key_here
# or
BASESCAN_API_KEY=your_api_key_here
```
Note: Using Etherscan V2 API format (single API key for all networks)

### 3. Run Verification
```bash
npm run verify:base
# or
npm run verify:sepolia
# or for other networks:
npx hardhat run scripts/verify.js --network <network-name>
```

The verification script automatically reads constructor arguments from `constants.json`.

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

Notes
- Use `constants.json` as the single source of truth for frontends and workers.
- Review `hardhat.config.js` for configured networks and compiler settings.
- For reproducible installs, prefer `pnpm` as used across the repo.

