const fs = require('fs');
const path = require('path');

async function main() {
  const VerifierRegistry = await ethers.getContractFactory('VerifierRegistry');
  const registry = await VerifierRegistry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  const net = await ethers.provider.getNetwork();
  const networkName = network.name || `chain-${net.chainId}`; // hardhat runtime global `network`

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
  const minCommission = "2500000000000"; // as string, matches VerifierRegistry.sol default
  const maxCommission = "1300000000000000";
  const owner = (await registry.owner()) || '';
  data[networkName] = {
    address,
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    config: {
      minCommission,
      maxCommission,
      owner: owner
    }
  };
  fs.writeFileSync(constantsPath, JSON.stringify(data, null, 2));

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


