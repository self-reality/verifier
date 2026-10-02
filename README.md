## Akashi Notari — Simple Proof of Existence

Verify and timestamp any file on the blockchain in about a minute. Your file never leaves your computer; only a cryptographic hash is written on‑chain. Typical cost is around $1 (network fees may vary).

### Website
- App: https://akashi-notari.com/
- Certificate retrieval: https://akashi-notari.com/certificate/

### What you can do
- **Create an on‑chain proof**: Anchor your file’s SHA‑256 hash on supported networks with a single transaction.
- **Keep your privacy**: Hashing happens entirely in your browser. No file uploads, ever.
- **Download a PDF certificate**: Instantly receive a printable certificate containing the hash, timestamp, wallet, network, transaction link, and a QR code.
- **Verify later, anywhere**: Re‑generate the certificate at any time using just the transaction hash or block explorer URL.
- **Multi‑network support**: Use Base, Ethereum Mainnet, or Optimism (more coming soon).
- **Wallets you already use**: Connect via MetaMask or WalletConnect-compatible wallets.

### How it works (at a glance)
1) Select a file. The site computes a SHA‑256 hash locally with a visible progress bar.  
2) Connect your wallet. The app shows the current network and an estimated fee in the chain’s native token.  
3) Click “Verify on chain.” The transaction writes the hash to the `VerifierRegistry` smart contract.  
4) Download your **PDF certificate**. It includes a QR and direct link to the transaction/event log for future verification.

### Certificate details
Each certificate includes:
- Filename (with safe normalization)
- SHA‑256 hash (FIPS 180‑4, 64 hex chars)
- Your wallet address
- Precise timestamp (UTC + Unix)
- Network name
- Transaction hash and a link to the explorer
- QR code linking to the transaction event log
- Simple instructions for independently recomputing and comparing the file hash in the future

### Look up an existing proof
Already have a transaction? Open the Certificate page at https://akashi-notari.com/certificate/ and paste a transaction hash or full explorer URL to view registration details and download the certificate again.

### Supported networks
- Base (primary)
- Ethereum Mainnet
- Optimism

### Contract addresses
`VerifierRegistry` is the contract the web app writes to, paid in the chain's native token.
- Base: `0xeed9D0f7265892e84e43d05dA464c75add199260`  
  Explorer: https://basescan.org/address/0xeed9D0f7265892e84e43d05dA464c75add199260#code
- Ethereum: `0xeed9D0f7265892e84e43d05dA464c75add199260`  
  Explorer: https://etherscan.io/address/0xeed9D0f7265892e84e43d05dA464c75add199260#code
- Optimism: `0x859Fe07D2995875319b7e65592812392B16BBADe`  
  Explorer: https://optimistic.etherscan.io/address/0x859Fe07D2995875319b7e65592812392B16BBADe#code

`VerifierRegistryUSDC` takes payment in USDC instead of ETH. Agents reach it over x402 at https://anchor.akashi-notari.com (see [workers/anchor](workers/anchor/README.md)); one anchor costs 0.01 USDC.
- Base: `0xf738aD9256bf20C2Da3a5F1142D4e8549785dF21`  
  Explorer: https://basescan.org/address/0xf738aD9256bf20C2Da3a5F1142D4e8549785dF21#code

### Privacy & security
- Your document never leaves your device. Only the derived hash and transaction data are recorded on‑chain.
- No accounts, no uploads, no servers storing your files.

### Disclaimer
This provides a cryptographic proof of existence only. It does not assess a document’s contents or legal validity. Store your original file safely to enable future verification.

### Contact
Questions or feedback? Join the community on Discord: https://discord.gg/KBc44HTzP2


