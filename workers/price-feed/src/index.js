const TEXT_JSON = { 'content-type': 'application/json' };
// Base
// Polygon
// Arbitrum
// Optimism
// Ethereum 
function parseAllowedOrigins(env) {
  const raw = env.ORIGINS_ALLOWLIST || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin, allowlist) {
  if (!origin) return true; // allow non-browser clients
  if (allowlist.length === 0) return true; // no restrictions configured
  try {
    const url = new URL(origin);
    const originHost = `${url.protocol}//${url.host}`;
    return allowlist.includes(originHost);
  } catch (_) {
    return false;
  }
}

function buildCorsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowlist = parseAllowedOrigins(env);
  const headers = new Headers();
  if (isOriginAllowed(origin, allowlist) && origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  headers.set('access-control-allow-methods', 'GET, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, x-api-key');
  headers.set('access-control-max-age', '600');
  return headers;
}

function requireApiKeyIfConfigured(request, env) {
  const configured = (env.API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (configured.length === 0) return { ok: true };
  const provided = request.headers.get('x-api-key') || '';
  const ok = configured.includes(provided);
  return ok ? { ok: true } : { ok: false, response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: TEXT_JSON }) };
}

// naive per-IP token bucket using in-memory Map
const ipState = new Map();
function isRateLimited(ip, limit, windowMs) {
  const now = Date.now();
  const state = ipState.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > state.resetAt) {
    state.count = 0;
    state.resetAt = now + windowMs;
  }
  state.count += 1;
  ipState.set(ip, state);
  return state.count > limit;
}

function chainIdToCoingeckoId(chainId) {
  switch (Number(chainId)) {
    case 1: // Ethereum
    case 8453: // Base mainnet, native token ETH
    case 84532: // Base Sepolia
      return 'ethereum';
    case 137:
      return 'matic-network';
    case 10: // Optimism
      return 'optimism';
    case 42161: // Arbitrum
      return 'arbitrum-one';
    default:
      return null;
  }
}

async function fetchPriceUsdPrimary(tokenId) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(tokenId)}&vs_currencies=usd`;
  const res = await fetch(url, { cf: { cacheTtl: 60, cacheEverything: true } });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const data = await res.json();
  const price = data?.[tokenId]?.usd;
  if (typeof price !== 'number' || !isFinite(price) || price <= 0) throw new Error('coingecko price invalid');
  return price;
}

function tokenIdToSymbol(tokenId) {
  switch (tokenId) {
    case 'ethereum':
      return 'ETH';
    case 'matic-network':
      return 'MATIC';
    case 'optimism':
      return 'OP';
    case 'arbitrum-one':
      return 'ARB';
    default:
      return null;
  }
}

async function fetchPriceUsdFromCoindeskIfConfigured(tokenId, env) {
  const base = env.COINDESK_PROXY_URL || '';
  if (!base) throw new Error('coindesk not configured');
  const symbol = tokenIdToSymbol(tokenId);
  if (!symbol) throw new Error('coindesk symbol unsupported');
  const url = new URL(base);
  // Expect a simple proxy that returns { priceUsd: number } for symbol/USD
  // The proxy should accept query params: symbol, currency (optional; defaults to USD)
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('currency', 'USD');
  const headers = {};
  if (env.COINDESK_PROXY_KEY) headers['authorization'] = `Bearer ${env.COINDESK_PROXY_KEY}`;
  const res = await fetch(url.toString(), { headers, cf: { cacheTtl: 60, cacheEverything: true } });
  if (!res.ok) throw new Error(`coindesk ${res.status}`);
  const data = await res.json();
  const price = Number(data?.priceUsd ?? data?.price_usd ?? data?.usd);
  if (!isFinite(price) || price <= 0) throw new Error('coindesk price invalid');
  return price;
}

async function fetchPriceUsdFallback(tokenId) {
  // Simple mapping for a second source (CoinCap uses symbols rather than ids for these majors)
  const symbolMap = {
    ethereum: 'ETH',
    'matic-network': 'MATIC',
    optimism: 'OP',
    'arbitrum-one': 'ARB',
  };
  const symbol = symbolMap[tokenId];
  if (!symbol) throw new Error('no fallback symbol');
  const res = await fetch(`https://api.coincap.io/v2/assets/${symbol.toLowerCase()}`);
  if (!res.ok) throw new Error(`coincap ${res.status}`);
  const data = await res.json();
  const price = Number(data?.data?.priceUsd);
  if (!isFinite(price) || price <= 0) throw new Error('coincap price invalid');
  return price;
}

