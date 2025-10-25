## Verifier — Architecture & Infrastructure (High-Level)

Privacy-preserving, client-only file hashing and CID computation with a single on-chain write. No user files leave the browser. Deliver a durable on-chain NFT certificate and a client-generated PDF report for ~\$1 total cost on low-fee EVM networks.

### Core Principles
- **Client-first privacy**: All hashing and IPFS CID computation in-browser; no file uploads to servers.
- **Minimal backend**: Static hosting. No databases or user state.
- **Single on-chain action**: One contract `mint/verify` call anchors proof-of-existence.
- **Low cost, high UX**: Target ~\$1 per verification (network dependent). Fast, simple flow.

### High-Level Components
1) **Frontend Web App (Browser SPA)**
   - Framework: React with Next.js (static export) or Vite + React. Recommendation: Next.js for conventions and future flexibility; deploy as static to edge.
   - Wallet & chain: `wagmi` + `viem` (or `ethers` v6). Wallets via MetaMask and WalletConnect.
   - Crypto + IPFS in-browser:
     - File hashing via Web Crypto API with chunked streaming and progress.
     - Deterministic IPFS CID (e.g., `multiformats`, `ipfs-unixfs`) matching official IPFS behavior.
   - Certificate UI: editable display filename (length-limited), show hash and CID. NFT `name` is set to this filename at mint time.
   - PDF generation: client-side (e.g., `pdf-lib`), include QR to explorer link.
   - QR codes: client-side generation (e.g., `qrcode`/`qrcode.react`).
   - No file uploads; only derived data (hash, CID, tx hash) are shown/stored on-chain.

2) **Smart Contract(s) — EVM**
   - Contract: `VerifierCertificate` (ERC-721 transferable).
   - Function: `mint` stores/anchors (file hash, IPFS CID, filename-as-name) and emits an event; token IDs are incremental (standard). A deterministic slug is computed on-chain from `filename + CID` to derive the tokenURI.
   - Addressing pattern: Deterministic deployment via CREATE2 to reuse the same address across networks.
   - Metadata: `tokenURI` is deterministic and points to `https://metadata.mysite.com/[Filename-and-CID-unique_token_link]`. `external_url` is `https://mysite.com/[Filename-and-CID-unique_token_link]`. The image includes a QR code linking to the same `external_url`.
   - Networks: Base as primary; other popular low-fee EVM networks (e.g., Polygon PoS, Arbitrum, Optimism) selectable.

3) **Ethereum Node Service (Read/Write RPC)**
   - Providers: Alchemy, Infura, Ankr, or QuickNode.
   - Usage:
     - Reads (contract state, confirmations) via app-configured RPC.
     - Writes are signed by the user wallet; the wallet/provider relays to the network.
   - Strategy: Primary provider per supported network + fallback public RPC if feasible.

4) **Cloudflare (CDN, Security, Hosting)**
   - DNS/TLS: Manage domain and certificates.
   - CDN & Caching: Cloudflare CDN in front of static site for performance.
   - Hosting: Cloudflare Pages for the static Next.js build.
   - Security: WAF, bot mitigation where appropriate; Turnstile on critical forms if ever added.

5) **Price Feed Service**
   - Purpose: Convert a fixed USD amount (e.g., $1 service fee) into the current network token amount and provide live USD estimates for gas and total cost.
   - Implementation: Cloudflare Worker that fetches and caches token prices from public market APIs with short TTL (30–60s), CDN‑cached. Optional on‑chain fallback via Chainlink feeds if needed later.
   - API: `GET /api/price?chainId=...&symbol=...` → `{ priceUsd, updatedAt }`; and `GET /api/usd-to-amount?usd=1&chainId=...` → `{ amountWei }` for the native gas token.
   - Privacy: No user data; only public market data.

6) **NFT Metadata & Thumbnail Service**
   - Purpose: Serve wallet‑friendly metadata JSON and a deterministic thumbnail image so wallets display a clean preview.
   - Implementation: Cloudflare Worker (or Pages Function) that constructs ERC‑721 metadata from the tokenURI slug alone (derived from `filename + CID`), and serves a PNG‑8 image that displays the filename, CID, and a QR to the `external_url`. No user files are stored or required.
   - Endpoints:
     - `GET https://metadata.mysite.com/:slug` → metadata JSON
     - `GET https://metadata.mysite.com/:slug/image.png` → PNG‑8 image
   - Caching: CDN cache by URL with revalidation; purge on mint or use short TTL.
   - Format: PNG‑8 only; SVG is not served for compatibility and security consistency.
   - Storage (optional): R2/KV for image render cache; no user files stored.

