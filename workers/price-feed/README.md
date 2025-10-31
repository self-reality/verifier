Price Feed Worker

Endpoints:
- GET /health → { ok: true }
- GET /api/usd-to-amount?usd=1&chainId=8453 → { chainId, usd, tokenId, priceUsd, amountWei }

Query params:
- usd: positive number (e.g., 1.25)
- chainId: EVM chain id (supported: 1, 8453, 84532, 137, 10, 42161)
- provider: optional price provider; one of `coindesk` (default), `coingecko`
- strict: optional; when `1` or `true`, disables provider fallback and fails if the requested provider cannot serve a price. Response will include `providerRequested` and `providerUsed`.

Response example:
```
{
  "chainId": 8453,
  "usd": 1,
  "tokenId": "ethereum",
  "priceUsd": 2795.12,
  "providerRequested": "coindesk",
  "providerUsed": "coindesk",
  "amountWei": "357892345345345" 
}
```

Notes:
- amountWei is computed using integer math to avoid floating point drift.
- Results are cached via CDN (Cache-Control) and Workers Cache API. TTL = CACHE_TTL_SECONDS.
- Optional API key: send header `x-api-key` matching `API_KEYS` (comma-separated) if configured.
- CORS allowlist: set `ORIGINS_ALLOWLIST` to a comma-separated list like `https://app.example.com,https://staging.example.com`.
- Basic per-IP rate limit: `RATE_LIMIT_PER_MIN` (default 60).

Secrets/config:
```
cd workers/price-feed
npx wrangler secret put API_KEYS
```

Local dev:
```
pnpm i # or npm i
pnpm dev
```

Example curl:
```
curl "http://127.0.0.1:8787/api/usd-to-amount?usd=1&chainId=8453"
```

With explicit provider:
```
curl "http://127.0.0.1:8787/api/usd-to-amount?usd=1&chainId=8453&provider=coingecko"
```

Strict mode example (no fallback):
```
curl "http://127.0.0.1:8787/api/usd-to-amount?usd=1&chainId=8453&provider=coingecko&strict=1"
```

Cycle-through test script:
```
pnpm test:local
# or
BASE=https://your-prod-host pnpm test:prod
```
The script reads env vars: `BASE` (default http://127.0.0.1:8787), `USD` (default 1), `API_KEY` (optional), `TIMEOUT_MS` (default 8000). It calls `/health` then checks all supported chains with both providers using `strict=1`.
