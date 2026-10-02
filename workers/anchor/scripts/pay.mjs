// Pay the anchor endpoint once with the official x402 client and print the proof.
//
//   node --env-file=.test-wallet.env scripts/pay.mjs <sha256 hex> [filename]
//
// The wallet in TEST_WALLET_PRIVATE_KEY needs USDC on Base and nothing else.

import { privateKeyToAccount } from 'viem/accounts';
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';

const [hash, filename] = process.argv.slice(2);
const base = process.env.ANCHOR_URL || 'https://anchor.akashi-notari.com';
const network = process.env.ANCHOR_NETWORK || 'eip155:8453';
if (!hash || !process.env.TEST_WALLET_PRIVATE_KEY) {
  console.error('usage: node --env-file=.test-wallet.env scripts/pay.mjs <sha256 hex> [filename]');
  process.exit(1);
}

const account = privateKeyToAccount(process.env.TEST_WALLET_PRIVATE_KEY);
const pay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network, client: new ExactEvmScheme(account) }],
});

const res = await pay(`${base}/anchor`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ hash, filename }),
});
console.log(res.status, await res.json());
const settlement = res.headers.get('payment-response');
if (settlement) console.log('settlement', JSON.parse(Buffer.from(settlement, 'base64').toString('utf8')));
process.exit(res.ok ? 0 : 1);
