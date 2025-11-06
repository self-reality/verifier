## Verifier — Project Description

Client‑side, ~$1 on‑chain proof‑of‑existence for any file. Your file never leaves your computer.

### Goals
- Provide a simple, privacy‑preserving way to prove a file existed at a point in time.
- Ensure zero file upload to servers; all hashing and CID computation happen in the browser.
- Produce two durable artifacts: an on‑chain NFT certificate and a downloadable PDF report.

### Non‑Goals
- Storing or backing up user files.
- Providing legal advice or jurisdiction‑specific guarantees.
- Acting as an IPFS pinning or hosting service.

### Value Proposition
- **Trustless proof:** Immutable on‑chain anchor for the file’s cryptographic fingerprint. Initial chains: 
Base
Polygon
Arbitrum
Optimism
Ethereum 
- **Privacy:** File never leaves the user’s device; only derived hashes are published.
- **Simplicity:** One‑click flow, ~$1 cost, instant certificate and report.

### User Journey (Happy Path)
1. Open app and see tagline: "Verify any doc on blockchain for just $1. (Your file never leaves your computer)."
2. Upload/drag‑drop a file.
3. Browser computes SHA-256 hash of the file with progress indication.
4. User connects wallet (if not already connected).
5. User edits display filename if desired (with length limit) in Certificate Preview. The app normalizes to a `slugFilename` on upload and during input (lowercase; allowed `a-z 0-9 - _ .`; disallowed chars → `-`; collapse multiple `-`; trim leading/trailing `-` and `.`; preserve last extension; `~` forbidden). The NFT `name` equals this `slugFilename`.
6. User clicks "Verify".
7. Transaction is sent to a single contract address (consistent across supported networks), passing the SHA-256 hash.
8. As soon as the transaction hash is available, generate the PDF report.
9. After the transaction is mined, show success state and provide certificate + PDF download and explorer link.

### Flow & States
- Upload area states: idle → loading to browser → hashing (progress %) → ready (filename shown; drag&drop and click remain available; "swap file").
- Certificate Preview: shows editable filename (length‑limited) and SHA-256 hash.
- Wallet: prompt to connect if disconnected; show network and address when connected.
- Transaction: pending (tx hash known) → mined/confirmed.
- Completion: show report summary, explorer link, QR, and download button.

### Functional Requirements
- Client‑side SHA-256 hashing of the entire file in a streaming/chunked manner with progress.
- Filename edit with enforced max length compatible with on-chain storage constraints. Input is normalized to `slugFilename` everywhere; the NFT `name` equals the (possibly edited) `slugFilename`.
- Single NFT anchor function on a contract address common across networks (passing SHA-256 hash as the `cidv1` parameter for forward compatibility).
- Immediate PDF generation once tx hash is known; update status to "confirmed" once mined.
- QR codes: one embedded in NFT image (instructions) and one in PDF (explorer link).

### NFT Certificate Specification
- Chain(s): EVM networks; single contract address across networks (internal mapping/dispatcher).
- Token type: transferable; unique per verification. Token IDs are incremental (standard).
- Metadata (on‑chain or via tokenURI):
  - Filename (editable, length‑limited)
  - SHA-256 file hash (FIPS 180-4, lowercase hex, 64 characters)
  - Image: contains a QR linking to the token `external_url`
  - Name: equal to the filename
  - `external_url`: `https://mysite.com/[slug]`
- Image content guidelines:
  - Prominent filename and SHA-256 hash
  - Clear QR with short URL to instructions


### PDF Report Specification
- Contents:
  - User wallet address
  - Network name
  - Filename
  - SHA-256 file hash
  - Transaction hash
  - Explorer link
  - QR code of the explorer link
- Layout: concise, one or two pages, printer‑friendly.
- Generated client‑side upon obtaining tx hash, updated with final status when mined.

### Verification Methods (for third parties)
- Re‑upload the original file on this site to reproduce the same SHA-256 hash; compare with on‑chain data.
- Use any external hashing tool (e.g., `shasum -a 256`, OpenSSL, online calculators) to compute the SHA-256 hash; compare the resulting hash with the on‑chain value.

### UI/UX Requirements
- Top header: "Verify any doc on blockchain for just $1. (Your file never leaves your computer)."
- Step indicator: "1. Upload → 2. Write on chain → 3. Get certificate."
- Upload zone: large, drag‑and‑drop and click; shows progress and clear permissions text.
- Post‑upload: compact file pill with name, "swap file", and persistent drag‑and‑drop.
- Certificate Preview: editable filename with length counter/limit; show computed SHA-256 hash.
- Actions: "Connect wallet" (if needed), "Verify" primary CTA.
- Confirmation: success message, explorer link, QR, and PDF download.
- Accessibility: keyboard navigation, sufficient contrast, screen‑reader labels.

### Error Handling & Edge Cases
- Cancelled upload or file swap mid‑hash: safely restart and clear previous state.
- Very large files: hashing remains responsive with chunking and accurate progress.
- Unsupported file types: no type restrictions (hashing only), but warn about extremely large files.
- Wallet not connected/denied: keep state, allow retry without re‑uploading.
- Network switched mid‑flow: prompt to confirm or restart transaction step.
- Transaction failed/reverted: display failure, allow retry; report remains available (marked failed).

### Legal & Disclaimer
- Proof‑of‑existence only; users must store their files themselves.
- Legal validity depends on jurisdiction; display a clear disclaimer in the UI and PDF.

### Glossary
- File hash: SHA-256 cryptographic digest of the file contents (FIPS 180-4), output as lowercase hexadecimal (64 characters).
- NFT certificate: on‑chain token encoding the file's proof‑of‑existence metadata.
- Explorer link: URL to a blockchain explorer page for the transaction or token.
