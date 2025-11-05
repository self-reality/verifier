import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { QueryClient } from '@tanstack/react-query';
import { injected, walletConnect, coinbaseWallet } from '@wagmi/connectors';

// Get Alchemy API key from environment
const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_KEY || '';

// WalletConnect project ID (you'll need to get this from cloud.walletconnect.com)
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

export const config = createConfig({
  chains: [base],
  connectors: [
    injected(),
    walletConnect({
      projectId,
      metadata: {
        name: 'Proof of Existence',
        description: 'Verify any document on blockchain',
        url: 'https://your-domain.com', // Update with your actual domain
        icons: ['https://your-domain.com/icon.png']
      },
      showQrModal: true,
    }),
    coinbaseWallet({
      appName: 'Proof of Existence',
    }),
  ],
  transports: {
    [base.id]: http(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`),
  },
});

export const queryClient = new QueryClient();

