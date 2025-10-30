export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/api/usd-to-amount') {
      const usdParam = url.searchParams.get('usd');
      const chainIdParam = url.searchParams.get('chainId');
      const usd = Number(usdParam);
      const chainId = Number(chainIdParam);
      if (!usdParam || Number.isNaN(usd) || usd <= 0 || !chainIdParam || Number.isNaN(chainId)) {
        return new Response(
          JSON.stringify({ error: 'Expected query: usd>0 & chainId' }),
          { status: 400, headers: { 'content-type': 'application/json' } }
        );
      }

      // Placeholder: return 1e18 wei per USD for now; replace with real pricing in M1
      const amountWei = BigInt(Math.round(usd * 1_000_000_000_000_000_000n));
      const ttl = parseInt(env.CACHE_TTL_SECONDS || '3600', 10);
      return new Response(JSON.stringify({ amountWei: amountWei.toString(), chainId }), {
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${ttl}`,
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};


