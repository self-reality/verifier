# Proof of Existence - Web App

## Quick Start

1. **Install dependencies:**
```bash
cd web
pnpm install
```

2. **Set up environment variables:**

Create `.env.local` in the `web/` directory:

```bash
# WalletConnect Project ID (get from https://cloud.walletconnect.com)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here

# Alchemy API Key (optional, get from https://www.alchemy.com)
NEXT_PUBLIC_ALCHEMY_KEY=your_alchemy_key_here
```

3. **Run development server:**
```bash
pnpm dev
```

Visit http://localhost:3000 (or is it 3001?)

## Testing PDF Generation

To test the `generateCertificatePDF` function independently:

```bash
npx tsx web/utils/testPdfGenerator.ts
```

This generates a test certificate PDF without running the full app.

## Deployment

1. **Build static export:**
```bash
cd web
pnpm build
```

2. **Deploy to Cloudflare Pages:**
```bash
npx wrangler pages deploy out --project-name akashi-notari
```
