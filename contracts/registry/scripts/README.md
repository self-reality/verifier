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