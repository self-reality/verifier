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

    const tx = await registry.anchor('bafyCid123', 'doc.pdf');
    const receipt = await tx.wait();

    const len = await registry.entriesLength();
    expect(len).to.equal(1n);

    // event assertion
    const event = receipt.logs.find((l) => l.fragment && l.fragment.name === 'Anchored');
    expect(event).to.not.be.undefined;
    expect(event.args.submitter).to.equal(await sender.getAddress());
    expect(event.args.cid).to.equal('bafyCid123');
    expect(event.args.filename).to.equal('doc.pdf');
    expect(event.args.timestamp).to.be.a('bigint');
  });

  it('readback returns stored values', async function () {
    const registry = await deploy();
    await (await registry.anchor('bafyCidXYZ', 'file-1.txt')).wait();

    const entry = await registry.entries(0);
    expect(entry.cid).to.equal('bafyCidXYZ');
    expect(entry.filename).to.equal('file-1.txt');
    expect(entry.submitter).to.be.a('string');
    expect(entry.timestamp).to.be.a('bigint');
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

  it('gas usage is within expected bound', async function () {
    const registry = await deploy();
    const tx = await registry.anchor('bafyCidGas', 'file_2.pdf');
    const receipt = await tx.wait();
    // crude bound check; adjust as needed if optimizer settings change
    expect(Number(receipt.gasUsed)).to.be.lessThan(150000);
  });
});


