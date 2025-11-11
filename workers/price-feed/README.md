Price Feed Worker

Cloudflare Worker that provides cryptocurrency price feeds for the Akashi Notari verification service.

## API Endpoints

- `GET /health` → `{ ok: true }`
- `GET /api/usd-to-amount?ticker=ETH` → Returns amount in wei for $1 USD

## Query Parameters

- `ticker` (required): Currency ticker - `ETH`, `POL`, or `OP`
- `provider` (optional): Price provider - `coindesk` (default) or `coingecko`
- `strict` (optional): Set to `1` or `true` to disable provider fallback

## Response Format

```json
{
  "ticker": "ETH",
  "tokenId": "ethereum",
  "priceUsd": 3500.25,
  "providerRequested": "coindesk",
  "providerUsed": "coindesk",
  "amountWei": "285714285714285"
}
```

## Notes

- Always returns the amount for exactly $1 USD (frontend multiplies for custom fees)
- Results are cached via Cloudflare CDN with TTL = `CACHE_TTL_SECONDS` (default 3600s)
- Rate limited to `RATE_LIMIT_PER_MIN` requests per IP (default 60)
- CORS enabled for allowed origins via `ORIGINS_ALLOWLIST` environment variable

## Environment Variables

- `COINDESK_PROXY_KEY`: API key for CryptoCompare (required for coindesk provider)
- `ORIGINS_ALLOWLIST`: Comma-separated allowed origins (e.g., `https://akashi-notari.com`)
- `API_KEYS`: Optional comma-separated API keys for authentication
- `CACHE_TTL_SECONDS`: Cache duration in seconds (default: 3600)
- `RATE_LIMIT_PER_MIN`: Rate limit per IP (default: 60)

## Local Development

```bash
cd workers/price-feed
pnpm install
pnpm dev
```

Test locally:
```bash
curl "http://127.0.0.1:8787/api/usd-to-amount?ticker=ETH"
curl "http://127.0.0.1:8787/api/usd-to-amount?ticker=ETH&provider=coingecko"
```

## Deployment

```bash
# Configure secrets
npx wrangler secret put COINDESK_PROXY_KEY
npx wrangler secret put API_KEYS  # optional
npx wrangler secret put ORIGINS_ALLOWLIST

# Deploy to production
npx wrangler deploy
```

## Production Usage

```bash
# Health check
curl "https://price-feed.akashi-notari.com/health"

# Get ETH price (for Ethereum, Base, Optimism)
curl "https://price-feed.akashi-notari.com/api/usd-to-amount?ticker=ETH"

# Use specific provider
curl "https://price-feed.akashi-notari.com/api/usd-to-amount?ticker=ETH&provider=coingecko"

# Strict mode (no fallback)
curl "https://price-feed.akashi-notari.com/api/usd-to-amount?ticker=ETH&provider=coindesk&strict=1"
```
