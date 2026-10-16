#!/usr/bin/env node
// Akashi Notari at a glance, read from Base: the wallets' balances, how many
// anchors the relayer can still pay gas for, every anchor it has relayed with
// its payer, and which payers are customers rather than our own tests.
//
//   node ops/status.mjs
//
// Prints one JSON line: { ok, result }. Read-only, keyless, no dependencies.
//
// Public RPCs refuse eth_getLogs over any useful range, so anchors are found
// without an index: the relayer's nonce counts its transactions, and a binary
// search over block heights finds the block of each one. Found transactions
// are cached in ops/cache/ (ignored by git), so a run only searches for the
// ones it has not seen. The web app's ETH anchors go straight to the legacy
// registry, which no counter tracks; its balance is compared with the last run
// instead, and a rise is reported as a new web-app anchor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(here, 'watch.json'), 'utf8'));
const cacheFile = path.join(here, 'cache', 'status.json');
const cache = (() => { try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { return { txs: {} }; } })();
const lc = (a) => a.toLowerCase();
const own = new Set([...cfg.ownPayers, cfg.relayer, ...cfg.wallets.map((w) => w.address)].map(lc));

let calls = 0;
async function rpc(method, params) {
    for (let attempt = 0; ; attempt += 1) {
        calls += 1;
        try {
            const res = await fetch(cfg.rpc, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'user-agent': 'akashi-ops' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            });
            const body = await res.json();
            if (body.error) throw new Error(`${method}: ${body.error.message}`);
            return body.result;
        } catch (err) {
            if (attempt >= 4) throw err;
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        }
    }
}
const hex = (n) => `0x${n.toString(16)}`;
const big = (h) => BigInt(h ?? '0x0');
const eth = (wei) => Number(wei) / 1e18;
const usdcOf = async (a) => Number(big(await rpc('eth_call', [{ to: cfg.usdc, data: `0x70a08231${lc(a).slice(2).padStart(64, '0')}` }, 'latest']))) / 1e6;

// anchorWithAuthorization(string, string, (address from, …, bytes signature)) carries the
// tuple behind an offset, since `signature` is dynamic; anchorPaid(string, string, address
// from, …) carries `from` in place. Either way the payer is the address the tuple or word 2 holds.
function payerOf(input) {
    const word = (i) => input.slice(10 + 64 * i, 10 + 64 * (i + 1));
    const w2 = BigInt(`0x${word(2) || '0'}`);
    const at = w2 < 2n ** 32n ? Number(w2) / 32 : 2;
    const w = word(at);
    return w.length === 64 ? `0x${w.slice(24)}` : null;
}

async function findTx(nonce, head) {
    const count = async (b) => Number(big(await rpc('eth_getTransactionCount', [cfg.relayer, hex(b)])));
    let lo = Math.max(cfg.scanFrom, ...Object.values(cache.txs).filter((t) => t.nonce < nonce).map((t) => t.block));
    let hi = head;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (await count(mid) > nonce) hi = mid; else lo = mid + 1;
    }
    const block = await rpc('eth_getBlockByNumber', [hex(lo), true]);
    const tx = block.transactions.find((t) => lc(t.from) === lc(cfg.relayer) && Number(big(t.nonce)) === nonce);
    if (!tx) throw new Error(`relayer nonce ${nonce}: not in block ${lo}`);
    const rc = await rpc('eth_getTransactionReceipt', [tx.hash]);
    const fee = big(rc.gasUsed) * big(rc.effectiveGasPrice) + big(rc.l1Fee);
    const isAnchor = lc(tx.to || '') === lc(cfg.registry);
    return {
        nonce, block: lo, at: new Date(Number(big(block.timestamp)) * 1000).toISOString(), hash: tx.hash,
        to: tx.to, anchor: isAnchor, payer: isAnchor ? payerOf(tx.input) : null, ok: rc.status === '0x1',
        gasUsed: Number(big(rc.gasUsed)), l1FeeWei: big(rc.l1Fee).toString(), feeWei: fee.toString(),
    };
}

const head = Number(big(await rpc('eth_blockNumber', [])));
const [nonceNow, nonceFrom, gasPrice] = await Promise.all([
    rpc('eth_getTransactionCount', [cfg.relayer, 'latest']).then((h) => Number(big(h))),
    rpc('eth_getTransactionCount', [cfg.relayer, hex(cfg.scanFrom)]).then((h) => Number(big(h))),
    rpc('eth_gasPrice', []).then(big),
]);
for (let n = nonceFrom; n < nonceNow; n += 1) {
    if (!cache.txs[n]) cache.txs[n] = await findTx(n, head);
}

const wallets = [];
for (const w of cfg.wallets) {
    wallets.push({ ...w, eth: eth(big(await rpc('eth_getBalance', [w.address, 'latest']))), usdc: await usdcOf(w.address),
                   url: `${cfg.explorer}/address/${w.address}` });
}
let ethUsd = null;
try { ethUsd = (await (await fetch(cfg.price)).json()).priceUsd ?? null; } catch { /* the page shows ETH alone */ }

const anchors = Object.values(cache.txs).filter((t) => t.anchor).sort((a, b) => b.nonce - a.nonce)
    .map((t) => ({ ...t, own: !!t.payer && own.has(lc(t.payer)), url: `${cfg.explorer}/tx/${t.hash}` }));
const recent = anchors.filter((t) => t.ok).slice(0, 10);
const avg = (xs) => xs.reduce((s, x) => s + x, 0n) / BigInt(Math.max(1, xs.length));
// Gas at today's price plus the L1 data fee as it was paid: the L2 half moves with
// eth_gasPrice, the L1 half with Ethereum's blob price, which no Base call quotes.
const feeNow = recent.length
    ? avg(recent.map((t) => BigInt(t.gasUsed))) * gasPrice + avg(recent.map((t) => BigInt(t.l1FeeWei)))
    : null;
const relayerWei = BigInt(Math.round(wallets.find((w) => lc(w.address) === lc(cfg.relayer)).eth * 1e18));
const anchorsLeft = feeNow ? Number(relayerWei / feeNow) : null;

const customers = anchors.filter((t) => t.ok && !t.own);
const legacy = wallets.find((w) => lc(w.address) === lc(cfg.legacyRegistry));
const legacyBefore = cache.legacyEth;
const legacyRose = legacyBefore != null && legacy.eth > legacyBefore;

const warnings = [];
if (anchorsLeft != null && anchorsLeft < cfg.lowAnchors) warnings.push(`relayer gas covers about ${anchorsLeft} anchors — top it up`);
if (customers.length) warnings.push(`${customers.length} anchor(s) paid by a wallet outside ownPayers — a customer, or a test wallet to add to ops/watch.json`);
if (legacyRose) warnings.push(`the web app's ETH registry rose from ${legacyBefore} to ${legacy.eth} ETH since the last check — a web-app anchor`);

cache.legacyEth = legacy.eth;
cache.checkedAt = new Date().toISOString();
fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));

console.log(JSON.stringify({
    ok: true,
    action: 'status',
    result: {
        at: cache.checkedAt, head, ethUsd, wallets,
        relayer: {
            nonce: nonceNow, gasPriceGwei: Number(gasPrice) / 1e9,
            feePerAnchorEth: feeNow == null ? null : eth(feeNow), anchorsLeft, sample: recent.length,
        },
        anchors, customers, warnings,
        legacy: { eth: legacy.eth, before: legacyBefore ?? null, rose: legacyRose },
        rpcCalls: calls,
    },
}));
