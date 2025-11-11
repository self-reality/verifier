import { http, createConfig } from 'wagmi';
import { mainnet, base, optimism, polygon } from 'wagmi/chains';
import { QueryClient } from '@tanstack/react-query';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';

// Get Alchemy API key from environment
const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_KEY || '';

// WalletConnect project ID (you'll need to get this from cloud.walletconnect.com)
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

// Warn if WalletConnect project ID is missing
if (typeof window !== 'undefined' && !projectId) {
  console.warn(
    '⚠️ WalletConnect Project ID is missing!\n' +
    'Get one from https://cloud.walletconnect.com and add it to .env.local:\n' +
    'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id'
  );
}

// Build connectors array conditionally
const connectors = [
  injected(),
  coinbaseWallet({
    appName: 'Proof of Existence',
  }),
];

// Only add WalletConnect if we have a project ID
if (projectId) {
  connectors.push(
    walletConnect({
      projectId,
      metadata: {
        name: 'Proof of Existence',
        description: 'Verify any document on blockchain',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://localhost:3000',
        icons: [`${typeof window !== 'undefined' ? window.location.origin : 'https://localhost:3000'}/icon.png`]
      },
      showQrModal: true,
    })
  );
}

export const config = createConfig({
  chains: [base, mainnet, optimism, polygon],
  connectors,
  transports: {
    [base.id]: http(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`),
    [mainnet.id]: http(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`),
    [optimism.id]: http(`https://opt-mainnet.g.alchemy.com/v2/${alchemyKey}`),
    [polygon.id]: http(`https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`),
  },
});

export const queryClient = new QueryClient();

