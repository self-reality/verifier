## Verifier — High‑Level Implementation Plan (Component‑First, MVP without NFT)

This plan delivers working components incrementally. Each step ends with a deployed, testable artifact and a short verification checklist. The first milestone is an MVP that writes `CID` and `filename` on‑chain using a simple registry contract (no NFT). NFT minting and the metadata/thumbnail service are post‑MVP.

### Guiding Approach
- **Order**: Price Feed → Smart Contract (non‑NFT) → Frontend → Deploy → Hardening → Post‑MVP NFT.
- **Proof before progress**: Each component must be runnable and verified (via curl, unit tests, or testnet) before starting the next.
- **Privacy**: Client‑only hashing and CID computation; no user files leave the browser.
- **Simplicity & cost**: One on‑chain write per verification; target ~\$1 on low‑fee networks.

### Target Environments
- **Networks**: Base Sepolia (dev/test), Base mainnet (prod later).
- **Cloud**: Cloudflare Pages (frontend), Cloudflare Workers (services).
- **RPC**: Alchemy/Infura/Ankr/QuickNode for reads; writes via user wallet.

---

## Milestone 0 — Repo & CI Bootstrap (Fast)
Scope:
- Establish repo structure and tooling for quick iteration.

Deliverables:
- Directory layout: `workers/price-feed`, `contracts/registry`, `web/`.
- CI: build, lint, test on PRs; deploy previews for `workers` and `web`.
- Wrangler setup for Workers, Hardhat for contracts, Next.js for web.

Verification:
- CI passes on an empty scaffold; `wrangler dev` runs locally; `hardhat test` runs.

---

## Milestone 1 — Price Feed Service (Cloudflare Worker)
Goal: Convert USD amounts to native token amounts for supported networks.

Scope:
- Worker with single endpoint (CDN‑cached with configurable TTL, default 1 hour):
  - `GET /api/usd-to-amount?usd=1&chainId=8453` → `{ amountWei }` for the native token amount.
- Upstream(s): public market APIs; configurable via env; graceful fallback; basic rate limiting.
- Observability: request logs; simple health endpoint `GET /health`.
 - Access control: CORS allowlist (our domain only); optional API key whitelist; no public `workers.dev`.

Deliverables:
- Deployed Worker URL (e.g., `https://price.<your-domain>/api/usd-to-amount`).
- Short README with expected query params and response schema.

Verification (must pass before M2):
- `curl` responses are valid and timely (<500ms cached).
- TTL respected, fallback works (simulate primary outage).
- Load test (quick): 50 RPS for 60s without errors or bans.

---

## Milestone 2 — Smart Contract v0: Verifier Registry (Non‑NFT MVP)
Goal: Minimal on‑chain anchor storing `CID` and normalized `filename` per submission.

Scope:
- Contract `VerifierRegistry` with:
  - `function anchor(string calldata cid, string calldata filename) external` that writes an entry and emits an event.
  - Entry model: `submitter`, `cid`, `filename`, `timestamp`. Keep storage minimal.
  - Event: `Anchored(address indexed submitter, string cid, string filename, uint256 timestamp)`.
- Tests: happy path, gas bounds, input validation (length/format for filename), reentrancy non‑issue.
- Deployment script to Base Sepolia; record address in `contracts/addresses.json`.

Deliverables:
- Contract repo with unit tests and gas report.
- Verified deployment on Base Sepolia; explorer link and ABI artifact.

Verification (must pass before M3):
- Unit tests green; gas cost within target (~<$0.50 on Base Sepolia as proxy).
- Manual tx via script or `cast/send` writes an entry; event visible in explorer.
- Readback helper (view function or event filter) returns inserted data.

---

## Milestone 3 — Frontend MVP (No NFT)
Goal: End‑to‑end user flow: upload file, compute hash and IPFS CID client‑side, preview, connect wallet, write `CID`+`filename` to `VerifierRegistry`, show confirmation.

Scope:
- Stack: Next.js (TS) + `wagmi`/`viem`; minimal UI with Tailwind or CSS.
- Client crypto:
  - Chunked hashing with Web Crypto API and progress.
  - Deterministic IPFS CID computation matching official behavior.
