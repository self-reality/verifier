<!-- caa4b2c1-be86-4f30-857d-1eca5b48737b 0279e061-8f79-44e9-a140-aa7299909afa -->
# Move to constants.json with Network Config

This plan transitions global and per-network settings to `constants.json` (replacing `addresses.json`) and updates scripts to:

- Use `constants.json` for both contract addresses and on-chain config (minCommission, maxCommission, Owner) per network.
- Add a new `config` object for each `networkName` section with:
- `minCommission` (uint256/string)
- `maxCommission` (uint256/string)
- `Owner` (Ethereum address string)

## Key Implementation Steps

1. **Create/initialize constants.json**

- Duplicate any necessary pre-existing data from addresses.json.
- Add a `config` section for each networkName, mapping to settings as in VerifierRegistry.sol.

2. **Update deploy.js**

- Swap out all usages of addresses.json for constants.json, both reading and writing.
- When writing deployment results, *also* store or update `config` (minCommission, maxCommission, Owner) under that networkName.

3. **Preparation for Scriptable Updates**

- Ensure all future scripts/code will interact with constants.json for config and address reference.

## Implementation Todos

- migrate-constants-json: Rename/copy data from addresses.json to constants.json; add config stub for each network
- update-deploy-script: Use constants.json instead of addresses.json, read/write config per network
- validate-schema: Ensure types/format for minCommission, maxCommission, and Owner match VerifierRegistry.sol usage
- doc-config-structure: Document the new JSON structure and example in README

### To-dos

- [ ] Rename/copy data from addresses.json to constants.json; add config stub for each network
- [ ] Use constants.json instead of addresses.json, read/write config per network
- [ ] Ensure types/format for minCommission, maxCommission, and Owner match VerifierRegistry.sol usage
- [ ] Document the new JSON structure and example in README