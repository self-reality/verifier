// Smoke test of the deployed anchor worker.
//
//   node scripts/live.mjs                                   read-only checks
//   node --env-file=.test-wallet.env scripts/live.mjs --pay also buys one anchor (one price in USDC)
//   node --env-file=.test-wallet.env scripts/live.mjs --mcp also buys one anchor through the MCP tool
//
// ANCHOR_URL overrides the default https://anchor.akashi-notari.com.

import { randomBytes } from 'node:crypto';

const base = (process.env.ANCHOR_URL || 'https://anchor.akashi-notari.com').replace(/\/+$/, '');
const network = process.env.ANCHOR_NETWORK || 'eip155:8453';
const pay = process.argv.includes('--pay');
const payMcp = process.argv.includes('--mcp');

let failed = 0;
function check(name, condition, detail) {
  if (condition) return console.log(`  ✓ ${name}`);
  failed += 1;
  console.error(`  ✗ ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 600));
}

const getJson = async (path) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
};

let nextId = 1;
const rpc = async (method, params) => {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  return res.json();
};

// Hashes nobody has anchored
const fresh = randomBytes(32).toString('hex');
const freshMcp = randomBytes(32).toString('hex');

console.log(`${base}\n\ndiscovery`);
const index = await getJson('/');
const registry = index.body?.payment?.payTo;
check('index names the contract and price', index.status === 200 && Boolean(registry) && Boolean(index.body.payment.price), index);
console.log(`    contract ${registry} · price ${index.body?.payment?.price}`);
const openapi = await getJson('/openapi.json');
check('openapi.json marks /anchor as paid', Boolean(openapi.body?.paths?.['/anchor']?.post?.['x-payment-info']), openapi.status);
const x402 = await getJson('/.well-known/x402');
check('/.well-known/x402 lists /anchor', x402.body?.resources?.[0] === `${base}/anchor`, x402);
const agent = await getJson('/.well-known/agent-registration.json');
check('agent registration names the MCP endpoint', agent.body?.services?.some((s) => s.name === 'MCP' && s.endpoint === `${base}/mcp`), agent);
const llms = await fetch(`${base}/llms.txt`);
check('llms.txt is plain text', llms.status === 200 && llms.headers.get('content-type').startsWith('text/plain'), llms.status);

console.log('\nhttp');
const quote = await fetch(`${base}/anchor`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ hash: fresh }),
});
const terms = await quote.json();
check('unpaid POST /anchor returns 402 with x402 terms', quote.status === 402 && terms.accepts?.[0]?.payTo === registry && terms.accepts[0].network === network, terms);
const unknown = await getJson(`/proof?hash=${fresh}`);
check('an unknown hash is not anchored', unknown.status === 200 && unknown.body.anchored === false && unknown.body.searched.includes(registry), unknown);
if (unknown.body?.unsearched) console.log(`    unsearched: ${unknown.body.unsearched.join(', ')}`);

console.log('\nmcp');
const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'live', version: '0' } });
check('initialize', init.result?.protocolVersion === '2025-06-18', init);
const tools = await rpc('tools/list');
check('lists find_proof and anchor_hash', tools.result?.tools?.map((t) => t.name).join() === 'find_proof,anchor_hash', tools);
const found = await rpc('tools/call', { name: 'find_proof', arguments: { hash: fresh } });
check('find_proof answers', found.result?.structuredContent?.anchored === false && !found.result.isError, found);
const unpaid = await rpc('tools/call', { name: 'anchor_hash', arguments: { hash: fresh } });
check('anchor_hash without payment returns the terms', unpaid.result?.isError === true && unpaid.result.structuredContent?.accepts?.[0]?.payTo === registry, unpaid);

if (pay) {
  console.log('\npaid anchor');
  if (!process.env.TEST_WALLET_PRIVATE_KEY) {
    console.error('  TEST_WALLET_PRIVATE_KEY is not set; run with --env-file=.test-wallet.env');
    process.exit(1);
  }
  const { privateKeyToAccount } = await import('viem/accounts');
  const { wrapFetchWithPaymentFromConfig } = await import('@x402/fetch');
  const { ExactEvmScheme } = await import('@x402/evm');
  const account = privateKeyToAccount(process.env.TEST_WALLET_PRIVATE_KEY);
  const paidFetch = wrapFetchWithPaymentFromConfig(fetch, { schemes: [{ network, client: new ExactEvmScheme(account) }] });
  const res = await paidFetch(`${base}/anchor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hash: fresh, filename: 'live-check.txt' }),
  });
  const proof = await res.json();
  check('the official x402 client buys an anchor', res.status === 200 && proof.hash === fresh && proof.submitter === account.address, proof);
  console.log(`    ${proof.status} · tx ${proof.txHash}\n    ${proof.explorerUrl}`);

  // The node behind the lookup may trail the one that reported the receipt
  let byHash;
  for (let attempt = 0; attempt < 10; attempt++) {
    byHash = await getJson(`/proof?hash=${fresh}&t=${attempt}`);
    if (byHash.body?.anchored) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  check('GET /proof?hash= finds it', byHash.body?.anchored && byHash.body.proofs[0].txHash === proof.txHash && byHash.body.proofs[0].contract === registry, byHash);
  const byTx = await getJson(`/proof?tx=${proof.txHash}`);
  check('GET /proof?tx= finds it', byTx.body?.anchored && byTx.body.proofs[0].hash === fresh, byTx);
  const viaMcp = await rpc('tools/call', { name: 'find_proof', arguments: { hash: fresh } });
  check('find_proof finds it', viaMcp.result?.structuredContent?.proofs?.[0]?.txHash === proof.txHash, viaMcp);
}