function computeWeiForUsd(usd, priceUsd) {
  // Use integer math: priceScaled = round(priceUsd * 1e8)
  const DECIMALS = 1_0000_0000n; // 1e8
  const WEI_PER_ETH = 1_000000000000000000n; // 1e18
  const priceScaled = BigInt(Math.round(priceUsd * 1e8));
  const usdScaled = BigInt(Math.round(usd * 1e8));
  // amountWei = usdScaled * WEI_PER_ETH / priceScaled
  return (usdScaled * WEI_PER_ETH) / priceScaled;
}

async function getPriceUsd(tokenId, env) {
  // Try CoinDesk (if configured) -> CoinGecko -> CoinCap
  try {
    return await fetchPriceUsdFromCoindeskIfConfigured(tokenId, env);
  } catch (_) {}
  try {
    return await fetchPriceUsdPrimary(tokenId);
  } catch (_) {}
  return await fetchPriceUsdFallback(tokenId);
}

async function handleUsdToAmount(request, env, ctx) {
  const url = new URL(request.url);
  const usdParam = url.searchParams.get('usd');
  const chainIdParam = url.searchParams.get('chainId');
  const usd = Number(usdParam);
  const chainId = Number(chainIdParam);
  if (!usdParam || Number.isNaN(usd) || usd <= 0 || !chainIdParam || Number.isNaN(chainId)) {
    return new Response(JSON.stringify({ error: 'Expected query: usd>0 & chainId' }), { status: 400, headers: TEXT_JSON });
  }

  const tokenId = chainIdToCoingeckoId(chainId);
  if (!tokenId) {
    return new Response(JSON.stringify({ error: 'Unsupported chainId' }), { status: 400, headers: TEXT_JSON });
  }

  // Cache key
  const ttl = parseInt(env.CACHE_TTL_SECONDS || '3600', 10);
  const cache = caches.default;
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.searchParams.set('v', '1'); // bump to bust cache schema changes
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const corsHeaders = buildCorsHeaders(request, env);
    const resp = new Response(cached.body, cached);
    corsHeaders.forEach((v, k) => resp.headers.set(k, v));
    return resp;
  }

  const priceUsd = await getPriceUsd(tokenId, env);
  const amountWei = computeWeiForUsd(usd, priceUsd);
  const payload = {
    chainId,
    usd,
    tokenId,
    priceUsd,
    amountWei: amountWei.toString(),
  };
  const resp = new Response(JSON.stringify(payload), {
    headers: {
      ...TEXT_JSON,
      'cache-control': `public, max-age=${ttl}`,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Basic logging
    const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
    const ua = request.headers.get('user-agent') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      const headers = buildCorsHeaders(request, env);
      return new Response(null, { headers });
    }

    // API key gate if configured
    const keyCheck = requireApiKeyIfConfigured(request, env);
    if (!keyCheck.ok) return keyCheck.response;

    // Rate limit
    const limitPerMin = parseInt(env.RATE_LIMIT_PER_MIN || '60', 10);
    if (isRateLimited(ip, limitPerMin, 60_000)) {
      return new Response(JSON.stringify({ error: 'Too Many Requests' }), { status: 429, headers: TEXT_JSON });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), { headers: TEXT_JSON });
    }

    if (url.pathname === '/api/usd-to-amount') {
      try {
        const response = await handleUsdToAmount(request, env, ctx);
        const headers = buildCorsHeaders(request, env);
        const wrapped = new Response(response.body, response);
        headers.forEach((v, k) => wrapped.headers.set(k, v));
        return wrapped;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'internal error';
        console.error('usd-to-amount error', { ip, ua, msg });
        return new Response(JSON.stringify({ error: 'Upstream error' }), { status: 502, headers: TEXT_JSON });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};

