// Price feed configuration
const PRICE_FEED_URL = process.env.NEXT_PUBLIC_PRICE_FEED_URL || 'https://price-feed.porobov-p3798.workers.dev';

// Map chainId to currency ticker
export function getCurrencyTicker(chainId: number | undefined): string | null {
  if (!chainId) return null;
  switch (chainId) {
    case 1: // Ethereum Mainnet
    case 8453: // Base
      return 'ETH';
    case 137: // Polygon
      return 'POL';
    case 10: // Optimism
      return 'OP';
    default:
      return null;
  }
}

// Round down bigint to significant figures for cleaner display and lower gas
export function roundDownWei(amountWei: bigint): bigint {
  const str = amountWei.toString();
  if (str.length <= 3) return amountWei;
  
  // Keep 2-3 significant figures, round down the rest
  const sigFigs = 3;
  const zeros = str.length - sigFigs;
  let divisor = BigInt(1);
  for (let i = 0; i < zeros; i++) {
    divisor = divisor * BigInt(10);
  }
  return (amountWei / divisor) * divisor;
}

// Fetch price from worker (always fetches rate for $1, then multiplies by feeUsd)
export async function fetchPriceFeed(chainId: number, feeUsd: number): Promise<{ amountWei: bigint; priceUsd: number; ticker: string }> {
  const ticker = getCurrencyTicker(chainId);
  if (!ticker) {
    throw new Error('Unsupported chain');
  }
  
  // Always fetch conversion rate for $1 USD
  const url = `${PRICE_FEED_URL}/api/usd-to-amount?usd=1&chainId=${chainId}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch price: ${response.status}`);
  }
  
  const data = await response.json();
  // Multiply the $1 rate by the configured fee amount
  const rawAmountWei = BigInt(data.amountWei) * BigInt(feeUsd);
  const amountWei = roundDownWei(rawAmountWei);
  
  return {
    amountWei,
    priceUsd: data.priceUsd,
    ticker
  };
}

// Filename validation utility
export const validateFilename = (name: string): { isValid: boolean; sanitized: string; warnings: string[] } => {
  const warnings: string[] = [];
  let sanitized = name;
  
  // Convert to lowercase
  if (sanitized !== sanitized.toLowerCase()) {
    sanitized = sanitized.toLowerCase();
    warnings.push('Uppercase letters converted to lowercase');
  }
  
  // Replace invalid characters with empty string
  const originalLength = sanitized.length;
  sanitized = sanitized.replace(/[^a-z0-9\-_.]/g, '');
  if (sanitized.length < originalLength) {
    warnings.push('Invalid characters removed');
  }
  
  // Remove leading/trailing dashes and dots
  const beforeTrim = sanitized;
  sanitized = sanitized.replace(/^[\-\.]+|[\-\.]+$/g, '');
  if (sanitized !== beforeTrim) {
    warnings.push('Leading/trailing dashes and dots removed');
  }
  
  // Check length
  if (sanitized.length === 0) {
    return { isValid: false, sanitized: '', warnings: ['Filename cannot be empty'] };
  }
  if (sanitized.length > 128) {
    sanitized = sanitized.substring(0, 128);
    warnings.push('Filename truncated to 128 characters');
  }
  
  return { isValid: true, sanitized, warnings };
};

// Generate CIDv1 format (bafy... with base32 characters)
export const generateCIDv1 = () => {
  const base32Chars = 'abcdefghijklmnopqrstuvwxyz234567';
  let cid = 'bafy';
  for (let i = 0; i < 55; i++) {
    cid += base32Chars[Math.floor(Math.random() * base32Chars.length)];
  }
  return cid;
};

export const formatUnixTime = (timestamp: number) => {
  return Math.floor(timestamp / 1000).toString();
};

export const formatHumanTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

export const renderProgressBar = (progress: number) => {
  const blocks = 20;
  const filled = Math.floor((progress / 100) * blocks);
  return '█'.repeat(filled) + '░'.repeat(blocks - filled);
};

