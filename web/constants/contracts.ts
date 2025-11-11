import { VerifierRegistryABI } from './VerifierRegistryABI';
import constants from '../../contracts/registry/constants.json';

// Supported chain IDs
export const BASE_CHAIN_ID = 8453;
export const ETHEREUM_CHAIN_ID = 1;
export const OPTIMISM_CHAIN_ID = 10;

export const SUPPORTED_CHAIN_IDS = [
  BASE_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
] as const;

// Contract addresses by chain ID
export const CONTRACT_ADDRESSES: Record<number, `0x${string}`> = {
  [BASE_CHAIN_ID]: constants.base.address as `0x${string}`,
  [ETHEREUM_CHAIN_ID]: constants.mainnet.address as `0x${string}`,
  [OPTIMISM_CHAIN_ID]: constants.optimism.address as `0x${string}`,
};

// Contract ABI (same for all chains)
export const VERIFIER_REGISTRY_ABI = VerifierRegistryABI;

// Get contract address for a specific chain
export function getContractAddress(chainId: number): `0x${string}` | undefined {
  return CONTRACT_ADDRESSES[chainId];
}

// Get contract configuration for a specific chain
export function getVerifierRegistryContract(chainId: number) {
  const address = getContractAddress(chainId);
  if (!address) {
    throw new Error(`No contract address configured for chain ${chainId}`);
  }
  return {
    address,
    abi: VERIFIER_REGISTRY_ABI,
  } as const;
}
