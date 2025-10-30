async function main() {
  const VerifierRegistry = await ethers.getContractFactory('VerifierRegistry');
  const registry = await VerifierRegistry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log('VerifierRegistry deployed:', address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


