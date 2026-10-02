---
passport: 1
project: akashi-notari
name: Akashi Notari
path: /Volumes/Smartbuy/Projects/Akashi Notary/Verifier
status: active
updated: 2026-10-02
site: https://akashi-notari.com/
repo: https://github.com/self-reality/verifier
---

# Akashi Notari

Proof of existence for any file: the file's SHA-256 hash is written to the
`VerifierRegistry` contract on Base, Ethereum or Optimism in one transaction,
and the block timestamp becomes the proof. The file stays with its owner; only
the hash and a filename go on-chain. Humans use the web app at
https://akashi-notari.com/; agents call the contract directly with any EVM
wallet.

## Status

2026-10-02 — the x402 anchor worker is deployed at
https://anchor.akashi-notari.com: `POST /anchor` quotes 0.01 USDC and
`/openapi.json` answers. `GET /proof` fails in production until the worker gets
a keyed RPC endpoint and an explorer API key; no paid anchor has been made on
mainnet yet. The work sits on branch `x402-usdc`, not merged.

2026-10-02 — `VerifierRegistryUSDC` is deployed and verified on Base at
`0xf738aD9256bf20C2Da3a5F1142D4e8549785dF21`: price 0.01 USDC, relayer
`0xf0E21361De4F97AdA748fDD1dD8dBbB698B7289e` allowed and funded.

2026-10-02 — live on Base, Ethereum and Optimism; web app and price feed
answer 200; 12 anchors on Base, the latest on 2025-11-14. Payment on the live
contract is ETH sent with the call. No MCP server or agent card yet.

## Entry points

| What | How |
| --- | --- |
| Web app (humans) | https://akashi-notari.com/ |
| Certificate page for a proof | `https://akashi-notari.com/certificate/?chain=<base\|ethereum\|optimism>&hash=<txHash>` |
| Web app, local | `cd web && npm run dev` |
| Contract tests | `cd contracts/registry && npx hardhat test` |
| Price-feed worker, local | `cd workers/price-feed && pnpm dev` |
| Anchor worker (x402), local | `cd workers/anchor && pnpm dev` |
| Anchor worker end-to-end test | `cd contracts/registry && npx hardhat node`, then `cd workers/anchor && pnpm test:e2e` |
| Deploy the USDC contract | `cd contracts/registry && RELAYER_ADDRESS=<address> pnpm hardhat run scripts/deploy-usdc.js --network <network>` |
| Deploy the anchor worker | `cd workers/anchor && npx wrangler deploy` |
| Apply the price or relayer from `scripts/config.json` | `cd contracts/registry && pnpm hardhat run scripts/manage-usdc.js --network <network>` |
| Deploy the contract | `cd contracts/registry && pnpm hardhat run scripts/deploy.js --network <network>` |
| Change fee bounds or owner | `cd contracts/registry && npx hardhat run scripts/manage.js --network <network>` |

## Interface

The actions below target Base mainnet (chain id 8453), contract
`0xeed9D0f7265892e84e43d05dA464c75add199260`. Ethereum uses the same address,
Optimism uses `0x859Fe07D2995875319b7e65592812392B16BBADe`; swap the address
and RPC URL to work there. Commands use Foundry `cast`, `curl` and `jq`; any
EVM client does the same job with the ABI in
`web/constants/VerifierRegistryABI.ts`.

Compute the hash locally first: `shasum -a 256 <file> | cut -d' ' -f1`. The
hash travels as a 64-character lowercase hex string with no `0x` prefix.

### feeQuote
- does: return how much ETH equals $1 right now, the base for the service fee
- call: `curl -s "https://price-feed.akashi-notari.com/api/usd-to-amount?ticker=ETH"`
- input: `ticker` (string: `ETH`, `POL` or `OP`; Base, Ethereum and Optimism all pay in `ETH`)
- output: `{ "ticker": "ETH", "priceUsd": 2716.65, "amountWei": "368100417793974" }` — `amountWei` is $1; the web app sends `amountWei * 48 / 100` ($0.48)
- writes: none
- confirm: none
- needs: nothing; 60 requests a minute per IP, answers cached for an hour

### feeBounds
- does: read the fee range the contract accepts
- call: `cast call 0xeed9D0f7265892e84e43d05dA464c75add199260 "maxFee()(uint256)" --rpc-url https://mainnet.base.org`
- input: none; `minFee()(uint256)` reads the lower bound the same way
- output: wei as a decimal integer; a transaction with `msg.value` outside `minFee..maxFee` reverts with `fee not met`
- writes: none
- confirm: none
- needs: a Base RPC URL

