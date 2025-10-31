const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const networkName = network.name; // hardhat runtime global `network`

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

  const VerifierRegistry = await ethers.getContractFactory('VerifierRegistry');
  const registry = await VerifierRegistry.deploy(deployer.address, BigInt(minFee), BigInt(maxFee));
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log('VerifierRegistry deployed:', address, `on ${networkName} (chainId ${net.chainId})`);

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

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