if (payMcp) {
  console.log('\npaid anchor over mcp');
  if (!process.env.TEST_WALLET_PRIVATE_KEY) {
    console.error('  TEST_WALLET_PRIVATE_KEY is not set; run with --env-file=.test-wallet.env');
    process.exit(1);
  }
  const { privateKeyToAccount } = await import('viem/accounts');
  const account = privateKeyToAccount(process.env.TEST_WALLET_PRIVATE_KEY);
  const quoted = await rpc('tools/call', { name: 'anchor_hash', arguments: { hash: freshMcp, filename: 'live-check-mcp.txt' } });
  const accepted = quoted.result.structuredContent.accepts[0];

  // Sign the EIP-3009 authorization the terms ask for, as an x402 MCP client would
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account.address,
    to: accepted.payTo,
    value: accepted.amount,
    validAfter: '0',
    validBefore: String(now + accepted.maxTimeoutSeconds),
    nonce: `0x${randomBytes(32).toString('hex')}`,
  };
  const signature = await account.signTypedData({
    domain: {
      name: accepted.extra.name,
      version: accepted.extra.version,
      chainId: Number(accepted.network.split(':')[1]),
      verifyingContract: accepted.asset,
    },
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
    message: { ...authorization, value: BigInt(authorization.value), validAfter: 0n, validBefore: BigInt(authorization.validBefore) },
  });
  const paid = await rpc('tools/call', {
    name: 'anchor_hash',
    arguments: { hash: freshMcp, filename: 'live-check-mcp.txt' },
    _meta: { 'x402/payment': { x402Version: 2, accepted, payload: { signature, authorization } } },
  });
  const proof = paid.result?.structuredContent;
  check('anchor_hash with a payment in _meta anchors the hash', !paid.result?.isError && proof?.hash === freshMcp && proof.submitter === account.address, paid);
  check('and returns the settlement', paid.result?._meta?.['x402/payment-response']?.success === true, paid.result?._meta);
  console.log(`    ${proof?.status} · tx ${proof?.txHash}\n    ${proof?.explorerUrl}`);
}

console.log(failed === 0 ? '\nall checks passed' : `\n${failed} checks failed`);
process.exit(failed === 0 ? 0 : 1);
