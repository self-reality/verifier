import { VerifierRegistryABI } from './VerifierRegistryABI';
import constants from '../../contracts/registry/constants.json';

// Base chain ID
export const BASE_CHAIN_ID = 8453;

// Contract address from constants.json
export const VERIFIER_REGISTRY_ADDRESS = constants.base.address as `0x${string}`;

// Contract ABI
export const VERIFIER_REGISTRY_ABI = VerifierRegistryABI;

// Contract configuration object for wagmi
export const verifierRegistryContract = {
  address: VERIFIER_REGISTRY_ADDRESS,
  abi: VERIFIER_REGISTRY_ABI,
} as const;

