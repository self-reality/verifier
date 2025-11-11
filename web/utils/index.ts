// Price feed configuration
const PRICE_FEED_URL = process.env.NEXT_PUBLIC_PRICE_FEED_URL || 'https://price-feed.akashi-notari.com';

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

// Fetch price from worker (always fetches rate for $1, then multiplies by feeCents)
export async function fetchPriceFeed(chainId: number, feeCents: number): Promise<{ amountWei: bigint; priceUsd: number; ticker: string }> {
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
  // Multiply the $1 rate by the configured fee amount (in cents)
  // Since feeCents is an integer, we can use it directly with BigInt
  const amountWeiFor1Usd = BigInt(data.amountWei);
  const rawAmountWei = (amountWeiFor1Usd * BigInt(feeCents)) / BigInt(100);
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

// Map chainId to network name
export const getNetworkName = (chainId: number | undefined): string => {
  if (!chainId) return 'Unknown Network';
  switch (chainId) {
    case 1:
      return 'Ethereum Mainnet';
    case 8453:
      return 'Base';
    case 137:
      return 'Polygon';
    case 10:
      return 'Optimism';
    default:
      return `Chain ${chainId}`;
  }
};

// Get block explorer domain for a chain
export const getExplorerDomain = (chainId: number | undefined): string => {
  if (!chainId) return '';
  
  switch (chainId) {
    case 1:
      return 'etherscan.io';
    case 8453:
      return 'basescan.org';
    case 137:
      return 'polygonscan.com';
    case 10:
      return 'optimistic.etherscan.io';
    default:
      return '';
  }
};

// Generate block explorer transaction URL
export const getTxUrl = (chainId: number | undefined, txHash: string): string => {
  const domain = getExplorerDomain(chainId);
  if (!domain || !txHash) return '';
  return `https://${domain}/tx/${txHash}`;
};

// Generate block explorer event log URL
export const getEventLogUrl = (chainId: number | undefined, txHash: string): string => {
  const txUrl = getTxUrl(chainId, txHash);
  return txUrl ? `${txUrl}#eventlog` : '';
};

// Compute SHA-256 hash of a file with progress tracking
export async function computeSHA256(
  file: File,
  onReadProgress: (progress: number) => void,
  onHashProgress: (progress: number) => void
): Promise<string> {
  const CHUNK_SIZE = 64 * 1024; // 64KB chunks
  const fileSize = file.size;
  let bytesProcessed = 0;

  try {
    // For modern browsers with streaming support
    if (file.stream && crypto.subtle) {
      const stream = file.stream();
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      // Read all chunks
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        bytesProcessed += value.length;
        
        // Report read progress
        const readProgress = (bytesProcessed / fileSize) * 100;
        onReadProgress(Math.min(readProgress, 100));
      }

      // All chunks read, now hash them
      onReadProgress(100);
      
      // Concatenate all chunks into a single buffer
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const fileBuffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        fileBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      // Compute hash (happens relatively quickly for most files)
      onHashProgress(50); // Indicate hashing is in progress
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
      onHashProgress(100);

      // Convert to lowercase hex string
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex;
    } else {
      // Fallback for older browsers using FileReader
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            onReadProgress(Math.min(progress, 100));
          }
        };
        
        reader.onload = async (e) => {
          try {
            onReadProgress(100);
            onHashProgress(50);
            
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            
            onHashProgress(100);
            
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            resolve(hashHex);
          } catch (error) {
            reject(error);
          }
        };
        
        reader.onerror = () => {
          reject(new Error('Failed to read file'));
        };
        
        reader.readAsArrayBuffer(file);
      });
    }
  } catch (error) {
    throw new Error(`Failed to compute SHA-256: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

