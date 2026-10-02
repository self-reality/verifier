// End-to-end check of the anchor worker against a local chain.
//
//   1. cd contracts/registry && npx hardhat compile && npx hardhat node
//   2. cd workers/anchor && pnpm test:e2e
//
// Deploys MockUSDC, VerifierRegistryUSDC and VerifierRegistry, then calls the worker's fetch
// handler in-process: by hand, and through the official x402 client to prove interoperability.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, defineChain, getAddress, parseEventLogs, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import worker from '../src/index.js';
import { ANCHORED_EVENT } from '../src/abi.js';

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const ARTIFACTS =
  process.env.ARTIFACTS_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../contracts/registry/artifacts/contracts');
const ORIGIN = 'https://anchor.test';
const PRICE = 500_000n;

// Hardhat's well-known development keys
const owner = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const relayer = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const payer = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
const poorPayer = privateKeyToAccount('0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6');
const stranger = privateKeyToAccount('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a');

const artifact = (file, name) => JSON.parse(readFileSync(path.join(ARTIFACTS, file, `${name}.json`), 'utf8'));
const publicClient = createPublicClient({ transport: http(RPC_URL), pollingInterval: 100 });
const chainId = await publicClient.getChainId();
const chain = defineChain({
  id: chainId,
  name: 'local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});
const wallet = (account) => createWalletClient({ account, chain, transport: http(RPC_URL) });

async function deploy(file, name, args = []) {
  const { abi, bytecode } = artifact(file, name);
  const hash = await wallet(owner).deployContract({ abi, bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { address: getAddress(receipt.contractAddress), abi };
}

async function send(account, contract, functionName, args, value) {
  const hash = await wallet(account).writeContract({ address: contract.address, abi: contract.abi, functionName, args, value });
  return publicClient.waitForTransactionReceipt({ hash });
}

const read = (contract, functionName, args = []) =>
  publicClient.readContract({ address: contract.address, abi: contract.abi, functionName, args });

let passed = 0;
function check(name, condition, detail) {
  if (!condition) {
    console.error(`  ✗ ${name}`, detail === undefined ? '' : detail);
    process.exit(1);
  }
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const decode = (value) => JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64');
const sha = (seed) => toHex(seed, { size: 32 }).slice(2);

// ---------- setup ----------

const usdc = await deploy('mocks/MockUSDC.sol', 'MockUSDC');
const registry = await deploy('VerifierRegistryUSDC.sol', 'VerifierRegistryUSDC', [owner.address, usdc.address, PRICE]);
const legacy = await deploy('VerifierRegistry.sol', 'VerifierRegistry', [owner.address, 0n, 10n ** 18n]);
await send(owner, registry, 'setRelayer', [relayer.address, true]);
await send(owner, usdc, 'mint', [payer.address, 10_000_000n]);
console.log(`chain ${chainId} · usdc ${usdc.address} · registry ${registry.address}`);

const env = {
  CHAIN_ID: String(chainId),
  NETWORK_NAME: 'base',
  CERTIFICATE_CHAIN: 'base',
  RPC_URL,
  REGISTRY_ADDRESS: registry.address,
  LEGACY_REGISTRY_ADDRESS: legacy.address,
  TOKEN_ADDRESS: usdc.address,
  TOKEN_NAME: 'USD Coin',
  TOKEN_VERSION: '2',
  RELAYER_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  RATE_LIMIT_PER_MIN: '1000',
  LOGS_API_URL: '',
};

let lastPaymentHeader = null;
const workerFetch = (input, init) => {
  const request = new Request(input, init);
  lastPaymentHeader = request.headers.get('payment-signature') || lastPaymentHeader;
  return worker.fetch(request, env, { waitUntil() {} });
};
const postAnchor = (body, headers = {}) =>
  workerFetch(`${ORIGIN}/anchor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

// Build a PaymentPayload by hand, the way any x402 client would
async function signPayment(account, overrides = {}) {
  const authorization = {
    from: account.address,
    to: registry.address,
    value: PRICE.toString(),
    validAfter: '0',
    validBefore: String(Math.floor(Date.now() / 1000) + 3600),
    nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
    ...overrides,
  };
  const signature = await account.signTypedData({
    domain: { name: 'USD Coin', version: '2', chainId, verifyingContract: usdc.address },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      ...authorization,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
    },
  });
  const accepted = {
    scheme: 'exact',
    network: `eip155:${chainId}`,
    amount: PRICE.toString(),
    asset: usdc.address,
    payTo: registry.address,
    maxTimeoutSeconds: 120,
    extra: { assetTransferMethod: 'eip3009', name: 'USD Coin', version: '2' },
  };
  return { authorization, header: encode({ x402Version: 2, accepted, payload: { signature, authorization } }) };
}

// ---------- 402 ----------

console.log('\nquote');
{
  const res = await postAnchor({ hash: sha(1) });
  check('unpaid request returns 402', res.status === 402, res.status);
  const required = decode(res.headers.get('payment-required'));
  const accept = required.accepts[0];
  check('PAYMENT-REQUIRED is x402 v2', required.x402Version === 2);
  check('quotes the contract price in USDC', accept.amount === PRICE.toString() && accept.asset === usdc.address);
  check('payTo is the registry contract', accept.payTo === registry.address);
  check('carries the EIP-712 domain of the token', accept.extra.name === 'USD Coin' && accept.extra.version === '2');
  check('advertises the bazaar extension', required.extensions.bazaar.info.input.method === 'POST');
  const probe = await workerFetch(`${ORIGIN}/anchor`);
  check('a bare GET probe also gets 402', probe.status === 402, probe.status);
}

// ---------- official client ----------

console.log('\nofficial x402 client');
const HASH_A = sha(0xa);
let txA;
{
  const fetchWithPayment = wrapFetchWithPaymentFromConfig(workerFetch, {
    schemes: [{ network: `eip155:${chainId}`, client: new ExactEvmScheme(payer) }],
    // The client pays only well-known assets by default; the mock token has to be allowed
    spendControls: { allowedAssets: [{ network: `eip155:${chainId}`, asset: usdc.address }] },
  });
  const before = await read(usdc, 'balanceOf', [payer.address]);
  const res = await fetchWithPayment(`${ORIGIN}/anchor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hash: `0x${HASH_A.toUpperCase()}`, filename: 'Report Final.PDF' }),
  });
  const body = await res.json();
  check('paid request returns 200', res.status === 200, body);
  check('normalizes hash and filename', body.hash === HASH_A && body.filename === 'reportfinal.pdf', body);
  check('names the payer as submitter', body.submitter === payer.address);
  check('returns a certificate link', body.certificateUrl === `https://akashi-notari.com/certificate/?chain=base&hash=${body.txHash}`, body.certificateUrl);
  const settlement = decode(res.headers.get('payment-response'));
  check('PAYMENT-RESPONSE reports the transaction', settlement.success && settlement.transaction === body.txHash && settlement.payer === payer.address);
  txA = body.txHash;

  const receipt = await publicClient.getTransactionReceipt({ hash: txA });
  const [event] = parseEventLogs({ abi: [ANCHORED_EVENT], eventName: 'Anchored', logs: receipt.logs });
  check('one transaction holds the event', event.args.cid === HASH_A && event.args.submitter === payer.address && event.args.paid === PRICE);
  check('and the payment', (await read(usdc, 'balanceOf', [registry.address])) === PRICE && before - (await read(usdc, 'balanceOf', [payer.address])) === PRICE);
  check('sent by the relayer', receipt.from.toLowerCase() === relayer.address.toLowerCase());
  console.log(`    gas used: ${receipt.gasUsed}`);
}

console.log('\nrejections');
{
  const replay = await postAnchor({ hash: sha(0xb) }, { 'payment-signature': lastPaymentHeader });
  const replayBody = await replay.json();
  check('replayed payment is refused with 409', replay.status === 409 && replayBody.error === 'payment_already_used', replayBody);

  const registryBalance = await read(usdc, 'balanceOf', [registry.address]);
  const good = await signPayment(payer);
  const badHash = await postAnchor({ hash: 'not-a-hash' }, { 'payment-signature': good.header });
  check('bad hash returns 400', badHash.status === 400);
  const badName = await postAnchor({ hash: sha(0xc), filename: '~~~' }, { 'payment-signature': good.header });
  check('bad filename returns 400', badName.status === 400);
  check('and takes no payment', (await read(usdc, 'balanceOf', [registry.address])) === registryBalance);

  const cheap = await signPayment(payer, { value: (PRICE - 1n).toString() });
  const underpaid = await postAnchor({ hash: sha(0xc) }, { 'payment-signature': cheap.header });
  check('underpayment returns 402', underpaid.status === 402 && (await underpaid.json()).error === 'invalid_exact_evm_payload_authorization_value_mismatch');

  const elsewhere = await signPayment(payer, { to: stranger.address });
  const wrongTo = await postAnchor({ hash: sha(0xc) }, { 'payment-signature': elsewhere.header });
  check('payment to another address returns 402', wrongTo.status === 402 && (await wrongTo.json()).error === 'invalid_exact_evm_payload_recipient_mismatch');

  const expired = await signPayment(payer, { validBefore: '1' });
  const late = await postAnchor({ hash: sha(0xc) }, { 'payment-signature': expired.header });
  check('expired payment returns 402', late.status === 402 && (await late.json()).error === 'invalid_exact_evm_payload_authorization_valid_before');

  const forged = await signPayment(stranger, { from: payer.address });
  const forgedRes = await postAnchor({ hash: sha(0xc) }, { 'payment-signature': forged.header });
  check('forged signature returns 402', forgedRes.status === 402 && (await forgedRes.json()).error === 'invalid_exact_evm_payload_signature');

  const broke = await signPayment(poorPayer);
  const brokeRes = await postAnchor({ hash: sha(0xc) }, { 'payment-signature': broke.header });
  const brokeBody = await brokeRes.json();
  check('empty wallet returns 402 insufficient_funds', brokeRes.status === 402 && brokeBody.error === 'insufficient_funds', brokeBody);
  check('failure carries PAYMENT-RESPONSE', decode(brokeRes.headers.get('payment-response')).success === false);
  check('none of them moved money', (await read(usdc, 'balanceOf', [registry.address])) === registryBalance);
}

// ---------- authorization executed on the token first ----------

console.log('\nrecovery');
const HASH_D = sha(0xd);
{
  const { authorization: a, header } = await signPayment(payer);
  const { signature } = decode(header).payload;
  await send(stranger, usdc, 'transferWithAuthorization', [a.from, a.to, BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce, signature]);
  const res = await postAnchor({ hash: HASH_D, filename: 'frontrun.txt' }, { 'payment-signature': header });
  const body = await res.json();
  check('anchors a payment already executed on the token', res.status === 200 && body.submitter === payer.address, body);
  const again = await postAnchor({ hash: sha(0xe) }, { 'payment-signature': header });
  check('but only once', again.status === 409);

  const canceled = await signPayment(payer);
  await send(payer, usdc, 'cancelAuthorization', [canceled.authorization.nonce]);
  const free = await postAnchor({ hash: sha(0xf) }, { 'payment-signature': canceled.header });
  check('a canceled authorization buys nothing', free.status === 402, await free.json());
}

// ---------- lookup ----------

console.log('\nlookup');
{
  const byHash = await (await workerFetch(`${ORIGIN}/proof?hash=${HASH_A}`)).json();
  check('finds the proof by hash', byHash.anchored && byHash.proofs.length === 1 && byHash.proofs[0].txHash === txA, byHash);
  check('reports the currency', byHash.proofs[0].currency === 'USDC' && byHash.proofs[0].paid === PRICE.toString());

  const byTx = await (await workerFetch(`${ORIGIN}/proof?tx=${txA}`)).json();
  check('finds the proof by transaction', byTx.anchored && byTx.proofs[0].hash === HASH_A);

  const none = await workerFetch(`${ORIGIN}/proof?hash=${sha(0x99)}`);
  const noneBody = await none.json();
  check('unknown hash is not anchored', none.status === 200 && noneBody.anchored === false && noneBody.proofs.length === 0);

  await send(payer, legacy, 'anchor', [HASH_A, 'legacy.pdf'], 1000n);
  const both = await (await workerFetch(`${ORIGIN}/proof?hash=${HASH_A}`)).json();
  check('includes proofs from the ETH contract, earliest first', both.proofs.length === 2 && both.proofs[0].txHash === txA && both.proofs[1].currency === 'ETH', both);

  check('rejects a malformed lookup', (await workerFetch(`${ORIGIN}/proof?hash=xyz`)).status === 400);
  const index = await (await workerFetch(`${ORIGIN}/`)).json();
  check('index describes the service and price', index.payment.price === PRICE.toString() && index.payment.payTo === registry.address);
  const openapi = await (await workerFetch(`${ORIGIN}/openapi.json`)).json();
  const paid = openapi.paths['/anchor'].post;
  check('openapi.json marks /anchor as paid in USD', paid['x-payment-info'].price.amount === '0.500000' && '402' in paid.responses);
  check('and the free endpoints as open', openapi.paths['/proof'].get.security.length === 0 && Boolean(openapi.info['x-guidance']));
}

console.log(`\n${passed} checks passed`);
