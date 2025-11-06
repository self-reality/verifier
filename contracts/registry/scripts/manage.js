const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

// Helper function to prompt user for confirmation
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim() === 'yes' || answer.toLowerCase().trim() === 'y');
    });
  });
}

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

  console.log('Managing contract from address:', deployer.address);
  console.log('Network:', networkName, `(chainId ${net.chainId})`);
  console.log('');

  // Load deployed contract address from constants.json
  const constantsPath = path.resolve(__dirname, '..', 'constants.json');
  let constantsData = {};
  try {
    const raw = fs.readFileSync(constantsPath, 'utf8');
    constantsData = raw ? JSON.parse(raw) : {};
  } catch (e) {
    throw new Error(`Failed to read constants.json: ${e.message}`);
  }

  const deploymentInfo = constantsData[networkName];
  if (!deploymentInfo || !deploymentInfo.address) {
    throw new Error(`No deployment found for network "${networkName}" in constants.json`);
  }

  const contractAddress = deploymentInfo.address;
  console.log('Contract address:', contractAddress);
  console.log('');

  // Load desired config from config.json
  const configPath = path.resolve(__dirname, 'config.json');
  let configData = {};
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    configData = raw ? JSON.parse(raw) : {};
  } catch (e) {
    throw new Error(`Failed to read config.json: ${e.message}`);
  }

  const primaryKey = (networkName || '').toLowerCase();
  const desiredConfig = configData[primaryKey]?.config;

  if (!desiredConfig) {
    throw new Error(`Config not found for network "${networkName}". Add key "${primaryKey}" to scripts/config.json`);
  }

  const desiredMinFee = BigInt(desiredConfig.minFee || '0');
  const desiredMaxFee = BigInt(desiredConfig.maxFee || '0');
  const desiredOwner = desiredConfig.owner || null;

  // Connect to deployed contract
  const VerifierRegistry = await ethers.getContractFactory('VerifierRegistry', deployer);
  const registry = VerifierRegistry.attach(contractAddress);

  // Read current values from contract
  console.log('Reading current contract values...');
  const currentMinFee = await registry.minFee();
  const currentMaxFee = await registry.maxFee();
  const currentOwner = await registry.owner();

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('                  CURRENT VALUES                       ');
  console.log('═══════════════════════════════════════════════════════');
  console.log('minFee:', currentMinFee.toString(), `(${ethers.formatEther(currentMinFee)} ETH)`);
  console.log('maxFee:', currentMaxFee.toString(), `(${ethers.formatEther(currentMaxFee)} ETH)`);
  console.log('owner: ', currentOwner);
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('                  DESIRED VALUES                       ');
  console.log('═══════════════════════════════════════════════════════');
  console.log('minFee:', desiredMinFee.toString(), `(${ethers.formatEther(desiredMinFee)} ETH)`);
  console.log('maxFee:', desiredMaxFee.toString(), `(${ethers.formatEther(desiredMaxFee)} ETH)`);
  console.log('owner: ', desiredOwner || '(not specified in config)');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Check if changes are needed
  const needFeeUpdate = currentMinFee !== desiredMinFee || currentMaxFee !== desiredMaxFee;
  const needOwnerUpdate = desiredOwner && currentOwner.toLowerCase() !== desiredOwner.toLowerCase();

  if (!needFeeUpdate && !needOwnerUpdate) {
    console.log('✅ Contract values already match config. No changes needed.');
    return;
  }

  // Show what will be changed
  console.log('CHANGES TO BE MADE:');
  if (needFeeUpdate) {
    console.log('  • Update fee range:');
    console.log(`    - minFee: ${currentMinFee.toString()} → ${desiredMinFee.toString()}`);
    console.log(`    - maxFee: ${currentMaxFee.toString()} → ${desiredMaxFee.toString()}`);
  }
  if (needOwnerUpdate) {
    console.log('  • Transfer ownership:');
    console.log(`    - from: ${currentOwner}`);
    console.log(`    - to:   ${desiredOwner}`);
  }
  console.log('');

  // Get confirmation
  const confirmed = await prompt('Do you want to proceed with these changes? (yes/no): ');

  if (!confirmed) {
    console.log('❌ Operation cancelled by user.');
    return;
  }

  console.log('');
  console.log('Proceeding with updates...');
  console.log('');

  let feeUpdated = false;
  let ownerUpdated = false;

  // Execute fee update if needed
  if (needFeeUpdate) {
    console.log('📤 Sending transaction to update fee range...');
    try {
      const tx = await registry.setFeeRange(desiredMinFee, desiredMaxFee);
      console.log('   Transaction hash:', tx.hash);
      console.log('   Waiting for confirmation...');
      const receipt = await tx.wait();
      console.log('   ✅ Fee range updated successfully!');
      console.log('   Gas used:', receipt.gasUsed.toString());
      console.log('');
      feeUpdated = true;
    } catch (error) {
      console.error('   ❌ Failed to update fee range:', error.message);
      throw error;
    }
  }

  // Execute owner transfer if needed
  if (needOwnerUpdate) {
    console.log('📤 Sending transaction to transfer ownership...');
    console.log('   ⚠️  WARNING: This will transfer ownership to:', desiredOwner);
    console.log('   ⚠️  You will no longer be able to manage the contract from this address!');
    console.log('');
    
    const ownerConfirmed = await prompt('Are you ABSOLUTELY SURE you want to transfer ownership? (yes/no): ');
    
    if (!ownerConfirmed) {
      console.log('❌ Ownership transfer cancelled.');
    } else {
      try {
        const tx = await registry.transferOwnership(desiredOwner);
        console.log('   Transaction hash:', tx.hash);
        console.log('   Waiting for confirmation...');
        const receipt = await tx.wait();
        console.log('   ✅ Ownership transferred successfully!');
        console.log('   Gas used:', receipt.gasUsed.toString());
        console.log('');
        ownerUpdated = true;
      } catch (error) {
        console.error('   ❌ Failed to transfer ownership:', error.message);
        throw error;
      }
    }
  }

  // Update constants.json with actual current values from contract
  if (feeUpdated || ownerUpdated) {
    console.log('Updating constants.json with current on-chain values...');
    
    // Read actual current values from contract to ensure accuracy
    const finalMinFee = await registry.minFee();
    const finalMaxFee = await registry.maxFee();
    const finalOwner = await registry.owner();
    
    constantsData[networkName].config = {
      minFee: finalMinFee.toString(),
      maxFee: finalMaxFee.toString(),
      owner: finalOwner
    };
    fs.writeFileSync(constantsPath, JSON.stringify(constantsData, null, 2));
    console.log('✅ constants.json updated with on-chain values');
    console.log('');
  }
  
  console.log('════════════════════════════════════════════════════════');
  if (feeUpdated || ownerUpdated) {
    console.log('✅ All operations completed successfully!');
  } else {
    console.log('ℹ️  No changes were made to the contract.');
  }
  console.log('════════════════════════════════════════════════════════');
}

main().catch((error) => {
  console.error('');
  console.error('════════════════════════════════════════════════════════');
  console.error('❌ ERROR:', error.message);
  console.error('════════════════════════════════════════════════════════');
  process.exitCode = 1;
});

