# Deployment Scripts

Config is the source for scripts. Results are written to constants.json

## Configuration

Add network configuration to `config.json`:

```json
"exampleNetwork": {
  "config": {
    "minFee": "0",
    "maxFee": "0",
    "owner": "0x0000000000000000000000000000000000000000"
  }
}
```

## Deployment

Deploy contracts using:
```bash
npx hardhat run scripts/deploy.js --network <network-name>
```

## Managing Contract Parameters

After deployment, you can update contract parameters (fees and owner) using the `manage.js` script:

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

**Example:**
```bash
# Update fees on Base mainnet
npx hardhat run scripts/manage.js --network base

# Update fees on Polygon
npx hardhat run scripts/manage.js --network polygon
```

**Note:** Ensure you have `DEPLOYER_KEY` or `MNEMONIC_FILE_PATH` set in your `.env` file, and that the deployer account is the current owner of the contract.

## Verification

After deployment, verify your contract on Etherscan/block explorers:

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