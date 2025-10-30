const { expect } = require('chai');

describe('VerifierRegistry', function () {
  async function deploy() {
    const VerifierRegistry = await ethers.getContractFactory('VerifierRegistry');
    const registry = await VerifierRegistry.deploy();
    await registry.waitForDeployment();
    return registry;
  }

  it('anchors an entry and emits event', async function () {
    const [sender] = await ethers.getSigners();
    const registry = await deploy();

    const tx = await registry.anchor('bafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta', 'doc.pdf');
    const receipt = await tx.wait();

    // event assertion
    const event = receipt.logs.find((l) => l.fragment && l.fragment.name === 'Anchored');
    expect(event).to.not.be.undefined;
    expect(event.args.submitter).to.equal(await sender.getAddress());
    expect(event.args.cid).to.equal('bafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta');
    expect(event.args.filename).to.equal('doc.pdf');
    expect(event.args.timestamp).to.be.a('bigint');
  });

  it('rejects invalid filenames (empty, too long, bad chars, tilde, uppercase, space, bad ends)', async function () {
    const registry = await deploy();
    // empty
    await expect(registry.anchor('cid', '')).to.be.revertedWith('filename empty');
    // too long (129 chars)
    const longName = 'a'.repeat(129) + '.pdf';
    await expect(registry.anchor('cid', longName)).to.be.revertedWith('filename too long');
    // tilde
    await expect(registry.anchor('cid', 'bad~name.pdf')).to.be.revertedWith('filename invalid char');
    // uppercase
    await expect(registry.anchor('cid', 'Bad.pdf')).to.be.revertedWith('filename invalid char');
    // space
    await expect(registry.anchor('cid', 'bad name.pdf')).to.be.revertedWith('filename invalid char');
    // leading '-'
    await expect(registry.anchor('cid', '-bad.pdf')).to.be.revertedWith('filename bad start');
    // trailing '.'
    await expect(registry.anchor('cid', 'bad.')).to.be.revertedWith('filename bad end');
  });

  it('accepts valid CIDv1 base32 string', async function () {
    const registry = await deploy();
    const validCid = 'bafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta'; // 59 chars, lowercase, begins with 'bafy'
    await expect(registry.anchor(validCid, 'good.pdf')).to.not.be.reverted;
  });

  it('rejects CIDv1 not starting with bafy', async function () {
    const registry = await deploy();
    const badCid = 'cafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta';
    await expect(registry.anchor(badCid, 'good.pdf')).to.be.revertedWith('cidv1: bad prefix');
  });

  it('rejects CIDv1 with invalid length', async function () {
    const registry = await deploy();
    await expect(registry.anchor('bafy', 'good.pdf')).to.be.revertedWith('cidv1: bad length');
    await expect(registry.anchor('bafy' + 'a'.repeat(70), 'good.pdf')).to.be.revertedWith('cidv1: bad length');
  });

  it('rejects CIDv1 with invalid chars', async function () {
    const registry = await deploy();
    const invalid = 'bafybEigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta'; // contains uppercase E
    await expect(registry.anchor(invalid, 'good.pdf')).to.be.revertedWith('cidv1: invalid char');
    const plusInvalid = 'bafybeig+yrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta'; // contains plus
    await expect(registry.anchor(plusInvalid, 'good.pdf')).to.be.revertedWith('cidv1: invalid char');
    const digitInvalid = 'bafybeigdyrz1c3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta'; // contains 1 (only 2-7 allowed)
    await expect(registry.anchor(digitInvalid, 'good.pdf')).to.be.revertedWith('cidv1: invalid char');
  });

  it('gas usage is within expected bound', async function () {
    const registry = await deploy();
    const tx = await registry.anchor('bafybeigdyrztc3jwlkzc6cnnk3xjqdtfq547lfupgkhb2yyfpyz5wsttta', 'file_2.pdf');
    const receipt = await tx.wait();
    // crude bound check; adjust as needed if optimizer settings change
    expect(Number(receipt.gasUsed)).to.be.lessThan(150000);
  });
});


