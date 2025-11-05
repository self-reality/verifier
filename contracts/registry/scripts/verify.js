const fs = require('fs');
const path = require('path');

async function main() {
  // Get network name from Hardhat runtime
  const networkName = network.name;
  
  console.log('Verifying contract on network:', networkName);

  // Read constants.json to get deployment info
  const constantsPath = path.resolve(__dirname, '..', 'constants.json');
  let data = {};
  try {
    const raw = fs.readFileSync(constantsPath, 'utf8');
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to read constants.json: ${e.message}`);
  }

  const deploymentInfo = data[networkName];
  if (!deploymentInfo) {
    throw new Error(`No deployment found for network "${networkName}" in constants.json`);
  }

  const contractAddress = deploymentInfo.address;
  const config = deploymentInfo.config;

  if (!config) {
    throw new Error(`No config found for network "${networkName}" in constants.json`);
  }

  const owner = config.owner;
  const minFee = config.minFee;
  const maxFee = config.maxFee;

  console.log('Contract address:', contractAddress);
  console.log('Constructor arguments:');
  console.log('  - owner:', owner);
  console.log('  - minFee:', minFee);
  console.log('  - maxFee:', maxFee);

  // Verify the contract
  console.log('\nVerifying contract on Etherscan/Basescan...');
  
  try {
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: [
        owner,
        minFee,
        maxFee
      ],
    });
    console.log('✅ Contract verified successfully!');
  } catch (error) {
    if (error.message.includes('Already Verified')) {
      console.log('✅ Contract already verified!');
    } else {
      console.error('❌ Verification failed:', error.message);
      throw error;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

