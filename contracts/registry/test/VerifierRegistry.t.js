const { expect } = require('chai');

describe('VerifierRegistry', function () {
  it('anchors an entry', async function () {
    const VerifierRegistry = await ethers.getContractFactory('VerifierRegistry');
    const registry = await VerifierRegistry.deploy();
    await registry.waitForDeployment();

    const tx = await registry.anchor('cid123', 'file.pdf');
    await tx.wait();

    const len = await registry.entriesLength();
    expect(len).to.equal(1n);
  });
});


