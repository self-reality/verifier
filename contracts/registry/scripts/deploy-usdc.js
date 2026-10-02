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

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Deployer balance:', ethers.formatEther(balance), 'ETH');

  if (balance === 0n) {
    throw new Error('Deployer account has no funds. Please fund the account before deploying.');
  }

  // Load the token address and price from scripts/config.json
  const configPath = path.resolve(__dirname, 'config.json');
  const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const usdcConfig = configData[networkName]?.usdc;

  if (!usdcConfig || !usdcConfig.token || !usdcConfig.price) {
    throw new Error(`USDC config not found for network "${networkName}". Add "usdc": { "token", "price" } under "${networkName}" in scripts/config.json`);
  }

  const token = usdcConfig.token;
  const price = usdcConfig.price;
  // The wallet the anchor worker sends transactions from
  const relayer = process.env.RELAYER_ADDRESS || usdcConfig.relayer || '';

  console.log('Deploying VerifierRegistryUSDC with token:', token, 'price:', price);

  const Registry = await ethers.getContractFactory('VerifierRegistryUSDC', deployer);
  const registry = await Registry.deploy(deployer.address, token, BigInt(price));
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log('✅ VerifierRegistryUSDC deployed:', address, `on ${networkName} (chainId ${net.chainId})`);

  if (relayer) {
    const tx = await registry.setRelayer(relayer, true);
    await tx.wait();
    console.log('✅ Relayer allowed:', relayer);
  } else {
    console.log('⚠️  No relayer set. Set RELAYER_ADDRESS or call setRelayer(address, true) before starting the worker.');
  }

  // Write to constants-usdc.json
  const constantsPath = path.resolve(__dirname, '..', 'constants-usdc.json');
  let data = {};
  try {
    const raw = fs.readFileSync(constantsPath, 'utf8');
    data = raw ? JSON.parse(raw) : {};
  } catch (e) {
    // file may not exist or be empty
  }
  data[networkName] = {
    address,
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    config: {
      token,
      price,
      relayer,
      owner: deployer.address
    }
  };
  fs.writeFileSync(constantsPath, JSON.stringify(data, null, 2));
  console.log('✅ Updated constants-usdc.json');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
