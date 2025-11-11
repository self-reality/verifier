const TEXT_JSON = { 'content-type': 'application/json' };

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

function tickerToCoingeckoId(ticker) {
  switch (ticker.toUpperCase()) {
    case 'ETH':
      return 'ethereum';
    case 'POL':
      return 'polygon-ecosystem-token';
    case 'OP':
      return 'optimism';
    default:
      return null;
  }
}

async function fetchPriceUsdFromCoingecko(tokenId) {
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
    case 'polygon-ecosystem-token':
      return 'POL';
    case 'matic-network':
      return 'MATIC';
    case 'optimism':
      return 'OP';
    default:
      return null;
  }
}

async function fetchPriceUsdFromCryptocompare(tokenId, env) {
  const symbol = tokenIdToSymbol(tokenId);
  if (!symbol) throw new Error('cryptocompare symbol unsupported');
  const apiKey = env.COINDESK_PROXY_KEY;
  if (!apiKey) throw new Error('cryptocompare not configured');
  const url = `https://min-api.cryptocompare.com/data/price?fsym=${encodeURIComponent(symbol)}&tsyms=USD&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { cf: { cacheTtl: 60, cacheEverything: true } });
  if (!res.ok) throw new Error(`cryptocompare ${res.status}`);
  const data = await res.json();
  const price = Number(data?.USD);
  if (!isFinite(price) || price <= 0) throw new Error('cryptocompare price invalid');
  return price;
}

// CoinCap removed (providers limited to coindesk and coingecko)

function computeWeiForUsd(usd, priceUsd) {
  // Use integer math: priceScaled = round(priceUsd * 1e8)
  const DECIMALS = 1_0000_0000n; // 1e8
  const WEI_PER_ETH = 1_000000000000000000n; // 1e18
  const priceScaled = BigInt(Math.round(priceUsd * 1e8));
  const usdScaled = BigInt(Math.round(usd * 1e8));
  // amountWei = usdScaled * WEI_PER_ETH / priceScaled
  return (usdScaled * WEI_PER_ETH) / priceScaled;
}

async function getPriceUsd(tokenId, env, provider, strict) {
  // Provider preference with optional fallback
  const preferred = (provider || 'coindesk').toLowerCase();
  const order = strict
    ? [preferred]
    : preferred === 'coingecko'
    ? ['coingecko', 'coindesk']
    : ['coindesk', 'coingecko'];

  for (const p of order) {
    try {
      if (p === 'coindesk') {
        // Behind the 'coindesk' provider name, use CryptoCompare as per migration plan
        const priceUsd = await fetchPriceUsdFromCryptocompare(tokenId, env);
        return { priceUsd, providerUsed: 'coindesk' };
      }
      if (p === 'coingecko') {
        const priceUsd = await fetchPriceUsdFromCoingecko(tokenId);
        return { priceUsd, providerUsed: 'coingecko' };
      }
    } catch (_) {}
  }
  throw new Error('all providers failed');
}

async function handleUsdToAmount(request, env, ctx) {
  const url = new URL(request.url);
  const tickerParam = url.searchParams.get('ticker');
  const providerParam = url.searchParams.get('provider');
  const strictParam = url.searchParams.get('strict');
  const usd = 1; // Always return price for $1 USD
  
  if (!tickerParam) {
    return new Response(JSON.stringify({ error: 'Expected query parameter: ticker' }), { status: 400, headers: TEXT_JSON });
  }

  const tokenId = tickerToCoingeckoId(tickerParam);
  if (!tokenId) {
    return new Response(JSON.stringify({ error: 'Unsupported ticker' }), { status: 400, headers: TEXT_JSON });
  }

  // Validate provider if provided; default is coindesk
  const provider = (providerParam || 'coindesk').toLowerCase();
  const allowedProviders = ['coindesk', 'coingecko'];
  if (providerParam && !allowedProviders.includes(provider)) {
    return new Response(JSON.stringify({ error: 'Unsupported provider' }), { status: 400, headers: TEXT_JSON });
  }
  const strict = typeof strictParam === 'string' && /^(1|true)$/i.test(strictParam);

  // Cache key
  const ttl = parseInt(env.CACHE_TTL_SECONDS || '3600', 10);
  const cache = caches.default;
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.searchParams.set('v', '2'); // bump to bust cache schema changes
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const corsHeaders = buildCorsHeaders(request, env);
    const resp = new Response(cached.body, cached);
    corsHeaders.forEach((v, k) => resp.headers.set(k, v));
    return resp;
  }

  const { priceUsd, providerUsed } = await getPriceUsd(tokenId, env, provider, strict);
  const amountWei = computeWeiForUsd(usd, priceUsd);
  const payload = {
    ticker: tickerParam.toUpperCase(),
    tokenId,
    priceUsd,
    providerRequested: provider,
    providerUsed,
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

