const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function main() {
  // Get deployer from environment
  let deployer;
  
  // Option 1: Use private key (recommended)
  if (process.env.DEPLOYER_KEY) {
    [deployer] = await ethers.getSigners();
  }
  // Option 2: Use mnemonic file
  else if (process.env.MNEMONIC_FILE_PATH) {
    const mnemonicModule = require(path.resolve(process.env.MNEMONIC_FILE_PATH));
    const mnemonic = mnemonicModule.mnemonic;
    const wallet = ethers.Wallet.fromPhrase(mnemonic);
    deployer = wallet.connect(ethers.provider);
  } else {
    throw new Error('No deployer credentials found. Set DEPLOYER_KEY or MNEMONIC_FILE_PATH in .env file');
  }

  const net = await ethers.provider.getNetwork();
  const networkName = network.name; // hardhat runtime global `network`

  console.log('Deploying from address:', deployer.address);
  console.log('Network:', networkName, `(chainId ${net.chainId})`);

  // Check deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Deployer balance:', ethers.formatEther(balance), 'ETH');

  if (balance === 0n) {
    throw new Error('Deployer account has no funds. Please fund the account before deploying.');
  }

  // Load per-network fees from scripts/config.json
  const configPath = path.resolve(__dirname, 'config.json');
  let configData = {};
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    configData = raw ? JSON.parse(raw) : {};
  } catch (e) {
    // file may not exist or be empty; handled below if missing
  }

  const primaryKey = (networkName || '').toLowerCase();
  const feesConfig = configData[primaryKey]?.config;

  if (!feesConfig) {
    throw new Error(`Fee config not found for network "${networkName}". Add key "${primaryKey}" to scripts/config.json`);
  }

  const minFee = feesConfig.minFee;
  const maxFee = feesConfig.maxFee;

  console.log('Deploying VerifierRegistry with minFee:', minFee, 'maxFee:', maxFee);

  const VerifierRegistry = await ethers.getContractFactory('VerifierRegistry', deployer);
  const registry = await VerifierRegistry.deploy(deployer.address, BigInt(minFee), BigInt(maxFee));
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log('✅ VerifierRegistry deployed:', address, `on ${networkName} (chainId ${net.chainId})`);

  // Write to constants.json with config
  const constantsPath = path.resolve(__dirname, '..', 'constants.json');
  let data = {};
  try {
    const raw = fs.readFileSync(constantsPath, 'utf8');
    data = raw ? JSON.parse(raw) : {};
  } catch (e) {
    // file may not exist or be empty
  }
  const owner = (await registry.owner()) || '';
  data[networkName] = {
    address,
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    config: {
      minFee,
      maxFee,
      owner: owner
    }
  };
  fs.writeFileSync(constantsPath, JSON.stringify(data, null, 2));
  console.log('✅ Updated constants.json');

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


