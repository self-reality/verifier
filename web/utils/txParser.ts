import { createPublicClient, http, decodeEventLog, type Log } from 'viem';
import { base, mainnet, optimism } from 'viem/chains';
import { VerifierRegistryABI } from '../constants/VerifierRegistryABI';
import { BASE_CHAIN_ID, ETHEREUM_CHAIN_ID, OPTIMISM_CHAIN_ID } from '../constants/contracts';

const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_KEY || '';

// Chain configurations
const chains = {
  [BASE_CHAIN_ID]: base,
  [ETHEREUM_CHAIN_ID]: mainnet,
  [OPTIMISM_CHAIN_ID]: optimism,
};

// Create public clients for each chain
const clients = {
  [BASE_CHAIN_ID]: createPublicClient({
    chain: base,
    transport: http(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`),
  }),
  [ETHEREUM_CHAIN_ID]: createPublicClient({
    chain: mainnet,
    transport: http(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`),
  }),
  [OPTIMISM_CHAIN_ID]: createPublicClient({
    chain: optimism,
    transport: http(`https://opt-mainnet.g.alchemy.com/v2/${alchemyKey}`),
  }),
};

export interface AnchoredEventData {
  contractAddress: string;
  cid: string;
  filename: string;
  submitter: string;
  timestamp: bigint;
  paid: bigint;
}

export async function fetchTransactionReceipt(txHash: string, chainId: number) {
  const client = clients[chainId];
  if (!client) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  try {
    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });
    return receipt;
  } catch (error) {
    console.error('Error fetching transaction receipt:', error);
    return null;
  }
}

export function decodeAnchoredEvent(
  receipt: any,
  contractAddresses: string[]
): AnchoredEventData | null {
  // Find the Anchored event from one of the registry contracts
  const addresses = contractAddresses.map((address) => address.toLowerCase());
  const anchoredLog = receipt.logs.find((log: Log) => {
    return addresses.includes(log.address.toLowerCase());
  });

  if (!anchoredLog) {
    return null;
  }

  try {
    // Find the Anchored event ABI
    const eventAbi = VerifierRegistryABI.find(
      (item: any) => item.type === 'event' && item.name === 'Anchored'
    );

    if (!eventAbi) {
      throw new Error('Anchored event not found in ABI');
    }

    const decoded = decodeEventLog({
      abi: [eventAbi],
      data: anchoredLog.data,
      topics: anchoredLog.topics,
    }) as any;

    return {
      contractAddress: anchoredLog.address,
      cid: decoded.args.cid as string,
      filename: decoded.args.filename as string,
      submitter: decoded.args.submitter as string,
      timestamp: decoded.args.timestamp as bigint,
      paid: decoded.args.paid as bigint,
    };
  } catch (error) {
    console.error('Error decoding event:', error);
    return null;
  }
}