- Filename normalization: `slugFilename` rules (lowercase, `a-z 0-9 - _ .`, collapse `-`, trim `-`/`.`, preserve extension, forbid `~`).
- Price UI: fetch from Price Feed Worker to convert USD to native token amount for optional fee (fee can be 0 in MVP).
- Transaction: call `registry.anchor(cid, slugFilename)`; track pending → mined; show explorer link.
- PDF (minimum viable): generate a simple client‑side PDF receipt with wallet, network, `filename`, `CID`, tx hash, QR to explorer.

Deliverables:
- Deployed site on Cloudflare Pages (dev env).
- `.env` with Base Sepolia RPC, contract address, price feed URL.

Verification (must pass before M4):
- Happy path works on Base Sepolia end‑to‑end with a real wallet.
- CID determinism: sample file produces same CID across refreshes and via reference tool.
- UI shows cost estimate; PDF downloads and contains correct fields.

---

## Milestone 4 — Hardening, Docs, and Production Readiness
Goal: Make the MVP robust and ready for mainnet traffic.

Scope:
- Error states and retries (upload swap, wallet reject, tx fail).
- Accessibility checks, mobile layout, performance budget.
- Analytics/Sentry (no file contents or PII).
- Security headers via Cloudflare; content security policy tightened.
- Smoke tests and runbooks; status page links.

Deliverables:
- Playbook: how to verify end‑to‑end after deploy, how to roll back.
- Tagged release for prod cutover plan.

Verification:
- Canary deploy; manual smoke test; no P0 issues for 48h on test.

---

## Post‑MVP Roadmap — NFT and Metadata Service
These items come after the MVP is live and stable.

### Milestone N1 — Upgrade to ERC‑721 `VerifierCertificate`
Scope:
- Introduce NFT contract that stores/anchors `CID` and `filename` at mint; emits event.
- Deterministic `tokenURI` derived from `slugFilename~cid`.
- Migration plan: existing MVP entries remain valid; NFT is an additive path.

Verification:
- Test mint on Base Sepolia; wallets display token with placeholder metadata.

### Milestone N2 — NFT Metadata & Thumbnail Service (Worker)
Scope:
- Worker endpoints:
  - `GET https://metadata.<domain>/:slug` → ERC‑721 metadata JSON
  - `GET https://metadata.<domain>/:slug/image.png` → PNG‑8 image with filename, CID, QR to `external_url`
- CDN caching; optional KV/R2 cache for rendered images.
- Keep parity with client‑side preview rendering.

Verification:
- Wallets fetch and render metadata and image correctly.
- Lighthouse/Perf acceptable; images under target size.

### Milestone N3 — Frontend Upgrade for NFT Flow
Scope:
- Toggle to choose Registry (MVP) vs NFT mint path.
- Display owned certificates; add shareable links.

Verification:
- E2E tests cover both flows; no regressions to MVP path.

---

## Acceptance Checklists (Summarized)
- M1 Price Feed: deployed Worker; correct JSON; stable under burst; documented.
- M2 Registry: tests pass; deployed; event visible; readback works.
- M3 Frontend: deterministic CID; tx success; PDF receipt; cost estimate shown.
- M4 Hardening: accessibility, performance, instrumentation, security headers, playbook.

## Risks & Mitigations
- Upstream price API limits → multiple providers, caching, exponential backoff.
- Deterministic CID mismatch → align libraries/parameters with official IPFS; add tests with fixtures.
- Gas spikes → show live estimates; allow user retry or schedule later; support multiple L2s.
- Wallet UX friction → clear states, retries, keep file state across reconnects.

## What to Build First (TL;DR)
1) Price Feed Worker (prove: curl JSON fast & cached).
2) `VerifierRegistry` on Base Sepolia (prove: event visible, data retrievable).
3) Frontend MVP wiring hashing → CID → tx → receipt (prove: end‑to‑end flow works).
4) Harden and ship dev → prod.
5) Then add NFT + metadata service without blocking MVP.


