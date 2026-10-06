Verifier Smart Contracts

Overview
- This folder contains the on-chain components for Verifier.
- Primary package: `registry/` which holds the `VerifierRegistry.sol` contract, Hardhat setup, tests, and deployment scripts.

Structure
- `registry/contracts/VerifierRegistry.sol`: Core registry contract.
- `registry/contracts/VerifierRegistryUSDC.sol`: Registry paid in USDC, with a signed EIP-3009 authorization (x402) or an allowance.
- `registry/contracts/mocks/MockUSDC.sol`: Test token with the EIP-3009 functions of USDC.
- `registry/scripts/deploy.js`: Deployment script.
- `registry/scripts/deploy-usdc.js`: Deployment script for `VerifierRegistryUSDC`.
- `registry/constants-usdc.json`: Last deployed `VerifierRegistryUSDC` addresses by network.
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

Initally was set to 0 to $5 for each chain.

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

## USDC Registry

`VerifierRegistryUSDC` takes the fee in USDC and emits the same `Anchored` event as `VerifierRegistry`, with `paid` in token units.

- `anchorWithAuthorization(cid, filename, auth)`: pulls the USDC with a signed EIP-3009 authorization addressed to the contract and emits the proof in one transaction. Callable by the payer or by an allowed relayer. This is what the anchor worker (`workers/anchor`) calls for x402 payments.
- `anchor(cid, filename)`: pays `price` from an allowance.
- `anchorPaid(cid, filename, from, value, nonce)`: relayer only. Anchors against an authorization that was already executed on the token.
- `firstAnchor(cid)`: view. Returns the submitter, block time and block number of the first anchor of `cid`, or zeros if there is none. `records(keccak256(cid))` reads the same slot; the key equals topic 1 of the `Anchored` event, so the full proof is the log with that topic in the returned block.
- Later anchors of the same `cid` emit the event and leave the record unchanged. A first anchor costs about 37,000 more gas than a repeat.
- `setPrice`, `setRelayer`, `withdraw(token, to)`: owner only.

The token address and price per network live under `usdc` in `scripts/config.json` (price in token units: `500000` = 0.50 USDC).

```bash
# RELAYER_ADDRESS is the wallet the anchor worker sends from; it is allowed at deployment
RELAYER_ADDRESS=0x... pnpm hardhat run scripts/deploy-usdc.js --network baseSepolia
RELAYER_ADDRESS=0x... pnpm hardhat run scripts/deploy-usdc.js --network base
```

The address is written to `constants-usdc.json`, which the web app reads to show certificates for these proofs. To verify on a block explorer:

```bash
npx hardhat verify --network base <address> <owner> <token> <price>
```

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

