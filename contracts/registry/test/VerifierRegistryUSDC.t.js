const { expect } = require('chai');

describe('VerifierRegistryUSDC', function () {
  const PRICE = 500_000n; // 0.50 USDC
  const HASH = 'be44340d151cbfa7a5dc59b579dd6632fb0891b573f8fdc927264309a3b168f0';
  const FILENAME = 'report.pdf';

  const TYPES = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };

  async function deploy() {
    const [owner, payer, relayer, stranger] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();
    const Registry = await ethers.getContractFactory('VerifierRegistryUSDC');
    const registry = await Registry.deploy(owner.address, usdc.target, PRICE);
    await registry.waitForDeployment();
    await registry.setRelayer(relayer.address, true);
    await usdc.mint(payer.address, 10_000_000n);
    return { owner, payer, relayer, stranger, usdc, registry };
  }

  // Sign the authorization an x402 client would sign: a transfer from the payer to `to`
  async function authorize(usdc, signer, to, value, overrides = {}) {
    const { chainId } = await ethers.provider.getNetwork();
    const domain = { name: 'USD Coin', version: '2', chainId, verifyingContract: usdc.target };
    const message = {
      from: signer.address,
      to,
      value,
      validAfter: 0n,
      validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
      nonce: ethers.hexlify(ethers.randomBytes(32)),
      ...overrides,
    };
    const signature = await signer.signTypedData(domain, TYPES, message);
    return { ...message, signature };
  }

  const toAuth = (a) => ({
    from: a.from,
    value: a.value,
    validAfter: a.validAfter,
    validBefore: a.validBefore,
    nonce: a.nonce,
    signature: a.signature,
  });

  function anchoredEvent(receipt, registry) {
    return receipt.logs.find((l) => l.address === registry.target && l.fragment && l.fragment.name === 'Anchored');
  }

  it('relayer anchors with a payer authorization: payment and event in one transaction', async function () {
    const { payer, relayer, usdc, registry } = await deploy();
    const a = await authorize(usdc, payer, registry.target, PRICE);

    const tx = await registry.connect(relayer).anchorWithAuthorization(HASH, FILENAME, toAuth(a));
    const receipt = await tx.wait();

    const event = anchoredEvent(receipt, registry);
    expect(event.args.cid).to.equal(HASH);
    expect(event.args.filename).to.equal(FILENAME);
    expect(event.args.submitter).to.equal(payer.address);
    expect(event.args.paid).to.equal(PRICE);
    expect(await usdc.balanceOf(registry.target)).to.equal(PRICE);
    expect(await usdc.balanceOf(payer.address)).to.equal(10_000_000n - PRICE);
    expect(await registry.settled(payer.address, a.nonce)).to.equal(true);
    console.log('      anchorWithAuthorization() gas used:', receipt.gasUsed.toString());
  });

  it('emits the same event signature as VerifierRegistry', async function () {
    const { owner, payer, relayer, usdc, registry } = await deploy();
    const Legacy = await ethers.getContractFactory('VerifierRegistry');
    const legacy = await Legacy.deploy(owner.address, 0n, 10n ** 18n);
    const a = await authorize(usdc, payer, registry.target, PRICE);
    const receipt = await (await registry.connect(relayer).anchorWithAuthorization(HASH, FILENAME, toAuth(a))).wait();
    const event = anchoredEvent(receipt, registry);
    expect(event.topics[0]).to.equal(legacy.interface.getEvent('Anchored').topicHash);
    expect(event.topics[1]).to.equal(ethers.keccak256(ethers.toUtf8Bytes(HASH)));
  });

  it('payer can submit its own authorization', async function () {
    const { payer, usdc, registry } = await deploy();
    const a = await authorize(usdc, payer, registry.target, PRICE);
    await expect(registry.connect(payer).anchorWithAuthorization(HASH, FILENAME, toAuth(a))).to.emit(registry, 'Anchored');
  });

  it('rejects a stranger pairing a hash with someone else\'s authorization', async function () {
    const { payer, stranger, usdc, registry } = await deploy();
    const a = await authorize(usdc, payer, registry.target, PRICE);
    await expect(registry.connect(stranger).anchorWithAuthorization('other-hash', FILENAME, toAuth(a))).to.be.revertedWith('not payer or relayer');
  });

  it('rejects an authorization below the price', async function () {
    const { payer, relayer, usdc, registry } = await deploy();
    const a = await authorize(usdc, payer, registry.target, PRICE - 1n);
    await expect(registry.connect(relayer).anchorWithAuthorization(HASH, FILENAME, toAuth(a))).to.be.revertedWith('price not met');
  });

  it('rejects an authorization addressed to another recipient', async function () {
    const { payer, relayer, stranger, usdc, registry } = await deploy();
    const a = await authorize(usdc, payer, stranger.address, PRICE);
    await expect(registry.connect(relayer).anchorWithAuthorization(HASH, FILENAME, toAuth(a))).to.be.revertedWith('FiatTokenV2: invalid signature');
    expect(await usdc.balanceOf(registry.target)).to.equal(0n);
  });

  it('rejects a replayed authorization', async function () {
    const { payer, relayer, usdc, registry } = await deploy();
    const a = await authorize(usdc, payer, registry.target, PRICE);
    await registry.connect(relayer).anchorWithAuthorization(HASH, FILENAME, toAuth(a));
    await expect(registry.connect(relayer).anchorWithAuthorization(HASH, FILENAME, toAuth(a))).to.be.revertedWith('FiatTokenV2: authorization is used or canceled');
  });

  it('rejects an expired authorization and takes no payment', async function () {
    const { payer, relayer, usdc, registry } = await deploy();
    const a = await authorize(usdc, payer, registry.target, PRICE, { validBefore: 1n });
    await expect(registry.connect(relayer).anchorWithAuthorization(HASH, FILENAME, toAuth(a))).to.be.revertedWith('FiatTokenV2: authorization is expired');
    expect(await usdc.balanceOf(payer.address)).to.equal(10_000_000n);
  });

  describe('anchorPaid', function () {
    // Someone executes the authorization directly on the token, as a facilitator or a front-runner would
    async function executedOnToken() {
      const ctx = await deploy();
      const a = await authorize(ctx.usdc, ctx.payer, ctx.registry.target, PRICE);
      await ctx.usdc.connect(ctx.stranger).transferWithAuthorization(a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, a.signature);
      return { ...ctx, a };
    }

    it('anchors against an authorization already executed on the token', async function () {
      const { payer, relayer, usdc, registry, a } = await executedOnToken();
      expect(await usdc.balanceOf(registry.target)).to.equal(PRICE);
      await expect(registry.connect(relayer).anchorWithAuthorization(HASH, FILENAME, toAuth(a))).to.be.reverted;

      const receipt = await (await registry.connect(relayer).anchorPaid(HASH, FILENAME, payer.address, PRICE, a.nonce)).wait();
      const event = anchoredEvent(receipt, registry);
      expect(event.args.submitter).to.equal(payer.address);
      expect(event.args.paid).to.equal(PRICE);
    });

    it('anchors each payment once', async function () {
      const { payer, relayer, registry, a } = await executedOnToken();
      await registry.connect(relayer).anchorPaid(HASH, FILENAME, payer.address, PRICE, a.nonce);
      await expect(registry.connect(relayer).anchorPaid(HASH, FILENAME, payer.address, PRICE, a.nonce)).to.be.revertedWith('already anchored');
    });

    it('rejects a nonce already anchored through anchorWithAuthorization', async function () {
      const { payer, relayer, usdc, registry } = await deploy();
      const a = await authorize(usdc, payer, registry.target, PRICE);
      await registry.connect(relayer).anchorWithAuthorization(HASH, FILENAME, toAuth(a));
      await expect(registry.connect(relayer).anchorPaid(HASH, FILENAME, payer.address, PRICE, a.nonce)).to.be.revertedWith('already anchored');
    });

    it('rejects an unused nonce and a non-relayer', async function () {
      const { payer, relayer, stranger, registry, a } = await executedOnToken();
      await expect(registry.connect(relayer).anchorPaid(HASH, FILENAME, payer.address, PRICE, ethers.ZeroHash)).to.be.revertedWith('authorization not used');
      await expect(registry.connect(stranger).anchorPaid(HASH, FILENAME, payer.address, PRICE, a.nonce)).to.be.revertedWith('not relayer');
      await expect(registry.connect(relayer).anchorPaid(HASH, FILENAME, payer.address, PRICE - 1n, a.nonce)).to.be.revertedWith('price not met');
    });
  });

  it('anchors with an allowance', async function () {
    const { payer, usdc, registry } = await deploy();
    await usdc.connect(payer).approve(registry.target, PRICE);
    const receipt = await (await registry.connect(payer).anchor(HASH, FILENAME)).wait();
    const event = anchoredEvent(receipt, registry);
    expect(event.args.submitter).to.equal(payer.address);
    expect(event.args.paid).to.equal(PRICE);
    await expect(registry.connect(payer).anchor(HASH, FILENAME)).to.be.reverted; // allowance spent
  });

  it('lets only the owner set the price, set relayers and withdraw', async function () {
    const { owner, payer, relayer, stranger, usdc, registry } = await deploy();
    await expect(registry.connect(stranger).setPrice(1n)).to.be.reverted;
    await expect(registry.connect(stranger).setRelayer(stranger.address, true)).to.be.reverted;
    await expect(registry.connect(stranger).withdraw(usdc.target, stranger.address)).to.be.reverted;

    await expect(registry.setPrice(1_000_000n)).to.emit(registry, 'PriceSet').withArgs(1_000_000n);
    const low = await authorize(usdc, payer, registry.target, PRICE);
    await expect(registry.connect(relayer).anchorWithAuthorization(HASH, FILENAME, toAuth(low))).to.be.revertedWith('price not met');

    const a = await authorize(usdc, payer, registry.target, 1_000_000n);
    await registry.connect(relayer).anchorWithAuthorization(HASH, FILENAME, toAuth(a));
    await registry.withdraw(usdc.target, owner.address);
    expect(await usdc.balanceOf(owner.address)).to.equal(1_000_000n);
    expect(await usdc.balanceOf(registry.target)).to.equal(0n);

    await registry.setRelayer(relayer.address, false);
    const b = await authorize(usdc, payer, registry.target, 1_000_000n);
    await expect(registry.connect(relayer).anchorWithAuthorization(HASH, FILENAME, toAuth(b))).to.be.revertedWith('not payer or relayer');
  });
});