### anchor
- does: write a file's SHA-256 hash and filename on-chain, creating the proof of existence
- call: `cast send 0xeed9D0f7265892e84e43d05dA464c75add199260 "anchor(string,string)" <sha256hex> <filename> --value <feeWei> --rpc-url https://mainnet.base.org --private-key $AGENT_PRIVATE_KEY`
- input: `sha256hex` (string, 64 lowercase hex chars) · `filename` (string; lowercase `a-z 0-9 - _ .`, `~` is reserved) · `feeWei` (integer, from `feeQuote`, inside `feeBounds`)
- output: the transaction receipt; `transactionHash` is the proof id, and the contract emits `Anchored(cid, filename, submitter, timestamp, paid)`
- writes: one transaction on Base; spends `feeWei` plus gas (about 33,000 gas); the hash, the filename and the sender address become public and permanent
- confirm: required — spends funds and publishes a permanent record
- needs: a wallet with ETH on Base; the private key in `AGENT_PRIVATE_KEY`

### proofByTx
- does: read back a proof from its transaction hash
- call: `cast abi-decode --input "x(string,string,address,uint256,uint256)" $(cast receipt <txHash> --rpc-url https://mainnet.base.org --json | jq -r '.logs[] | select(.address=="0xeed9d0f7265892e84e43d05da464c75add199260") | .data')`
- input: `txHash` (string, `0x` + 64 hex)
- output: five lines — hash, filename, submitter address, Unix timestamp, fee paid in wei
- writes: none
- confirm: none
- needs: a Base RPC URL

### proofByHash
- does: find every proof of a given file hash on Base
- call: `curl -s "https://base.blockscout.com/api?module=logs&action=getLogs&fromBlock=37800000&toBlock=latest&address=0xeed9D0f7265892e84e43d05dA464c75add199260&topic0=0xee4bb5bb21d0486d2baa52a5fdb588a13c6b3a9120b0d14a99303ffd89695e51&topic1=$(cast keccak <sha256hex>)&topic0_1_opr=and"`
- input: `sha256hex` (string, 64 lowercase hex chars)
- output: `{ "result": [ { "transactionHash", "timeStamp" (hex Unix time), "data" } ] }`; an empty `result` means the hash has no proof on Base
- writes: none
- confirm: none
- needs: nothing; the Blockscout public API

## Payments

An agent pays in the chain's native token as `msg.value` of the `anchor`
call, so it holds ETH on Base for the fee and for gas. The web app charges
$0.48. The contract enforces `minFee..maxFee`; on Base those read `0` and
`1474000000000000` wei on 2026-10-02.

x402 is the open standard for agent payments over HTTP: the server answers
`402 Payment Required` with the price in a `PAYMENT-REQUIRED` header, the
client retries with a signed USDC authorization in `PAYMENT-SIGNATURE`, and
the server returns the result. The anchor worker in `workers/anchor` speaks
x402 v2 and settles each payment through `VerifierRegistryUSDC` in the same
transaction as the anchor, with no facilitator. `POST /anchor` and `GET /proof`
join the Interface once a paid anchor and the lookups are confirmed on mainnet.

## Agent hubs

- GitHub — this file at https://github.com/self-reality/verifier is the card to link from any hub
- Moltbook, agent forums and Discord — post the purpose paragraph and the `anchor` / `proofByHash` actions; the on-chain interface needs no listing approval
- x402scan — registers a URL that answers `402` with an x402 schema; open once the anchor worker is deployed
- x402 Bazaar — indexes endpoints whose payments Coinbase's facilitator settles; the anchor worker settles its own
- MCP registries — list MCP servers; open once the actions are wrapped as MCP tools
- ERC-8004 agent registries and A2A — read `/.well-known/agent-card.json`; the site serves none today

## Files

- `README.md` — the service described for humans, with contract addresses
- `contracts/registry/contracts/VerifierRegistry.sol` — the contract: `anchor`, `anchorCidOnly`, `anchorBytes32`, fee bounds
- `contracts/registry/constants.json` — deployed addresses and fee bounds per network
- `contracts/registry/contracts/VerifierRegistryUSDC.sol` — the USDC contract: `anchorWithAuthorization`, `anchor`, `anchorPaid`
- `contracts/registry/constants-usdc.json` — deployed USDC contract addresses
- `workers/anchor/README.md` — the x402 anchor API, its configuration and deployment steps
- `web/constants/VerifierRegistryABI.ts` — the ABI
- `web/pages/index.tsx` — the web flow; `FEE_CENTS` sets the fee the app sends
- `web/utils/txParser.ts` — how the certificate page decodes a proof
- `workers/price-feed/README.md` — the price-feed API
- `ARCHITECTURE.md` — components and hosting

## Conventions

- The file never leaves its owner; only the SHA-256 hash and a filename are published.
- The hash is a 64-character lowercase hex string without `0x`, the same form the web app writes; `proofByHash` matches on that exact string.
- A proof shows that a file with this hash existed at the block time. It says nothing about the content or its legal validity.
- Keep the original file byte-for-byte; a changed file gives a different hash.
- Private keys stay in environment variables.
