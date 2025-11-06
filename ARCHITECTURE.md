## Verifier — Architecture & Infrastructure (High-Level)

Privacy-preserving, client-only SHA-256 file hashing with a single on-chain write. No user files leave the browser. Deliver a durable on-chain NFT certificate and a client-generated PDF report for ~\$1 total cost on low-fee EVM networks.

### Core Principles
- **Client-first privacy**: All hashing (SHA-256) in-browser; no file uploads to servers.
- **Minimal backend**: Static hosting. No databases or user state.
- **Single on-chain action**: One contract `mint/verify` call anchors proof-of-existence.
- **Low cost, high UX**: Target ~\$1 per verification (network dependent). Fast, simple flow.

### High-Level Components
1) **Frontend Web App (Browser SPA)**
   - Framework: React with Next.js (static export) or Vite + React. Recommendation: Next.js for conventions and future flexibility; deploy as static to edge.
   - Wallet & chain: `wagmi` + `viem` (or `ethers` v6). Wallets via MetaMask and WalletConnect.
   - Crypto in-browser:
     - SHA-256 file hashing via Web Crypto API with chunked streaming and progress.
     - Hash output: lowercase hex-encoded SHA-256 digest (64 characters).
   - Certificate UI: editable display filename (length-limited), show SHA-256 hash. NFT `name` is set to this `slugFilename` at mint time.
   - Filename normalization: on upload and during input, the app derives a `slugFilename` used everywhere. Rules: lowercase; allowed chars `a-z 0-9 - _ .`; replace disallowed chars (including spaces) with `-`;  trim leading/trailing `-` and `.`; preserve extension; forbid `~` (reserved as slug separator).
   - PDF generation: client-side (e.g., `pdf-lib`), include QR to explorer link.
   - QR codes: client-side generation (e.g., `qrcode`/`qrcode.react`).
   - No file uploads; only derived data (SHA-256 hash, tx hash) are stored on-chain.

2) **Smart Contract(s) — EVM**
   - Contract: `VerifierCertificate` (ERC-721 transferable).
   - Function: `anchor` stores the SHA-256 hash (hex string) and filename; token IDs are incremental (standard). Note: contract parameter is named `cidv1` for forward compatibility but contains the SHA-256 hash in MVP. A deterministic slug `slugFilename~hash` is computed from the normalized `slugFilename` and the hash to derive the tokenURI.
   - Addressing pattern: Deterministic deployment via CREATE2 to reuse the same address across networks.
   - Metadata: `tokenURI` is deterministic and points to `https://metadata.mysite.com/[slug]`. `external_url` is `https://mysite.com/[slug]`. The image includes a QR code linking to the same `external_url`.
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
   - Purpose: Convert USD amounts to native token amounts for supported networks.
   - Implementation: Cloudflare Worker that fetches and caches native token prices from public market APIs with configurable TTL (default 1 hour), CDN‑cached. Optional on‑chain fallback via Chainlink feeds if needed later.
   - API: `GET /api/usd-to-amount?usd=1&chainId=8453` → `{ amountWei }` for the native token amount.
   - Privacy: No user data; only public market data.

6) **NFT Metadata & Thumbnail Service**
   - Purpose: Serve wallet‑friendly metadata JSON and a deterministic thumbnail image so wallets display a clean preview.
   - Implementation: Cloudflare Worker (or Pages Function) that constructs ERC‑721 metadata from the tokenURI slug alone (derived from `filename + hash`), and serves a PNG‑8 image that displays the filename, SHA-256 hash, and a QR to the `external_url`. No user files are stored or required.
   - Endpoints:
     - `GET https://metadata.mysite.com/:slug` → metadata JSON
     - `GET https://metadata.mysite.com/:slug/image.png` → PNG‑8 image
   - Caching: CDN cache by URL with revalidation; purge on mint or use short TTL.
   - Format: PNG‑8 only; SVG is not served for compatibility and security consistency.
   - Storage (optional): R2/KV for image render cache; no user files stored.

### End-to-End Flow
1. User opens the app (served via Cloudflare Pages/CDN).
2. User drops a file; browser streams/chunks to compute SHA-256 hash with progress.
3. User connects a wallet; app queries Price Feed to compute the $1 equivalent token amount (if a protocol fee applies).
4. User clicks Verify; dapp calls contract `anchor` via wallet provider (passing SHA-256 hash as the `cidv1` parameter).
5. As soon as tx hash is available, the app generates a PDF report (includes wallet, network, filename, SHA-256 hash, tx hash, explorer link, QR).
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
- Web Crypto API for SHA-256 hashing with Web Workers and chunked streaming.
- `pdf-lib` (PDF), `qrcode` (QR), `zod` (validation), `zustand` or `redux` (minimal state where needed).
- USD to token conversion: client fetches from Price Feed Worker (with fallback to direct public APIs if Worker unavailable).
- NFT preview image is generated client‑side using the same functions/libs as the Worker to ensure parity with the on‑chain/served image.

### Cryptographic Details
- Hash algorithm: SHA-256 (FIPS 180-4).
- Output format: lowercase hexadecimal string (64 characters).
- Determinism: identical input file must yield identical hash in the browser and via standard tools (e.g., `shasum -a 256`, OpenSSL).

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
- No file uploads, no server-side storage. Only derived values (SHA-256 hash, tx hash) are stored on-chain.
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


