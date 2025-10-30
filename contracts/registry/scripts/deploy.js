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

  // Write to addresses.json
  const addressesPath = path.resolve(__dirname, '..', 'addresses.json');
  let data = {};
  try {
    const raw = fs.readFileSync(addressesPath, 'utf8');
    data = raw ? JSON.parse(raw) : {};
  } catch (e) {
    // file may not exist or be empty
  }
  data[networkName] = {
    address,
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(addressesPath, JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


