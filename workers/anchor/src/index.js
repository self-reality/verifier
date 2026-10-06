import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  defineChain,
  parseEventLogs,
  decodeEventLog,
  encodeEventTopics,
  encodeFunctionData,
  keccak256,
  getAddress,
  isAddress,
  isHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ANCHORED_EVENT, REGISTRY_ABI, TOKEN_ABI } from './abi.js';

const TEXT_JSON = { 'content-type': 'application/json' };
const X402_VERSION = 2;
const MAX_TIMEOUT_SECONDS = 120;
// An authorization must stay valid long enough for the transaction to land
const MIN_VALIDITY_SECONDS = 6;
// How far back to look for an authorization that was executed on the token directly
const RECOVERY_LOOKBACK_BLOCKS = 1800n;
// The explorer API that searches the ETH contract is optional; a slow answer must not hold up the lookup
const LEGACY_SEARCH_TIMEOUT_MS = 4000;

// Defaults per chain; every field can be overridden with an env var
const NETWORKS = {
  8453: {
    name: 'base',
    // Tried in order. mainnet.base.org rate-limits Cloudflare's shared addresses, so it comes last
    rpcUrl: 'https://base.drpc.org,https://base-rpc.publicnode.com,https://mainnet.base.org',
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    tokenName: 'USD Coin',
    tokenVersion: '2',
    explorer: 'https://basescan.org',
    logsApi: 'https://base.blockscout.com/api',
    logsFromBlock: 37800000,
    legacyRegistry: '0xeed9D0f7265892e84e43d05dA464c75add199260',
    certificateChain: 'base',
  },
  84532: {
    name: 'base-sepolia',
    rpcUrl: 'https://sepolia.base.org',
    token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    tokenName: 'USDC',
    tokenVersion: '2',
    explorer: 'https://sepolia.basescan.org',
    logsApi: 'https://base-sepolia.blockscout.com/api',
    logsFromBlock: 0,
  },
};

const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

function addressOrNull(value) {
  return value && isAddress(value) ? getAddress(value) : null;
}

function getConfig(env) {
  const chainId = parseInt(env.CHAIN_ID || '8453', 10);
  const known = NETWORKS[chainId] || {};
  return {
    chainId,
    network: `eip155:${chainId}`,
    name: env.NETWORK_NAME || known.name || `chain-${chainId}`,
    rpcUrl: env.RPC_URL || known.rpcUrl,
    rpcOrigin: env.RPC_ORIGIN || '',
    registry: addressOrNull(env.REGISTRY_ADDRESS),
    legacyRegistry: addressOrNull(env.LEGACY_REGISTRY_ADDRESS || known.legacyRegistry),
    token: addressOrNull(env.TOKEN_ADDRESS || known.token),
    tokenName: env.TOKEN_NAME || known.tokenName,
    tokenVersion: env.TOKEN_VERSION || known.tokenVersion,
    explorer: env.EXPLORER_URL || known.explorer || '',
    logsApi: env.LOGS_API_URL !== undefined ? env.LOGS_API_URL : known.logsApi || '',
    logsApiKey: env.LOGS_API_KEY || '',
    logsFromBlock: BigInt(env.LOGS_FROM_BLOCK || known.logsFromBlock || 0),
    certificateUrl: env.CERTIFICATE_URL || 'https://akashi-notari.com/certificate/',
    certificateChain: env.CERTIFICATE_CHAIN || known.certificateChain || '',
    relayerKey: env.RELAYER_PRIVATE_KEY || '',
    publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
  };
}

// RPC_URL may list several endpoints, comma-separated; they are tried in order
function rpcUrls(cfg) {
  return cfg.rpcUrl.split(',').map((url) => url.trim()).filter(Boolean);
}

function getClients(cfg) {
  const urls = rpcUrls(cfg);
  const chain = defineChain({
    id: cfg.chainId,
    name: cfg.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: urls } },
  });
  // A provider key restricted to an origin allowlist needs the Origin header a browser would send
  const options = cfg.rpcOrigin ? { fetchOptions: { headers: { origin: cfg.rpcOrigin } } } : {};
  const transport = fallback(urls.map((url) => http(url, options)));
  const publicClient = createPublicClient({ chain, transport, pollingInterval: 1_000 });
  const account = cfg.relayerKey ? privateKeyToAccount(cfg.relayerKey) : null;
  const walletClient = account ? createWalletClient({ account, chain, transport }) : null;
  return { publicClient, walletClient, account };
}

// ---------- http helpers ----------

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, accept, payment-signature, mcp-protocol-version, mcp-session-id',
    'access-control-expose-headers': 'payment-required, payment-response',
    'access-control-max-age': '600',
  };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...TEXT_JSON, ...corsHeaders(), ...headers } });
}

function encodeHeader(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeHeader(value) {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

// naive per-IP limiter using in-memory Map, as in the price-feed worker
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

// ---------- input ----------

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

// SHA-256 as 64 lowercase hex chars without 0x, the form the web app writes on-chain
function normalizeHash(value) {
  if (typeof value !== 'string') return null;
  let hash = value.trim().toLowerCase();
  if (hash.startsWith('0x')) hash = hash.slice(2);
  return /^[0-9a-f]{64}$/.test(hash) ? hash : null;
}

// Same rules as validateFilename in the web app; an absent filename is allowed
function normalizeFilename(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') return null;
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]/g, '')
    .replace(/^[\-\.]+|[\-\.]+$/g, '')
    .substring(0, 128);
  return sanitized.length > 0 ? sanitized : null;
}

// ---------- price ----------

let priceCache = { key: '', value: 0n, at: 0 };

