import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseEventLogs,
  decodeEventLog,
  encodeEventTopics,
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

// Defaults per chain; every field can be overridden with an env var
const NETWORKS = {
  8453: {
    name: 'base',
    rpcUrl: 'https://mainnet.base.org',
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
    registry: addressOrNull(env.REGISTRY_ADDRESS),
    legacyRegistry: addressOrNull(env.LEGACY_REGISTRY_ADDRESS || known.legacyRegistry),
    token: addressOrNull(env.TOKEN_ADDRESS || known.token),
    tokenName: env.TOKEN_NAME || known.tokenName,
    tokenVersion: env.TOKEN_VERSION || known.tokenVersion,
    explorer: env.EXPLORER_URL || known.explorer || '',
    logsApi: env.LOGS_API_URL !== undefined ? env.LOGS_API_URL : known.logsApi || '',
    logsFromBlock: BigInt(env.LOGS_FROM_BLOCK || known.logsFromBlock || 0),
    certificateUrl: env.CERTIFICATE_URL || 'https://akashi-notari.com/certificate/',
    certificateChain: env.CERTIFICATE_CHAIN || known.certificateChain || '',
    relayerKey: env.RELAYER_PRIVATE_KEY || '',
    publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
  };
}

function getClients(cfg) {
  const chain = defineChain({
    id: cfg.chainId,
    name: cfg.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
  const transport = http(cfg.rpcUrl);
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
    'access-control-allow-headers': 'content-type, payment-signature',
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

function paymentRequired(cfg, price, origin, error, settlement) {
  const body = {
    x402Version: X402_VERSION,
    error,
    resource: {
      url: `${cfg.publicUrl || origin}/anchor`,
      description: 'Proof of existence: write a SHA-256 file hash on-chain and get a certificate link',
      mimeType: 'application/json',
    },
    accepts: [paymentRequirements(cfg, price)],
    extensions: { bazaar: bazaarExtension() },
  };
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

// Concurrent requests share one relayer key, so a nonce can collide; retry the broadcast a few times
async function sendAndWait(clients, request) {
  let txHash;
  for (let attempt = 0; ; attempt++) {
    try {
      txHash = await clients.walletClient.writeContract(request);
      break;
    } catch (err) {
      if (attempt >= 2 || !/nonce|underpriced|already known/i.test(revertReason(err))) throw err;
      await sleep(400 * (attempt + 1));
    }
  }
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
  if (receipt.status !== 'success') throw new Error('transaction reverted');
  return receipt;
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

// Returns { receipt } on success, or { error, status } when the payment cannot be settled
async function settle(cfg, clients, hash, filename, auth) {
  const { publicClient, account } = clients;
  const base = { account, address: cfg.registry, abi: REGISTRY_ABI };
  let simulationError;
  try {
    const { request } = await publicClient.simulateContract({
      ...base,
      functionName: 'anchorWithAuthorization',
      args: [hash, filename, auth],
    });
    return { receipt: await sendAndWait(clients, request) };
  } catch (err) {
    simulationError = err;
  }

  const reason = revertReason(simulationError);
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
      const { request } = await publicClient.simulateContract({
        ...base,
        functionName: 'anchorPaid',
        args: [hash, filename, auth.from, auth.value, auth.nonce],
      });
      return { receipt: await sendAndWait(clients, request) };
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

async function proofsByHash(cfg, publicClient, hash) {
  const topics = encodeEventTopics({ abi: [ANCHORED_EVENT], eventName: 'Anchored', args: { cidIndex: hash } });
  const proofs = [];

  if (cfg.logsApi) {
    // An explorer API searches the whole chain; public RPC nodes limit eth_getLogs to a short block range
    for (const address of registries(cfg)) {
      const url =
        `${cfg.logsApi}?module=logs&action=getLogs&fromBlock=${cfg.logsFromBlock}&toBlock=latest` +
        `&address=${address}&topic0=${topics[0]}&topic1=${topics[1]}&topic0_1_opr=and`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`logs api ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data.result) ? data.result : [];
      for (const row of rows) {
        const decoded = decodeEventLog({ abi: [ANCHORED_EVENT], data: row.data, topics: row.topics.filter(Boolean) });
        proofs.push(toProof(cfg, getAddress(row.address), decoded.args, row.transactionHash, BigInt(row.blockNumber)));
      }
    }
  } else {
    const logs = await publicClient.getLogs({
      address: registries(cfg),
      event: ANCHORED_EVENT,
      args: { cidIndex: hash },
      fromBlock: cfg.logsFromBlock,
      toBlock: 'latest',
    });
    for (const log of logs) {
      proofs.push(toProof(cfg, getAddress(log.address), log.args, log.transactionHash, log.blockNumber));
    }
  }

  return proofs.sort((a, b) => a.timestamp - b.timestamp);
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
  const checked = checkPayment(payment, cfg, price, Math.floor(Date.now() / 1000));
  if (checked.error) return paymentRequired(cfg, price, origin, checked.error);
  const { auth } = checked;

  if (!clients.walletClient) return json({ error: 'Service is not configured' }, 503);

  const failure = (errorReason) => ({ success: false, errorReason, transaction: '', network: cfg.network, payer: auth.from });
  let result;
  try {
    result = await settle(cfg, clients, hash, filename, auth);
  } catch (err) {
    console.error('anchor settle error', revertReason(err));
    return json({ error: 'unexpected_settle_error' }, 500, { 'payment-response': encodeHeader(failure('unexpected_settle_error')) });
  }

  if (result.error) {
    if (result.status === 402) {
      // The contract price may have changed since it was quoted
      const current = await getPrice(cfg, clients.publicClient, true);
      return paymentRequired(cfg, current, origin, result.error, failure(result.error));
    }
    const extra = result.error === 'payment_already_used' ? { lookup: `${cfg.publicUrl || origin}/proof?hash=${hash}` } : {};
    return json({ error: result.error, ...extra }, result.status, { 'payment-response': encodeHeader(failure(result.error)) });
  }

  const { receipt } = result;
  const proof = proofsFromReceipt(cfg, receipt)[0];
  const settlement = {
    success: true,
    transaction: receipt.transactionHash,
    network: cfg.network,
    payer: auth.from,
    amount: auth.value.toString(),
  };
  return json({ ok: true, ...proof }, 200, { 'payment-response': encodeHeader(settlement) });
}

async function handleProof(request, env) {
  const cfg = getConfig(env);
  if (!cfg.rpcUrl || registries(cfg).length === 0) return json({ error: 'Service is not configured' }, 503);
  const { publicClient } = getClients(cfg);
  const url = new URL(request.url);
  const hashParam = url.searchParams.get('hash');
  const txParam = url.searchParams.get('tx');

  if (txParam) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txParam)) return json({ error: 'tx must be a transaction hash: 0x + 64 hex characters' }, 400);
    let receipt;
    try {
      receipt = await publicClient.getTransactionReceipt({ hash: txParam });
    } catch (_) {
      return json({ tx: txParam, anchored: false, proofs: [] }, 404);
    }
    const proofs = proofsFromReceipt(cfg, receipt);
    return json({ tx: txParam, anchored: proofs.length > 0, proofs }, proofs.length > 0 ? 200 : 404);
  }

  const hash = normalizeHash(hashParam);
  if (!hash) return json({ error: 'Expected ?hash=<sha256 hex> or ?tx=<transaction hash>' }, 400);
  const proofs = await proofsByHash(cfg, publicClient, hash);
  return json({ hash, anchored: proofs.length > 0, proofs }, 200, { 'cache-control': 'public, max-age=30' });
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
      'GET /proof?hash=<sha256 hex>': 'Free. Every proof of this hash, earliest first.',
      'GET /proof?tx=<transaction hash>': 'Free. The proof written by this transaction.',
      'GET /openapi.json': 'Free. OpenAPI description of this service.',
      'GET /health': 'Free. Liveness.',
    },
    endpointUrls: { anchor: `${base}/anchor`, proof: `${base}/proof` },
  });
}

// OpenAPI is the discovery format directories such as x402scan read before they probe /anchor
async function handleOpenApi(env, origin) {
  const cfg = getConfig(env);
  const base = cfg.publicUrl || origin;
  let amount = '0.500000';
  if (cfg.registry && cfg.rpcUrl) {
    try {
      // The token has 6 decimals; x-payment-info wants decimal USD
      const price = await getPrice(cfg, getClients(cfg).publicClient);
      amount = `${price / 1_000_000n}.${(price % 1_000_000n).toString().padStart(6, '0')}`;
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
      version: '1.0.0',
      description:
        'Proof of existence for any file. The SHA-256 hash is written on-chain on Base and the block time becomes the proof. The file never leaves its owner.',
      'x-guidance':
        'Compute the SHA-256 of the file locally and POST /anchor with JSON { "hash": "<64 hex chars>", "filename": "<optional>" } to timestamp it on Base; pay with x402 (USDC on Base). The response holds txHash and certificateUrl, a page where a person can download a PDF certificate. Before paying, call GET /proof?hash=<64 hex chars> for free to see whether the hash is already anchored and when. Never send the file itself.',
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
              description: 'Whether the hash is anchored, and every proof, earliest first',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { anchored: { type: 'boolean' }, proofs: { type: 'array', items: proofSchema } },
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
    } catch (err) {
      console.error('anchor worker error', { path: url.pathname, msg: revertReason(err) });
      return json({ error: 'Upstream error' }, 502);
    }

    return json({ error: 'Not Found' }, 404);
  },
};