### End-to-End Flow
1. User opens the app (served via Cloudflare Pages/CDN).
2. User drops a file; browser streams/chunks to compute file hash and IPFS CID with progress.
3. User connects a wallet; app queries Price Feed to estimate gas, show USD total, and compute the $1 equivalent token amount (if a protocol fee applies).
4. User clicks Verify; dapp calls contract `mint` via wallet provider.
5. As soon as tx hash is available, the app generates a PDF report (includes wallet, network, filename, hash, CID, tx hash, explorer link, QR).
6. App waits for confirmation via RPC; on success shows certificate state and download links. Wallets and explorers fetch metadata/thumbnail from the NFT service.

```text
+-----------+        +--------------------+        +----------------+
|  Browser  |  RPC   |  Ethereum Node(s)  |  L1/2  |   EVM Network  |
|  (SPA)    +------->|  (Alchemy/Infura)  +------->|   (Base primary)|
+-----+-----+        +--------------------+        +--------+-------+
      |
      v
  Cloudflare Pages (static hosting + CDN)
```

Extended with services:

```text
+-----------+        +--------------------+        +----------------+
|  Browser  |  RPC   |  Ethereum Node(s)  |  L1/2  |   EVM Network  |
|  (SPA)    +------->|  (Alchemy/Infura)  +------->|   (Base primary)|
+-----+-----+        +--------------------+        +--------+-------+
      |                         ^
      |  HTTPS                  |  HTTPS (read)
      v                         |
Cloudflare Pages          NFT Metadata & Thumbnail
(static hosting + CDN) <-- Service (Worker) ------+
      |
      +--> Price Feed Service (Worker)
```

### Frontend Stack (Recommended)
- Next.js (App Router), TypeScript, TailwindCSS (or CSS-in-JS), Vite alternative acceptable.
- `wagmi` + `viem` (wallets, chain calls), WalletConnect, MetaMask.
- `multiformats`, `ipfs-unixfs` (CID computation), Web Crypto API for hashing with Web Workers.
- `pdf-lib` (PDF), `qrcode` (QR), `zod` (validation), `zustand` or `redux` (minimal state where needed).
- Price estimation: client fetches from Price Feed Worker (with fallback to direct public APIs if Worker unavailable).
 - NFT preview image is generated client‑side using the same functions/libs as the Worker to ensure parity with the on‑chain/served image.

### Smart Contract Notes
- Keep on-chain storage minimal; rely on events for detailed audit trail.
- Use ERC-721 transferable tokens.
- Gas optimization targets to maintain ~\$1 verification on chosen networks.
- Use OpenZeppelin libraries; add EIP-712 typed data if future off-chain signatures are desired.
- Optional: protocol fee pegged to USD (e.g., $1). If enabled, frontend computes token amount via Price Feed and supplies it as `msg.value` (or ERC‑20 allowance). On‑chain USD oracles (Chainlink) can be added later for trust‑minimized conversion.

### Cloud & DevOps
- Deploy: GitHub Actions -> build static site -> Cloudflare Pages.
- Workers: Deploy two Cloudflare Workers: Price Feed and NFT Metadata/Thumbnail. Bind KV/R2 if caching rendered images.
- Config: `.env` with public RPC URLs and chain IDs; private provider keys only in local tooling, not shipped to client.
- Observability: Cloudflare Analytics; optional Sentry for frontend errors (no file contents or PII).
- Environments: `dev` (testnets), `staging`, `prod` (main low-fee network). Feature flags via static config.

### Security & Privacy
- No file uploads, no server-side storage. Only derived values (hash, CID, tx hash) are used.
- Verified explorer links and chain IDs to prevent spoofing.
- Clear disclaimers: proof-of-existence only; users must store files themselves.
- Workers serve only public market data (Price Feed) and derived on-chain metadata/images (NFT service); no user files or PII are processed.

### Open Decisions
- Select additional networks to support alongside Base.
- Finalize metadata strategy (on-chain vs tokenURI composition details).
- Choose price sources (Worker-only vs client fallback; add Chainlink later?) and TTLs.
- Decide if/when to enable protocol fee pegged to USD and how it’s collected.

### Minimal Bill of Materials
- **Cloudflare**: DNS, CDN, Pages, WAF, Analytics.
- **Cloudflare Workers**: Price Feed Worker; NFT Metadata & Thumbnail Worker (optional KV/R2 for cache).
- **Ethereum node service**: Alchemy/Infura/Ankr/QuickNode per supported network.
- **Smart contract**: `VerifierCertificate` (ERC-721 transferable) deployed via CREATE2.
- **Frontend framework**: Next.js (TypeScript) with `wagmi` + `viem`; client-side hashing/CID, PDF, QR.


