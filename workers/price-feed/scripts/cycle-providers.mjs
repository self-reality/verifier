const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const USD = Number(process.env.USD || '1');
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || '8000');
const API_KEY = process.env.API_KEY || '';

const CHAINS = [1, 8453, 137, 10];
const PROVIDERS = ['coindesk', 'coingecko'];

async function fetchJson(url, opts = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(id);
  }
}

function validatePayload(payload, expected) {
  if (!payload || typeof payload !== 'object') return 'payload not object';
  if (payload.chainId !== expected.chainId) return 'chainId mismatch';
  if (Number(payload.usd) !== Number(expected.usd)) return 'usd mismatch';
  if (!(typeof payload.priceUsd === 'number' && isFinite(payload.priceUsd) && payload.priceUsd > 0)) return 'priceUsd invalid';
  if (typeof payload.amountWei !== 'string' || !/^[0-9]+$/.test(payload.amountWei)) return 'amountWei invalid';
  if (payload.providerRequested !== expected.provider) return 'providerRequested mismatch';
  if (payload.providerUsed !== expected.provider) return 'providerUsed mismatch (strict expected exact)';
  return null;
}

async function main() {
  const headers = {};
  if (API_KEY) headers['x-api-key'] = API_KEY;

  console.log(`[cycle] base=${BASE} usd=${USD} timeoutMs=${TIMEOUT_MS}`);

  // Health
  const health = await fetchJson(`${BASE}/health`, { headers });
  if (!health.ok) {
    console.error(`[health] FAIL status=${health.status} body=${health.text}`);
    process.exit(1);
  }
  console.log('[health] OK');

  const failures = [];

  for (const chainId of CHAINS) {
    for (const provider of PROVIDERS) {
      const url = `${BASE}/api/usd-to-amount?usd=${encodeURIComponent(USD)}&chainId=${chainId}&provider=${provider}&strict=1`;
      const t0 = Date.now();
      const res = await fetchJson(url, { headers });
      const ms = Date.now() - t0;
      if (!res.ok) {
        failures.push(`[chain ${chainId}] [${provider}] FAIL status=${res.status} body=${res.text}`);
        console.error(`[chain ${chainId}] [${provider}] FAIL ${ms}ms status=${res.status}`);
        continue;
      }
      const err = validatePayload(res.json, { chainId, usd: USD, provider });
      if (err) {
        failures.push(`[chain ${chainId}] [${provider}] INVALID: ${err}; payload=${JSON.stringify(res.json)}`);
        console.error(`[chain ${chainId}] [${provider}] INVALID ${ms}ms: ${err}`);
        continue;
      }
      console.log(`[chain ${chainId}] [${provider}] OK ${ms}ms priceUsd=${res.json.priceUsd}`);
    }
  }

  if (failures.length) {
    console.error(`\n[summary] ${failures.length} failure(s)`);
    for (const f of failures) console.error(' - ' + f);
    process.exit(1);
  }
  console.log('\n[summary] all checks passed');
}

main().catch((err) => {
  console.error('[fatal]', err && err.stack ? err.stack : String(err));
  process.exit(1);
});


