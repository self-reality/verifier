const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Brings the deployed VerifierRegistryUSDC in line with scripts/config.json: the price, and the relayer if one is given.
async function main() {
  let signer;

  // Option 0: Use the local deployer-wallet daemon (DEPLOYER_WALLET=1, after `npm link deployer-wallet`)
  if (process.env.DEPLOYER_WALLET) {
    const { connect } = require('deployer-wallet');
    signer = await connect({ provider: ethers.provider });
  }
  // Option 1: Use private key
  else if (process.env.DEPLOYER_KEY) {
    [signer] = await ethers.getSigners();
  }
  // Option 2: Use mnemonic file
  else if (process.env.MNEMONIC_FILE_PATH) {
    const mnemonicModule = require(path.resolve(process.env.MNEMONIC_FILE_PATH));
    signer = ethers.Wallet.fromPhrase(mnemonicModule.mnemonic).connect(ethers.provider);
  } else {
    throw new Error('No credentials found. Set DEPLOYER_WALLET=1, or DEPLOYER_KEY or MNEMONIC_FILE_PATH in .env file');
  }

  const networkName = network.name; // hardhat runtime global `network`
  const configData = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'config.json'), 'utf8'));
  const desired = configData[networkName]?.usdc;
  if (!desired || !desired.price) {
    throw new Error(`USDC config not found for network "${networkName}" in scripts/config.json`);
  }

  const constantsPath = path.resolve(__dirname, '..', 'constants-usdc.json');
  const constantsData = JSON.parse(fs.readFileSync(constantsPath, 'utf8'));
  const deployment = constantsData[networkName];
  if (!deployment || !deployment.address) {
    throw new Error(`No VerifierRegistryUSDC deployment found for network "${networkName}" in constants-usdc.json`);
  }

  const registry = await ethers.getContractAt('VerifierRegistryUSDC', deployment.address, signer);
  console.log('Managing', deployment.address, 'on', networkName, 'from', signer.address);

  const currentPrice = await registry.price();
  console.log('Price: current', currentPrice.toString(), 'desired', desired.price);
  if (currentPrice !== BigInt(desired.price)) {
    const tx = await registry.setPrice(BigInt(desired.price));
    await tx.wait();
    console.log('✅ Price set:', desired.price, `(tx ${tx.hash})`);
    deployment.config.price = desired.price;
  }

  const relayer = process.env.RELAYER_ADDRESS || desired.relayer || '';
  if (relayer && !(await registry.relayers(relayer))) {
    const tx = await registry.setRelayer(relayer, true);
    await tx.wait();
    console.log('✅ Relayer allowed:', relayer, `(tx ${tx.hash})`);
    deployment.config.relayer = relayer;
  }

  fs.writeFileSync(constantsPath, JSON.stringify(constantsData, null, 2));
  console.log('✅ constants-usdc.json is up to date');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
