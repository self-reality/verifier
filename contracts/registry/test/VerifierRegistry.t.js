const { expect } = require('chai');

describe('VerifierRegistry', function () {
  async function deploy(owner) {
    const VerifierRegistry = await ethers.getContractFactory('VerifierRegistry');
    const minFee = 2_500_000_000_000n; // 0.0000025 ether
    const maxFee = 1_300_000_000_000_000n; // 0.0013 ether
    const registry = await VerifierRegistry.deploy(owner, minFee, maxFee);
    await registry.waitForDeployment();
    return registry;
  }

  it('anchors an entry and emits event', async function () {
    const [sender] = await ethers.getSigners();
    const registry = await deploy(sender.address);

    // Use value within new fee range
    const tx = await registry.anchor('bafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta', 'doc.pdf', { value: ethers.parseEther('0.001') });
    const receipt = await tx.wait();

    // event assertion
    const event = receipt.logs.find((l) => l.fragment && l.fragment.name === 'Anchored');
    expect(event).to.not.be.undefined;
    expect(event.args.submitter).to.equal(await sender.getAddress());
    // Note: indexed string parameters are hashed in events, so we can't compare them directly
    expect(event.args.timestamp).to.be.a('bigint');
    expect(event.args.paid).to.equal(ethers.parseEther('0.001'));
  });

  it('accepts any CID and filename format (no validation)', async function () {
    const [owner] = await ethers.getSigners();
    const registry = await deploy(owner.address);
    const validValue = ethers.parseEther('0.001');
    
    // Should accept any format now
    await expect(registry.anchor('any-cid-format', 'Any File Name.PDF', { value: validValue })).to.not.be.reverted;
    await expect(registry.anchor('cafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta', 'Bad.pdf', { value: validValue })).to.not.be.reverted;
    await expect(registry.anchor('short', '', { value: validValue })).to.not.be.reverted;
    await expect(registry.anchor('', 'file with ~special chars!.pdf', { value: validValue })).to.not.be.reverted;
  });

  it('gas usage is within expected bound', async function () {
    const [owner] = await ethers.getSigners();
    const registry = await deploy(owner.address);
    const tx = await registry.anchor('bafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta', 'file_2.pdf', { value: ethers.parseEther('0.001') });
    const receipt = await tx.wait();
    // Gas usage should be lower without validation
    expect(Number(receipt.gasUsed)).to.be.lessThan(100000);
  });

  it('allows only owner to set fees', async function () {
    const [owner, user, recipient] = await ethers.getSigners();
    const registry = await deploy(owner.address);

    // Only owner can set
    await expect(registry.connect(user).setFeeRange(500_000_000_000_0n, 2_000_000_000_000_000n)).to.be.reverted;
    await expect(registry.setFeeRange(500_000_000_000_0n, 2_000_000_000_000_000n)).to.not.be.reverted; // 0.000005 to 0.002 ether
  });

  it('rejects out-of-bounds and enforces fee range', async function () {
    const [owner, user, recipient] = await ethers.getSigners();
    const registry = await deploy(owner.address);

    // min > max should revert
    await expect(registry.setFeeRange(2_000_000_000_000n, 1_000_000_000_000n)).to.be.revertedWith('fee bounds: min > max');

    // set a valid range
    await registry.setFeeRange(2_500_000_000_000n, 2_000_000_000_000_000n); // 0.0000025 to 0.002 ether

    // Enforces min/max on anchor
    await expect(registry.anchor('bafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta', 'doc.pdf', { value: 2_000_000_000_000n })).to.be.revertedWith('fee not met'); // too low (0.000002 ether)
    await expect(registry.anchor('bafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta', 'doc.pdf', { value: 3_000_000_000_000_000n })).to.be.revertedWith('fee not met'); // too high (0.003 ether)
    await expect(registry.anchor('bafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta', 'doc.pdf', { value: ethers.parseEther('0.001') })).to.not.be.reverted; // valid value
  });

  it('withdraws accumulated fee to owner', async function () {
    const [owner, user] = await ethers.getSigners();
    const registry = await deploy(owner.address);
    // User anchors with payment in new range
    await registry.connect(user).anchor('bafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta', 'doc.pdf', { value: ethers.parseEther('0.001') });
    // Contract should have balance
    const bal = await ethers.provider.getBalance(registry.target);
    expect(bal).to.equal(ethers.parseEther('0.001'));
    // Withdraw to owner
    const before = await ethers.provider.getBalance(owner.address);
    const tx = await registry.withdrawFees(owner.address);
    const receipt = await tx.wait();
    const after = await ethers.provider.getBalance(owner.address);
    expect(after).to.be.above(before);
    expect(await ethers.provider.getBalance(registry.target)).to.equal(0n);
  });
});


