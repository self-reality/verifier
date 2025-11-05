const { expect } = require('chai');

describe('Gas Estimation for Anchor Functions', function () {
  async function deploy(owner) {
    const VerifierRegistry = await ethers.getContractFactory('VerifierRegistry');
    const minFee = 2_500_000_000_000n; // 0.0000025 ether
    const maxFee = 1_300_000_000_000_000n; // 0.0013 ether
    const registry = await VerifierRegistry.deploy(owner, minFee, maxFee);
    await registry.waitForDeployment();
    return registry;
  }

  const validCid = 'bafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta';
  const validFilename = 'document.pdf';
  const validValue = ethers.parseEther('0.001');

  describe('anchor() - with full validation', function () {
    it('estimates gas cost for anchor with validation', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      const tx = await registry.anchor(validCid, validFilename, { value: validValue });
      const receipt = await tx.wait();

      console.log('      anchor() gas used:', receipt.gasUsed.toString());
      expect(Number(receipt.gasUsed)).to.be.lessThan(150000);
    });

    it('verifies event emission', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      const tx = await registry.anchor(validCid, validFilename, { value: validValue });
      const receipt = await tx.wait();

      const event = receipt.logs.find((l) => l.fragment && l.fragment.name === 'Anchored');
      expect(event).to.not.be.undefined;
      expect(event.args.submitter).to.equal(owner.address);
      // Note: indexed string parameters are hashed in events, so we can't compare them directly
      expect(event.args.timestamp).to.be.a('bigint');
      expect(event.args.paid).to.equal(validValue);
    });
  });

  describe('anchorNoValidation() - no validation', function () {
    it('estimates gas cost for anchor without validation', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      const tx = await registry.anchorNoValidation(validCid, validFilename, { value: validValue });
      const receipt = await tx.wait();

      console.log('      anchorNoValidation() gas used:', receipt.gasUsed.toString());
      expect(Number(receipt.gasUsed)).to.be.lessThan(100000);
    });

    it('accepts invalid CID (no validation)', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      const invalidCid = 'invalid-cid-123';
      await expect(registry.anchorNoValidation(invalidCid, validFilename, { value: validValue })).to.not.be.reverted;
    });

    it('accepts invalid filename (no validation)', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      const invalidFilename = 'UPPERCASE AND SPACES.PDF';
      await expect(registry.anchorNoValidation(validCid, invalidFilename, { value: validValue })).to.not.be.reverted;
    });

    it('verifies event emission', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      const tx = await registry.anchorNoValidation(validCid, validFilename, { value: validValue });
      const receipt = await tx.wait();

      const event = receipt.logs.find((l) => l.fragment && l.fragment.name === 'AnchoredNoValidation');
      expect(event).to.not.be.undefined;
      expect(event.args.submitter).to.equal(owner.address);
      // Note: indexed string parameters are hashed in events
      expect(event.args.timestamp).to.be.a('bigint');
      expect(event.args.paid).to.equal(validValue);
    });
  });

  describe('anchorCidOnly() - CID only, no validation', function () {
    it('estimates gas cost for CID-only anchor', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      const tx = await registry.anchorCidOnly(validCid, { value: validValue });
      const receipt = await tx.wait();

      console.log('      anchorCidOnly() gas used:', receipt.gasUsed.toString());
      expect(Number(receipt.gasUsed)).to.be.lessThan(80000);
    });

    it('accepts any string as CID', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      await expect(registry.anchorCidOnly('any-string-works', { value: validValue })).to.not.be.reverted;
      await expect(registry.anchorCidOnly('', { value: validValue })).to.not.be.reverted;
      await expect(registry.anchorCidOnly('x'.repeat(1000), { value: validValue })).to.not.be.reverted;
    });

    it('verifies event emission', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      const tx = await registry.anchorCidOnly(validCid, { value: validValue });
      const receipt = await tx.wait();

      const event = receipt.logs.find((l) => l.fragment && l.fragment.name === 'AnchoredCidOnly');
      expect(event).to.not.be.undefined;
      expect(event.args.submitter).to.equal(owner.address);
      // Note: indexed string parameters are hashed in events
      expect(event.args.timestamp).to.be.a('bigint');
      expect(event.args.paid).to.equal(validValue);
    });

    it('estimates gas with mock SHA-256 hash as hex string', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      // Mock SHA-256 hash (64 hex characters = 32 bytes)
      const sha256Hash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
      
      const tx = await registry.anchorCidOnly(sha256Hash, { value: validValue });
      const receipt = await tx.wait();

      console.log('      anchorCidOnly() with SHA-256 hash gas used:', receipt.gasUsed.toString());
      expect(Number(receipt.gasUsed)).to.be.lessThan(80000);

      const event = receipt.logs.find((l) => l.fragment && l.fragment.name === 'AnchoredCidOnly');
      expect(event).to.not.be.undefined;
      expect(event.args.submitter).to.equal(owner.address);
      // Note: indexed string parameters are hashed in events
      expect(event.args.timestamp).to.be.a('bigint');
    });

    it('estimates gas with 0x-prefixed SHA-256 hash', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      // SHA-256 hash with 0x prefix (common format)
      const sha256Hash = '0xa665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
      
      const tx = await registry.anchorCidOnly(sha256Hash, { value: validValue });
      const receipt = await tx.wait();

      console.log('      anchorCidOnly() with 0x-prefixed SHA-256 hash gas used:', receipt.gasUsed.toString());
      expect(Number(receipt.gasUsed)).to.be.lessThan(80000);
    });
  });

  describe('anchorBytes32() - optimized bytes32 hash', function () {
    it('estimates gas cost for bytes32 anchor', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      const hash = ethers.keccak256(ethers.toUtf8Bytes('test data'));
      
      const tx = await registry.anchorBytes32(hash, { value: validValue });
      const receipt = await tx.wait();

      console.log('      anchorBytes32() gas used:', receipt.gasUsed.toString());
      expect(Number(receipt.gasUsed)).to.be.lessThan(60000);
    });

    it('estimates gas with mock SHA-256 hash', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      // Mock SHA-256 hash as bytes32
      const sha256Hash = '0xa665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
      
      const tx = await registry.anchorBytes32(sha256Hash, { value: validValue });
      const receipt = await tx.wait();

      console.log('      anchorBytes32() with SHA-256 hash gas used:', receipt.gasUsed.toString());
      expect(Number(receipt.gasUsed)).to.be.lessThan(60000);

      const event = receipt.logs.find((l) => l.fragment && l.fragment.name === 'AnchoredBytes32');
      expect(event).to.not.be.undefined;
      expect(event.args.hash).to.equal(sha256Hash);
    });

    it('verifies event emission', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      const hash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      
      const tx = await registry.anchorBytes32(hash, { value: validValue });
      const receipt = await tx.wait();

      const event = receipt.logs.find((l) => l.fragment && l.fragment.name === 'AnchoredBytes32');
      expect(event).to.not.be.undefined;
      expect(event.args.submitter).to.equal(owner.address);
      expect(event.args.hash).to.equal(hash);
    });

    it('accepts any bytes32 value', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      const zeroHash = ethers.ZeroHash;
      await expect(registry.anchorBytes32(zeroHash, { value: validValue })).to.not.be.reverted;

      const maxHash = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      await expect(registry.anchorBytes32(maxHash, { value: validValue })).to.not.be.reverted;
    });
  });

  describe('Comparison tests', function () {
    it('compares gas costs across all functions', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      // Test all functions and collect gas usage
      const results = [];

      const tx1 = await registry.anchor(validCid, validFilename, { value: validValue });
      const receipt1 = await tx1.wait();
      results.push({ name: 'anchor()', gas: receipt1.gasUsed });

      const tx2 = await registry.anchorNoValidation(validCid, validFilename, { value: validValue });
      const receipt2 = await tx2.wait();
      results.push({ name: 'anchorNoValidation()', gas: receipt2.gasUsed });

      const tx3 = await registry.anchorCidOnly(validCid, { value: validValue });
      const receipt3 = await tx3.wait();
      results.push({ name: 'anchorCidOnly()', gas: receipt3.gasUsed });

      const hash = ethers.keccak256(ethers.toUtf8Bytes('test'));
      const tx4 = await registry.anchorBytes32(hash, { value: validValue });
      const receipt4 = await tx4.wait();
      results.push({ name: 'anchorBytes32()', gas: receipt4.gasUsed });

      console.log('\n      === Gas Comparison ===');
      results.forEach(r => console.log(`      ${r.name.padEnd(25)} ${r.gas.toString().padStart(8)} gas`));
      
      // Calculate savings
      const baseGas = Number(results[0].gas);
      console.log('\n      === Savings vs anchor() ===');
      results.slice(1).forEach(r => {
        const savings = baseGas - Number(r.gas);
        const percent = ((savings / baseGas) * 100).toFixed(2);
        console.log(`      ${r.name.padEnd(25)} -${savings.toString().padStart(6)} gas (${percent}%)`);
      });

      // Verify bytes32 is most efficient
      expect(Number(results[3].gas)).to.be.lessThan(Number(results[2].gas));
      expect(Number(results[2].gas)).to.be.lessThan(Number(results[1].gas));
      expect(Number(results[1].gas)).to.be.lessThan(Number(results[0].gas));
    });
  });

  describe('Fee enforcement across all functions', function () {
    it('enforces fee range on all anchor functions', async function () {
      const [owner] = await ethers.getSigners();
      const registry = await deploy(owner.address);

      const tooLow = 1_000_000_000_000n; // Below minFee
      const tooHigh = 2_000_000_000_000_000n; // Above maxFee
      const hash = ethers.keccak256(ethers.toUtf8Bytes('test'));

      // All functions should enforce fee range
      await expect(registry.anchor(validCid, validFilename, { value: tooLow })).to.be.revertedWith('fee not met');
      await expect(registry.anchor(validCid, validFilename, { value: tooHigh })).to.be.revertedWith('fee not met');

      await expect(registry.anchorNoValidation(validCid, validFilename, { value: tooLow })).to.be.revertedWith('fee not met');
      await expect(registry.anchorNoValidation(validCid, validFilename, { value: tooHigh })).to.be.revertedWith('fee not met');

      await expect(registry.anchorCidOnly(validCid, { value: tooLow })).to.be.revertedWith('fee not met');
      await expect(registry.anchorCidOnly(validCid, { value: tooHigh })).to.be.revertedWith('fee not met');

      await expect(registry.anchorBytes32(hash, { value: tooLow })).to.be.revertedWith('fee not met');
      await expect(registry.anchorBytes32(hash, { value: tooHigh })).to.be.revertedWith('fee not met');
    });
  });
});