async function getPrice(cfg, publicClient, fresh = false) {
  const key = `${cfg.chainId}:${cfg.registry}`;
  if (!fresh && priceCache.key === key && Date.now() - priceCache.at < 60_000) return priceCache.value;
  const value = await publicClient.readContract({ address: cfg.registry, abi: REGISTRY_ABI, functionName: 'price' });
  priceCache = { key, value, at: Date.now() };
  return value;
}

// The token has 6 decimals; 10000 units read as "0.010000"
function usd(units) {
  return `${units / 1_000_000n}.${(units % 1_000_000n).toString().padStart(6, '0')}`;
}

// ---------- x402 ----------

function paymentRequirements(cfg, price) {
  return {
    scheme: 'exact',
    network: cfg.network,
    amount: price.toString(),
    asset: cfg.token,
    payTo: cfg.registry,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: { assetTransferMethod: 'eip3009', name: cfg.tokenName, version: cfg.tokenVersion },
  };
}

const EXAMPLE_HASH = 'be44340d151cbfa7a5dc59b579dd6632fb0891b573f8fdc927264309a3b168f0';

function bazaarExtension() {
  return {
    info: {
      input: {
        type: 'http',
        method: 'POST',
        bodyType: 'json',
        body: { hash: EXAMPLE_HASH, filename: 'report.pdf' },
      },
      output: {
        type: 'json',
        example: {
          ok: true,
          hash: EXAMPLE_HASH,
          filename: 'report.pdf',
          txHash: '0xd01d3e019906321b7d410538aebb696dec806df1099756ec85ac7b2da91df7fc',
          timestamp: 1763105659,
          certificateUrl:
            'https://akashi-notari.com/certificate/?chain=base&hash=0xd01d3e019906321b7d410538aebb696dec806df1099756ec85ac7b2da91df7fc',
        },
      },
    },
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        input: {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'http' },
            method: { type: 'string', enum: ['POST', 'PUT', 'PATCH'] },
            bodyType: { type: 'string', enum: ['json', 'form-data', 'text'] },
            body: {
              type: 'object',
              properties: {
                hash: { type: 'string', description: 'SHA-256 of the file, 64 hex characters' },
                filename: { type: 'string', description: 'Optional name to record with the hash' },
              },
              required: ['hash'],
            },
          },
          required: ['type', 'method', 'bodyType', 'body'],
          additionalProperties: false,
        },
        output: {
          type: 'object',
          properties: { type: { type: 'string' }, example: { type: 'object' } },
          required: ['type'],
        },
      },
      required: ['input'],
    },
  };
}

function paymentRequiredBody(cfg, price, resourceUrl, error) {
  return {
    x402Version: X402_VERSION,
    error,
    resource: {
      url: resourceUrl,
      description: 'Proof of existence: write a SHA-256 file hash on-chain and get a certificate link',
      mimeType: 'application/json',
    },
    accepts: [paymentRequirements(cfg, price)],
    extensions: { bazaar: bazaarExtension() },
  };
}

function paymentRequired(cfg, price, origin, error, settlement) {
  const body = paymentRequiredBody(cfg, price, `${cfg.publicUrl || origin}/anchor`, error);
  const headers = { 'payment-required': encodeHeader(body) };
  if (settlement) headers['payment-response'] = encodeHeader(settlement);
  return json(body, 402, headers);
}

