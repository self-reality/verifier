Anchor Worker

Cloudflare Worker that sells anchors to agents over x402. An agent sends a SHA-256 file hash and a signed USDC payment in one HTTP request; the worker sends one transaction to `VerifierRegistryUSDC`, which takes the USDC and writes the proof. No facilitator is involved.

## API Endpoints

- `POST /anchor` → paid. Writes the hash on-chain, returns the transaction hash and a certificate link
- `GET /proof?hash=<sha256 hex>` → free. Every proof of this hash, earliest first
- `GET /proof?tx=<transaction hash>` → free. The proof written by this transaction
- `GET /openapi.json` → OpenAPI description; directories such as x402scan read it before they register `/anchor`
- `GET /` → service description and current price
- `GET /health` → `{ ok: true }`

## POST /anchor

Body: `{ "hash": "<sha256, 64 hex chars>", "filename": "<optional>" }`. A `0x` prefix and uppercase are accepted; the hash is stored lowercase without `0x`, the same form the web app writes. The filename follows the web app's rules: lowercase `a-z 0-9 - _ .`, at most 128 characters.

Without a `PAYMENT-SIGNATURE` header the worker answers `402` with the terms in a `PAYMENT-REQUIRED` header (x402 v2, base64 JSON) and the same JSON in the body:

```json
{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "500000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "<VerifierRegistryUSDC>",
      "maxTimeoutSeconds": 120,
      "extra": { "assetTransferMethod": "eip3009", "name": "USD Coin", "version": "2" }
    }
  ]
}
```

The amount is read from `price()` on the contract, so the quote and the contract always agree. With a valid payment the response is `200` and carries a `PAYMENT-RESPONSE` header:

```json
{
  "ok": true,
  "hash": "be44340d151cbfa7a5dc59b579dd6632fb0891b573f8fdc927264309a3b168f0",
  "filename": "report.pdf",
  "submitter": "<payer address>",
  "timestamp": 1790919801,
  "timestampIso": "2026-10-02T05:43:21.000Z",
  "paid": "500000",
  "currency": "USDC",
  "chain": "base",
  "txHash": "0x...",
  "explorerUrl": "https://basescan.org/tx/0x...",
  "certificateUrl": "https://akashi-notari.com/certificate/?chain=base&hash=0x..."
}
```

Any x402 client works:

```js
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';

const pay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: 'eip155:8453', client: new ExactEvmScheme(account) }],
});
const res = await pay('https://<worker>/anchor', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ hash, filename: 'report.pdf' }),
});
```

## Status Codes

- `400` bad hash, filename or payment header. Checked before the payment is touched; nothing is charged
- `402` no payment, or the payment cannot be settled. The body's `error` is an x402 error code such as `insufficient_funds`
- `409` `payment_already_used`: this authorization already bought an anchor. Look it up with `/proof`
- `503` the worker has no contract address or relayer key

## Notes

- The transaction either moves the USDC and emits the proof, or reverts and moves nothing
- The on-chain `submitter` is the payer, not the relayer
- If an authorization was already executed on the token (by a facilitator, or by someone who front-ran the relayer), the worker confirms the transfer to the contract in the token's logs and anchors it with `anchorPaid`. It looks back 1,800 blocks
- A canceled authorization buys nothing
- The official x402 client refuses payments above $1 unless its user raises the limit; keep the price at or below $1 for agents to pay without configuration
- Concurrent requests share one relayer key. A colliding nonce is retried three times; heavy traffic needs a queue
- `/proof?hash=` searches through the Blockscout API, since public RPC nodes limit `eth_getLogs` to a short block range
- Rate limited to `RATE_LIMIT_PER_MIN` requests per IP (default 60)

## Environment Variables

- `RELAYER_PRIVATE_KEY`: secret. The wallet that sends the transactions. It needs ETH for gas and `setRelayer(address, true)` on the contract
- `REGISTRY_ADDRESS`: the deployed `VerifierRegistryUSDC`
- `CHAIN_ID`: `8453` (Base, default) or `84532` (Base Sepolia). These two have built-in defaults for everything below
- `RPC_URL`, `TOKEN_ADDRESS`, `TOKEN_NAME`, `TOKEN_VERSION`, `EXPLORER_URL`: optional overrides. `TOKEN_NAME` and `TOKEN_VERSION` are the token's EIP-712 domain
- `LEGACY_REGISTRY_ADDRESS`: the ETH `VerifierRegistry`, included in lookups
- `LOGS_API_URL`, `LOGS_FROM_BLOCK`: Blockscout-compatible logs API for `/proof?hash=`. Set `LOGS_API_URL` empty to use the RPC node
- `PUBLIC_URL`: the worker's public origin, used in the `resource.url` it advertises
- `CERTIFICATE_URL`, `CERTIFICATE_CHAIN`: where certificate links point
- `RATE_LIMIT_PER_MIN`: default 60

## Local Development

```bash
cd workers/anchor
pnpm install
cp dev.vars.template .dev.vars
pnpm dev
```

## Tests

The end-to-end script deploys a mock USDC and both registries to a local chain, then drives the worker by hand and through the official x402 client.

```bash
# terminal 1
cd contracts/registry && npx hardhat compile && npx hardhat node

# terminal 2
cd workers/anchor && pnpm test:e2e
```

## Deployment

```bash
# 1. Deploy the contract and allow the relayer (try baseSepolia first)
cd contracts/registry
RELAYER_ADDRESS=0x... pnpm hardhat run scripts/deploy-usdc.js --network base

# 2. Put the address from constants-usdc.json into wrangler.toml as REGISTRY_ADDRESS

# 3. Set the relayer key and deploy
cd ../../workers/anchor
npx wrangler secret put RELAYER_PRIVATE_KEY
npx wrangler deploy

# 4. Send the relayer a little ETH on Base for gas

# 5. Rebuild and deploy the web app, so the certificate page reads the new contract
```