function sameAddress(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

// Check the payload against what this server accepts; returns { error } or { auth }
function checkPayment(payment, cfg, price, nowSeconds) {
  try {
    if (!payment || payment.x402Version !== X402_VERSION) return { error: 'invalid_x402_version' };
    const accepted = payment.accepted || {};
    if (accepted.scheme !== 'exact') return { error: 'invalid_scheme' };
    if (accepted.network !== cfg.network) return { error: 'invalid_network' };
    if (!sameAddress(accepted.asset, cfg.token) || !sameAddress(accepted.payTo, cfg.registry)) {
      return { error: 'invalid_payment_requirements' };
    }
    const method = accepted.extra && accepted.extra.assetTransferMethod;
    if (method && method !== 'eip3009') return { error: 'unsupported_scheme' };

    const { signature, authorization } = payment.payload || {};
    if (!authorization || !isHex(signature)) return { error: 'invalid_payload' };
    const { from, to, value, validAfter, validBefore, nonce } = authorization;
    if (!isAddress(from) || !isAddress(to) || !isHex(nonce) || nonce.length !== 66) return { error: 'invalid_payload' };
    if (!sameAddress(to, cfg.registry)) return { error: 'invalid_exact_evm_payload_recipient_mismatch' };

    const auth = {
      from: getAddress(from),
      value: BigInt(value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce,
      signature,
    };
    if (auth.value < price) return { error: 'invalid_exact_evm_payload_authorization_value_mismatch' };
    if (auth.validAfter > BigInt(nowSeconds)) return { error: 'invalid_exact_evm_payload_authorization_valid_after' };
    if (auth.validBefore < BigInt(nowSeconds + MIN_VALIDITY_SECONDS)) {
      return { error: 'invalid_exact_evm_payload_authorization_valid_before' };
    }
    return { auth };
  } catch (_) {
    return { error: 'invalid_payload' };
  }
}

function revertReason(err) {
  const parts = [];
  let current = err;
  while (current) {
    if (current.reason) parts.push(current.reason);
    if (current.shortMessage) parts.push(current.shortMessage);
    if (current.message) parts.push(current.message);
    current = current.cause;
  }
  return parts.join(' | ');
}

function classifyRevert(reason) {
  if (/price not met/i.test(reason)) return 'invalid_exact_evm_payload_authorization_value_mismatch';
  if (/expired/i.test(reason)) return 'invalid_exact_evm_payload_authorization_valid_before';
  if (/not yet valid/i.test(reason)) return 'invalid_exact_evm_payload_authorization_valid_after';
  if (/invalid signature|ECRecover|ECDSA/i.test(reason)) return 'invalid_exact_evm_payload_signature';
  if (/exceeds balance|insufficient/i.test(reason)) return 'insufficient_funds';
  return 'invalid_transaction_state';
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Ask each endpoint in turn: a pruned or rate-limited node must not hide a mined transaction
async function findReceipt(cfg, txHash) {
  for (const url of rpcUrls(cfg)) {
    try {
      return await getClients({ ...cfg, rpcUrl: url, relayerKey: '' }).publicClient.getTransactionReceipt({ hash: txHash });
    } catch (_) {}
  }
  return null;
}

// Sign, broadcast and wait. The transaction hash is known before the broadcast, so an RPC error
// after that point never turns a sent payment into a reported failure.
// Returns { txHash, receipt }; receipt is null when no endpoint reported it in time.
async function sendAndWait(cfg, clients, call) {
  const { publicClient, walletClient, account } = clients;
  const data = encodeFunctionData({ abi: REGISTRY_ABI, ...call });
  let txHash;
  let lastError;
  // Concurrent requests share one relayer key, so a nonce can collide; prepare again with a fresh one
  for (let attempt = 0; attempt < 3 && !txHash; attempt++) {
    const prepared = await walletClient.prepareTransactionRequest({ account, to: cfg.registry, data });
    const serialized = await walletClient.signTransaction(prepared);
    const candidate = keccak256(serialized);
    try {
      await publicClient.sendRawTransaction({ serializedTransaction: serialized });
      txHash = candidate;
    } catch (err) {
      lastError = err;
      // The node may have taken the transaction even though the call failed
      if (/already known/i.test(revertReason(err)) || (await findReceipt(cfg, candidate))) txHash = candidate;
      else await sleep(400 * (attempt + 1));
    }
  }
  if (!txHash) throw lastError;

  for (let poll = 0; poll < 30; poll++) {
    const receipt = await findReceipt(cfg, txHash);
    if (receipt) return { txHash, receipt };
    await sleep(1000);
  }
  return { txHash, receipt: null };
}

// True when the token shows this authorization moved `value` from the payer to the registry.
// A used nonce alone is not enough: the payer can cancel an authorization, which also marks it used.
async function transferHappened(cfg, publicClient, auth) {
  const latest = await publicClient.getBlockNumber();
  const fromBlock = latest > RECOVERY_LOOKBACK_BLOCKS ? latest - RECOVERY_LOOKBACK_BLOCKS : 0n;
  const used = await publicClient.getLogs({
    address: cfg.token,
    event: TOKEN_ABI.find((item) => item.name === 'AuthorizationUsed'),
    args: { authorizer: auth.from, nonce: auth.nonce },
    fromBlock,
    toBlock: latest,
  });
  if (used.length === 0) return false;
  const receipt = await publicClient.getTransactionReceipt({ hash: used[0].transactionHash });
  const transfers = parseEventLogs({ abi: TOKEN_ABI, eventName: 'Transfer', logs: receipt.logs });
  return transfers.some(
    (log) =>
      sameAddress(log.address, cfg.token) &&
      sameAddress(log.args.from, auth.from) &&
      sameAddress(log.args.to, cfg.registry) &&
      log.args.value === auth.value
  );
}

// Returns { sent: { txHash, receipt } } once a transaction is broadcast, or { error, status } when the payment cannot be settled
async function settle(cfg, clients, hash, filename, auth) {
  const { publicClient, account } = clients;
  const base = { account, address: cfg.registry, abi: REGISTRY_ABI };
  const call = { functionName: 'anchorWithAuthorization', args: [hash, filename, auth] };
  let simulationError;
  try {
    await publicClient.simulateContract({ ...base, ...call });
  } catch (err) {
    simulationError = err;
  }
  // Only the simulation decides whether the payment is acceptable; errors after the broadcast are not payment failures
  if (!simulationError) return { sent: await sendAndWait(cfg, clients, call) };

  const reason = revertReason(simulationError);
  console.error('anchor simulation failed', reason.slice(0, 1500));
  if (/not payer or relayer/i.test(reason)) return { error: 'relayer_not_allowed', status: 500 };

  // The authorization may have been executed on the token already, by a facilitator or a front-runner
  const nonceUsed = await publicClient.readContract({
    address: cfg.token,
    abi: TOKEN_ABI,
    functionName: 'authorizationState',
    args: [auth.from, auth.nonce],
  });
  if (nonceUsed) {
    const alreadyAnchored = await publicClient.readContract({
      ...base,
      functionName: 'settled',
      args: [auth.from, auth.nonce],
    });
    if (alreadyAnchored) return { error: 'payment_already_used', status: 409 };
    if (await transferHappened(cfg, publicClient, auth)) {
      const paidCall = { functionName: 'anchorPaid', args: [hash, filename, auth.from, auth.value, auth.nonce] };
      await publicClient.simulateContract({ ...base, ...paidCall });
      return { sent: await sendAndWait(cfg, clients, paidCall) };
    }
    return { error: 'invalid_transaction_state', status: 402 };
  }

  let error = classifyRevert(reason);
  if (error === 'invalid_transaction_state') {
    const balance = await publicClient.readContract({
      address: cfg.token,
      abi: TOKEN_ABI,
      functionName: 'balanceOf',
      args: [auth.from],
    });
    if (balance < auth.value) error = 'insufficient_funds';
  }
  return { error, status: 402 };
}

// ---------- proofs ----------

function certificateUrl(cfg, txHash) {
  if (!cfg.certificateChain) return null;
  return `${cfg.certificateUrl}?chain=${cfg.certificateChain}&hash=${txHash}`;
}

function toProof(cfg, contract, args, txHash, blockNumber) {
  const timestamp = Number(args.timestamp);
  return {
    hash: args.cid,
    filename: args.filename,
    submitter: args.submitter,
    timestamp,
    timestampIso: new Date(timestamp * 1000).toISOString(),
    paid: args.paid.toString(),
    currency: sameAddress(contract, cfg.legacyRegistry) ? 'ETH' : 'USDC',
    chain: cfg.name,
    chainId: cfg.chainId,
    contract,
    txHash,
    blockNumber: Number(blockNumber),
    explorerUrl: cfg.explorer ? `${cfg.explorer}/tx/${txHash}` : null,
    certificateUrl: certificateUrl(cfg, txHash),
  };
}

function registries(cfg) {
  return [cfg.registry, cfg.legacyRegistry].filter(Boolean);
}

// The registry stores the first anchor of each hash. Its block holds the event with the full proof,
// so the lookup is one contract read and a one-block log query, which every RPC plan allows.
async function firstProofs(cfg, publicClient, hash) {
  const [, , blockNumber] = await publicClient.readContract({
    address: cfg.registry,
    abi: REGISTRY_ABI,
    functionName: 'firstAnchor',
    args: [hash],
  });
  if (blockNumber === 0n) return [];
  const logs = await publicClient.getLogs({
    address: cfg.registry,
    event: ANCHORED_EVENT,
    args: { cidIndex: hash },
    fromBlock: blockNumber,
    toBlock: blockNumber,
  });
  return logs.map((log) => toProof(cfg, getAddress(log.address), log.args, log.transactionHash, log.blockNumber));
}

// The ETH contract the web app writes to stores nothing, so its proofs need a search over the whole chain
async function legacyProofs(cfg, publicClient, hash) {
  const address = cfg.legacyRegistry;
  if (cfg.logsApi) {
    // An explorer API searches the whole chain; RPC nodes limit eth_getLogs to a short block range
    const topics = encodeEventTopics({ abi: [ANCHORED_EVENT], eventName: 'Anchored', args: { cidIndex: hash } });
    // LOGS_API_URL may already carry a query, e.g. Etherscan's ?chainid=8453
    const url = new URL(cfg.logsApi);
    const query = {
      module: 'logs',
      action: 'getLogs',
      fromBlock: cfg.logsFromBlock.toString(),
      toBlock: 'latest',
      address,
      topic0: topics[0],
      topic1: topics[1],
      topic0_1_opr: 'and',
    };
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    if (cfg.logsApiKey) url.searchParams.set('apikey', cfg.logsApiKey);
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'akashi-notari-anchor/1.0' },
      signal: AbortSignal.timeout(LEGACY_SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`logs api ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.result)) throw new Error('logs api: no result');
    return data.result.map((row) => {
      const decoded = decodeEventLog({ abi: [ANCHORED_EVENT], data: row.data, topics: row.topics.filter(Boolean) });
      return toProof(cfg, getAddress(row.address), decoded.args, row.transactionHash, BigInt(row.blockNumber));
    });
  }
  const logs = await publicClient.getLogs({
    address,
    event: ANCHORED_EVENT,
    args: { cidIndex: hash },
    fromBlock: cfg.logsFromBlock,
    toBlock: 'latest',
  });
  return logs.map((log) => toProof(cfg, getAddress(log.address), log.args, log.transactionHash, log.blockNumber));
}

// Returns { proofs, searched, unsearched }. A failed search of the ETH contract does not hide the
// registry's answer; the contract is named in `unsearched` so the caller knows the result is partial.
async function proofsByHash(cfg, publicClient, hash) {
  const proofs = [];
  const searched = [];
  const unsearched = [];
  if (cfg.registry) {
    proofs.push(...(await firstProofs(cfg, publicClient, hash)));
    searched.push(cfg.registry);
  }
  if (cfg.legacyRegistry) {
    try {
      proofs.push(...(await legacyProofs(cfg, publicClient, hash)));
      searched.push(cfg.legacyRegistry);
    } catch (err) {
      console.error('legacy proof search failed', revertReason(err).slice(0, 300));
      unsearched.push(cfg.legacyRegistry);
    }
  }
  proofs.sort((a, b) => a.timestamp - b.timestamp);
  return { proofs, searched, unsearched };
}

async function lookupByHash(cfg, publicClient, hash) {
  const { proofs, searched, unsearched } = await proofsByHash(cfg, publicClient, hash);
  const body = { hash, anchored: proofs.length > 0, proofs, searched };
  if (unsearched.length > 0) body.unsearched = unsearched;
  return body;
}

// Returns null when no endpoint knows the transaction
async function lookupByTx(cfg, txHash) {
  // Pruned nodes answer "not found" for old transactions, so each endpoint is asked until one has it
  const receipt = await findReceipt(cfg, txHash);
  if (!receipt) return null;
  const proofs = proofsFromReceipt(cfg, receipt);
  return { tx: txHash, anchored: proofs.length > 0, proofs };
}

function proofsFromReceipt(cfg, receipt) {
  const allowed = registries(cfg);
  return parseEventLogs({ abi: [ANCHORED_EVENT], eventName: 'Anchored', logs: receipt.logs })
    .filter((log) => allowed.some((address) => sameAddress(address, log.address)))
    .map((log) => toProof(cfg, getAddress(log.address), log.args, receipt.transactionHash, receipt.blockNumber));
}

// ---------- handlers ----------

async function handleAnchor(request, env, origin) {
  const cfg = getConfig(env);
  if (!cfg.registry || !cfg.token || !cfg.rpcUrl) return json({ error: 'Service is not configured' }, 503);
  const clients = getClients(cfg);
  const price = await getPrice(cfg, clients.publicClient);

  const header = request.headers.get('payment-signature');
  if (!header) return paymentRequired(cfg, price, origin, 'PAYMENT-SIGNATURE header is required');
  if (request.method !== 'POST') return json({ error: 'Use POST with a JSON body: { "hash", "filename" }' }, 405);

  // Validate the request before touching the payment, so a bad request costs the agent nothing
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: 'Body must be JSON: { "hash": "<sha256 hex>", "filename": "<optional>" }' }, 400);
  }
  const hash = normalizeHash(body && body.hash);
  if (!hash) return json({ error: 'hash must be a SHA-256 digest: 64 hex characters' }, 400);
  const filename = normalizeFilename(body.filename);
  if (filename === null) return json({ error: 'filename may contain a-z 0-9 - _ . only' }, 400);

  let payment;
  try {
    payment = decodeHeader(header);
  } catch (_) {
    return json({ error: 'invalid_payload' }, 400);
  }

  const sale = await sellAnchor(cfg, clients, price, hash, filename, payment, `${cfg.publicUrl || origin}/proof`);
  if (sale.required) return paymentRequired(cfg, sale.price, origin, sale.required, sale.settlement);
  const headers = sale.settlement ? { 'payment-response': encodeHeader(sale.settlement) } : {};
  return json(sale.body, sale.status, headers);
}

// Check the payment, send the transaction and describe the outcome, for the HTTP and the MCP transport alike.
// Returns { required: <x402 error>, price, settlement? } when a payment is still owed,
// otherwise { status, body, settlement? }.
async function sellAnchor(cfg, clients, price, hash, filename, payment, lookupUrl) {
  const checked = checkPayment(payment, cfg, price, Math.floor(Date.now() / 1000));
  if (checked.error) return { required: checked.error, price };
  const { auth } = checked;

  if (!clients.walletClient) return { status: 503, body: { error: 'Service is not configured' } };

  const failure = (errorReason) => ({ success: false, errorReason, transaction: '', network: cfg.network, payer: auth.from });
  let result;
  try {
    result = await settle(cfg, clients, hash, filename, auth);
  } catch (err) {
    console.error('anchor settle error', revertReason(err));
    return { status: 500, body: { error: 'unexpected_settle_error' }, settlement: failure('unexpected_settle_error') };
  }

  if (result.error) {
    if (result.status === 402) {
      // The contract price may have changed since it was quoted
      const current = await getPrice(cfg, clients.publicClient, true);
      return { required: result.error, price: current, settlement: failure(result.error) };
    }
    const extra = result.error === 'payment_already_used' ? { lookup: `${lookupUrl}?hash=${hash}` } : {};
    return { status: result.status, body: { error: result.error, ...extra }, settlement: failure(result.error) };
  }

  const { txHash, receipt } = result.sent;
  if (receipt && receipt.status !== 'success') {
    // Reverted on-chain: the payment reverted with it
    return { required: 'invalid_transaction_state', price, settlement: failure('invalid_transaction_state') };
  }
  const settlement = {
    success: true,
    transaction: txHash,
    network: cfg.network,
    payer: auth.from,
    amount: auth.value.toString(),
  };
  if (!receipt) {
    // Broadcast, but no endpoint has reported it mined yet
    return {
      status: 200,
      body: {
        ok: true,
        status: 'submitted',
        hash,
        filename,
        submitter: auth.from,
        chain: cfg.name,
        chainId: cfg.chainId,
        contract: cfg.registry,
        txHash,
        explorerUrl: cfg.explorer ? `${cfg.explorer}/tx/${txHash}` : null,
        certificateUrl: certificateUrl(cfg, txHash),
        lookup: `${lookupUrl}?tx=${txHash}`,
      },
      settlement,
    };
  }
  const proof = proofsFromReceipt(cfg, receipt)[0];
  return { status: 200, body: { ok: true, status: 'confirmed', ...proof }, settlement };
}

async function handleProof(request, env) {
  const cfg = getConfig(env);
  if (!cfg.rpcUrl || registries(cfg).length === 0) return json({ error: 'Service is not configured' }, 503);
  const { publicClient } = getClients(cfg);
  const url = new URL(request.url);
  const hashParam = url.searchParams.get('hash');
  const txParam = url.searchParams.get('tx');

  if (txParam) {
    if (!TX_HASH.test(txParam)) return json({ error: 'tx must be a transaction hash: 0x + 64 hex characters' }, 400);
    const found = await lookupByTx(cfg, txParam);
    if (!found) return json({ tx: txParam, anchored: false, proofs: [] }, 404);
    return json(found, found.anchored ? 200 : 404);
  }

  const hash = normalizeHash(hashParam);
  if (!hash) return json({ error: 'Expected ?hash=<sha256 hex> or ?tx=<transaction hash>' }, 400);
  return json(await lookupByHash(cfg, publicClient, hash), 200, { 'cache-control': 'public, max-age=30' });
}

async function handleIndex(env, origin) {
  const cfg = getConfig(env);
  const base = cfg.publicUrl || origin;
  let price = null;
  if (cfg.registry && cfg.rpcUrl) {
    try {
      price = (await getPrice(cfg, getClients(cfg).publicClient)).toString();
    } catch (_) {}
  }
  return json({
    name: 'Akashi Notari',
    description:
      'Proof of existence for any file. Send the SHA-256 hash; it is written on-chain and the block time becomes the proof. The file never leaves its owner.',
    website: 'https://akashi-notari.com/',
    passport: 'https://github.com/self-reality/verifier/blob/main/PASSPORT.md',
    payment: { protocol: 'x402', version: X402_VERSION, network: cfg.network, asset: cfg.token, price, payTo: cfg.registry },
    endpoints: {
      'POST /anchor': 'Paid. Body { "hash": "<sha256 hex>", "filename": "<optional>" }. Returns the transaction hash and a certificate link.',
      'GET /proof?hash=<sha256 hex>': 'Free. Whether this hash is anchored, and its first proof.',
      'GET /proof?tx=<transaction hash>': 'Free. The proof written by this transaction.',
      'POST /mcp': 'MCP server (Streamable HTTP). Tools: find_proof (free), anchor_hash (paid with x402).',
      'GET /openapi.json': 'Free. OpenAPI description of this service.',
      'GET /.well-known/x402': 'Free. x402 discovery document.',
      'GET /.well-known/agent-registration.json': 'Free. ERC-8004 agent registration file.',
      'GET /llms.txt': 'Free. This service described for language models.',
      'GET /health': 'Free. Liveness.',
    },
    endpointUrls: { anchor: `${base}/anchor`, proof: `${base}/proof`, mcp: `${base}/mcp`, openapi: `${base}/openapi.json` },
  });
}

// OpenAPI is the discovery format directories such as x402scan read before they probe /anchor
async function handleOpenApi(env, origin) {
  const cfg = getConfig(env);
  const base = cfg.publicUrl || origin;
  let amount = '0.010000';
  if (cfg.registry && cfg.rpcUrl) {
    try {
      // x-payment-info wants decimal USD
      amount = usd(await getPrice(cfg, getClients(cfg).publicClient));
    } catch (_) {}
  }
  const proofSchema = {
    type: 'object',
    properties: {
      hash: { type: 'string' },
      filename: { type: 'string' },
      submitter: { type: 'string', description: 'Address that paid for the anchor' },
      timestamp: { type: 'integer', description: 'Block time, Unix seconds' },
      timestampIso: { type: 'string' },
      paid: { type: 'string', description: 'Fee in atomic units of `currency`' },
      currency: { type: 'string', enum: ['USDC', 'ETH'] },
      chain: { type: 'string' },
      chainId: { type: 'integer' },
      contract: { type: 'string' },
      txHash: { type: 'string' },
      blockNumber: { type: 'integer' },
      explorerUrl: { type: ['string', 'null'] },
      certificateUrl: { type: ['string', 'null'], description: 'Page where a person can view and download the PDF certificate' },
    },
    required: ['hash', 'txHash', 'timestamp'],
  };
  return json({
    openapi: '3.1.0',
    info: {
      title: 'Akashi Notari',
      version: '1.1.0',
      contact: { name: 'Akashi Notari', url: 'https://github.com/self-reality/verifier/issues' },
      description:
        'Proof of existence for any file. The SHA-256 hash is written on-chain on Base and the block time becomes the proof. The file never leaves its owner.',
      'x-guidance':
        'Compute the SHA-256 of the file locally and POST /anchor with JSON { "hash": "<64 hex chars>", "filename": "<optional>" } to timestamp it on Base; pay with x402 (USDC on Base). The response holds txHash and certificateUrl, a page where a person can download a PDF certificate. Before paying, call GET /proof?hash=<64 hex chars> for free to see whether the hash is already anchored and when. Never send the file itself. An MCP server with the same two actions is at /mcp.',
    },
    servers: [{ url: base }],
    paths: {
      '/anchor': {
        post: {
          operationId: 'anchor',
          summary: 'Anchor - write a SHA-256 file hash on-chain as a timestamped proof of existence',
          tags: ['Notary'],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount },
            protocols: [{ x402: {} }],
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    hash: {
                      type: 'string',
                      pattern: '^(0x)?[0-9a-fA-F]{64}$',
                      description: 'SHA-256 of the file, 64 hex characters',
                      example: EXAMPLE_HASH,
                    },
                    filename: {
                      type: 'string',
                      maxLength: 128,
                      description: 'Optional name to record with the hash: a-z 0-9 - _ .',
                      example: 'report.pdf',
                    },
                  },
                  required: ['hash'],
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Anchored. The proof, with the transaction hash and a certificate link',
              content: {
                'application/json': {
                  schema: { ...proofSchema, properties: { ok: { type: 'boolean' }, ...proofSchema.properties } },
                },
              },
            },
            402: { description: 'Payment Required' },
          },
        },
      },
      '/proof': {
        get: {
          operationId: 'proof',
          summary: 'Proof - look up the proofs of a file hash, or the proof written by a transaction',
          tags: ['Notary'],
          security: [],
          parameters: [
            { name: 'hash', in: 'query', required: false, schema: { type: 'string' }, description: 'SHA-256 of the file, 64 hex characters' },
            { name: 'tx', in: 'query', required: false, schema: { type: 'string' }, description: 'Transaction hash; use instead of hash' },
          ],
          responses: {
            200: {
              description: 'Whether the hash is anchored, and its proofs, earliest first',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      anchored: { type: 'boolean' },
                      proofs: { type: 'array', items: proofSchema },
                      searched: { type: 'array', items: { type: 'string' }, description: 'Contracts that were searched' },
                      unsearched: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Contracts that could not be searched this time; present only when the answer is partial',
                      },
                    },
                    required: ['anchored', 'proofs'],
                  },
                },
              },
            },
          },
        },
      },
      '/health': {
        get: {
          operationId: 'health',
          summary: 'Health check',
          security: [],
          responses: { 200: { description: 'OK' } },
        },
      },
    },
  });
}


// ---------- discovery ----------

const SERVICE_DESCRIPTION =
  'Proof of existence for any file. Send the SHA-256 hash; it is written on-chain on Base and the block time becomes the proof. The file never leaves its owner.';

// The list x402 directories read when a site has no OpenAPI document, or next to it
function handleX402Discovery(env, origin) {
  const cfg = getConfig(env);
  const base = cfg.publicUrl || origin;
  return json({
    version: 1,
    x402Version: X402_VERSION,
    resources: [`${base}/anchor`],
    instructions: `POST ${base}/anchor with JSON { "hash": "<sha256, 64 hex chars>", "filename": "<optional>" }. GET ${base}/proof?hash=<sha256> is free. Full description: ${base}/openapi.json`,
  });
}

// ERC-8004 registration file. AGENT_REGISTRATIONS holds the on-chain identities once the agent is registered.
function handleAgentRegistration(env, origin) {
  const cfg = getConfig(env);
  const base = cfg.publicUrl || origin;
  let registrations = [];
  try {
    registrations = JSON.parse(env.AGENT_REGISTRATIONS || '[]');
  } catch (_) {}
  return json({
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'Akashi Notari',
    description: `${SERVICE_DESCRIPTION} One anchor is paid with x402 in USDC on Base; lookups are free.`,
    services: [
      { name: 'web', endpoint: 'https://akashi-notari.com/' },
      { name: 'MCP', endpoint: `${base}/mcp`, version: MCP_VERSIONS[0] },
      { name: 'OpenAPI', endpoint: `${base}/openapi.json`, version: '3.1.0' },
    ],
    x402Support: true,
    active: true,
    registrations,
    supportedTrust: [],
  });
}

async function handleLlmsTxt(env, origin) {
  const cfg = getConfig(env);
  const base = cfg.publicUrl || origin;
  let price = 'see /';
  if (cfg.registry && cfg.rpcUrl) {
    try {
      price = `${usd(await getPrice(cfg, getClients(cfg).publicClient))} USDC`;
    } catch (_) {}
  }
  const text = `# Akashi Notari

> ${SERVICE_DESCRIPTION}

A proof shows that a file with this hash existed at the block time. It says nothing about the content or its legal validity. The hash, the filename and the payer's address become public and permanent.

## Use

- Compute the SHA-256 of the file locally. Never send the file.
- [Check a hash](${base}/proof): GET /proof?hash=<64 hex chars>, free. Call it before paying.
- [Anchor a hash](${base}/anchor): POST /anchor with JSON { "hash": "<64 hex chars>", "filename": "<optional>" }. Costs ${price} per anchor, paid with x402 on Base (${cfg.network}). The response holds txHash and certificateUrl.
- [Read a proof by transaction](${base}/proof): GET /proof?tx=<transaction hash>, free.

## Interfaces

- [OpenAPI](${base}/openapi.json): the HTTP API
- [MCP](${base}/mcp): Streamable HTTP server with the tools find_proof and anchor_hash
- [x402 discovery](${base}/.well-known/x402)
- [Agent registration](${base}/.well-known/agent-registration.json): ERC-8004

## More

- [Website](https://akashi-notari.com/): the same service for people, with PDF certificates
- [Project card](https://github.com/self-reality/verifier/blob/main/PASSPORT.md): contract addresses and direct on-chain calls
`;
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8', ...corsHeaders() } });
}

// A seal: directories show it next to the listing
const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#27408b"/><circle cx="32" cy="32" r="17" fill="none" stroke="#fff" stroke-width="5"/><circle cx="32" cy="32" r="6" fill="#fff"/></svg>';

function handleFavicon() {
  return new Response(FAVICON_SVG, {
    headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400', ...corsHeaders() },
  });
}

// ---------- MCP ----------

// Newest first. The server holds no session, so every request stands alone.
const MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const X402_PAYMENT_META = 'x402/payment';
const X402_RESPONSE_META = 'x402/payment-response';

const HASH_INPUT = { type: 'string', pattern: '^(0x)?[0-9a-fA-F]{64}$', description: 'SHA-256 of the file, 64 hex characters' };

const MCP_TOOLS = [
  {
    name: 'find_proof',
    title: 'Find a proof of existence',
    description:
      'Free. Look up whether a file hash is anchored on Base and when, or read the proof written by a transaction. Pass `hash` or `tx`. Call it before anchor_hash to avoid paying for a hash that is already anchored.',
    inputSchema: {
      type: 'object',
      properties: {
        hash: HASH_INPUT,
        tx: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$', description: 'Transaction hash; use instead of hash' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'anchor_hash',
    title: 'Anchor a file hash',
    description:
      'Paid with x402 (USDC on Base). Writes the SHA-256 hash of a file on-chain; the block time becomes the proof of existence. Compute the hash locally and never send the file. The hash, the filename and the payer address become public and permanent. Without a payment in _meta["x402/payment"] the result is the payment requirement.',
    inputSchema: {
      type: 'object',
      properties: {
        hash: HASH_INPUT,
        filename: { type: 'string', maxLength: 128, description: 'Optional name to record with the hash: a-z 0-9 - _ .' },
      },
      required: ['hash'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
];

function toolResult(value, isError = false, meta) {
  const result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
  if (isError) result.isError = true;
  if (meta) result._meta = meta;
  return result;
}

async function mcpFindProof(cfg, args) {
  const { publicClient } = getClients(cfg);
  if (args.tx !== undefined) {
    if (typeof args.tx !== 'string' || !TX_HASH.test(args.tx)) {
      return toolResult({ error: 'tx must be a transaction hash: 0x + 64 hex characters' }, true);
    }
    return toolResult((await lookupByTx(cfg, args.tx)) || { tx: args.tx, anchored: false, proofs: [] });
  }
  const hash = normalizeHash(args.hash);
  if (!hash) return toolResult({ error: 'Pass hash (SHA-256, 64 hex characters) or tx (transaction hash)' }, true);
  return toolResult(await lookupByHash(cfg, publicClient, hash));
}

// x402 over MCP: the payment travels in _meta, and a missing or refused payment is a tool error that carries the terms
async function mcpAnchorHash(cfg, args, meta, origin) {
  if (!cfg.registry || !cfg.token) return toolResult({ error: 'Service is not configured' }, true);
  const hash = normalizeHash(args.hash);
  if (!hash) return toolResult({ error: 'hash must be a SHA-256 digest: 64 hex characters' }, true);
  const filename = normalizeFilename(args.filename);
  if (filename === null) return toolResult({ error: 'filename may contain a-z 0-9 - _ . only' }, true);

  const clients = getClients(cfg);
  const price = await getPrice(cfg, clients.publicClient);
  const required = (amount, error, settlement) =>
    toolResult(
      paymentRequiredBody(cfg, amount, 'mcp://tool/anchor_hash', error),
      true,
      settlement ? { [X402_RESPONSE_META]: settlement } : undefined
    );

  const payment = meta && meta[X402_PAYMENT_META];
  if (!payment) return required(price, 'Payment required to anchor a hash');

  const sale = await sellAnchor(cfg, clients, price, hash, filename, payment, `${cfg.publicUrl || origin}/proof`);
  if (sale.required) return required(sale.price, sale.required, sale.settlement);
  return toolResult(sale.body, sale.status !== 200, sale.settlement ? { [X402_RESPONSE_META]: sale.settlement } : undefined);
}

// Answers one JSON-RPC message; returns null for a notification
async function mcpMessage(message, env, origin) {
  const isRequest = message && typeof message === 'object' && message.id !== undefined && message.id !== null;
  const reply = (result) => ({ jsonrpc: '2.0', id: message.id, result });
  const fail = (code, text) => ({ jsonrpc: '2.0', id: isRequest ? message.id : null, error: { code, message: text } });

  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return fail(-32600, 'Invalid Request');
  if (!isRequest) return null;

  const params = message.params || {};
  switch (message.method) {
    case 'initialize':
      return reply({
        protocolVersion: MCP_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : MCP_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'akashi-notari', title: 'Akashi Notari', version: '1.1.0' },
        instructions:
          'Proof of existence for files. Compute the SHA-256 of the file locally; never send the file. find_proof is free. anchor_hash costs a small USDC fee on Base, paid with x402.',
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: MCP_TOOLS });
    case 'tools/call': {
      const cfg = getConfig(env);
      const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      try {
        if (params.name === 'find_proof') return reply(await mcpFindProof(cfg, args));
        if (params.name === 'anchor_hash') return reply(await mcpAnchorHash(cfg, args, params._meta, origin));
      } catch (err) {
        console.error('mcp tool error', { tool: params.name, msg: revertReason(err).slice(0, 500) });
        return reply(toolResult({ error: 'Upstream error' }, true));
      }
      return fail(-32602, `Unknown tool: ${params.name}`);
    }
    default:
      return fail(-32601, `Method not found: ${message.method}`);
  }
}

async function handleMcp(request, env, origin) {
  // No server-initiated stream: POST is the whole transport
  if (request.method !== 'POST') {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Use POST with a JSON-RPC message' } }, 405, { allow: 'POST, OPTIONS' });
  }
  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  if (Array.isArray(payload)) {
    const replies = (await Promise.all(payload.map((message) => mcpMessage(message, env, origin)))).filter(Boolean);
    return replies.length > 0 ? json(replies) : new Response(null, { status: 202, headers: corsHeaders() });
  }
  const answer = await mcpMessage(payload, env, origin);
  return answer ? json(answer) : new Response(null, { status: 202, headers: corsHeaders() });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
    const limitPerMin = parseInt(env.RATE_LIMIT_PER_MIN || '60', 10);
    if (isRateLimited(ip, limitPerMin, 60_000)) {
      return json({ error: 'Too Many Requests' }, 429);
    }

    try {
      if (url.pathname === '/health') return json({ ok: true });
      if (url.pathname === '/') return await handleIndex(env, url.origin);
      if (url.pathname === '/openapi.json') return await handleOpenApi(env, url.origin);
      if (url.pathname === '/anchor') return await handleAnchor(request, env, url.origin);
      if (url.pathname === '/proof') return await handleProof(request, env);
      if (url.pathname === '/mcp') return await handleMcp(request, env, url.origin);
      if (url.pathname === '/.well-known/x402') return handleX402Discovery(env, url.origin);
      if (url.pathname === '/.well-known/agent-registration.json') return handleAgentRegistration(env, url.origin);
      if (url.pathname === '/llms.txt') return await handleLlmsTxt(env, url.origin);
      if (url.pathname === '/favicon.svg' || url.pathname === '/favicon.ico') return handleFavicon();
    } catch (err) {
      console.error('anchor worker error', { path: url.pathname, msg: revertReason(err) });
      return json({ error: 'Upstream error' }, 502);
    }

    return json({ error: 'Not Found' }, 404);
  },
};
