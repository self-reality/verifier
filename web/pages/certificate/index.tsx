import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { parseTransactionUrl, validateTxHash, getNetworkName } from '../../utils';
import { generateCertificatePDF } from '../../utils/pdfGenerator';
import { getContractAddress, BASE_CHAIN_ID, ETHEREUM_CHAIN_ID, OPTIMISM_CHAIN_ID } from '../../constants/contracts';
import { fetchTransactionReceipt, decodeAnchoredEvent, type AnchoredEventData } from '../../utils/txParser';

type ChainName = 'base' | 'ethereum' | 'optimism';

const CHAIN_NAME_TO_ID: Record<ChainName, number> = {
  base: BASE_CHAIN_ID,
  ethereum: ETHEREUM_CHAIN_ID,
  optimism: OPTIMISM_CHAIN_ID,
};

const CHAIN_ID_TO_NAME: Record<number, ChainName> = {
  [BASE_CHAIN_ID]: 'base',
  [ETHEREUM_CHAIN_ID]: 'ethereum',
  [OPTIMISM_CHAIN_ID]: 'optimism',
};

interface RegistrationData extends AnchoredEventData {
  blockNumber: bigint;
  txHash: string;
}

const getFirst = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value ?? null;
};

const normalizeChain = (value: string | null): ChainName | null => {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === 'base' || lower === 'ethereum' || lower === 'optimism') {
    return lower;
  }
  return null;
};

export default function CertificatePage() {
  const router = useRouter();
  const lastProcessedPathRef = useRef<string | null>(null);

  const [inputValue, setInputValue] = useState('');
  const [selectedChain, setSelectedChain] = useState<ChainName>('base');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationData, setRegistrationData] = useState<RegistrationData | null>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  const isValidChain = (chain: string): chain is ChainName => {
    return chain === 'base' || chain === 'ethereum' || chain === 'optimism';
  };

  const handleFetch = useCallback(
    async (hash?: string, chain?: ChainName) => {
      const txHash = hash || inputValue;
      const chainName = chain || selectedChain;

      if (!txHash) {
        setError('Please enter a transaction hash or URL');
        return;
      }

      if (!validateTxHash(txHash)) {
        setError('Invalid transaction hash format');
        return;
      }

      setLoading(true);
      setError(null);
      setRegistrationData(null);
      setPdfReady(false);

      try {
        const chainId = CHAIN_NAME_TO_ID[chainName];
        const contractAddress = getContractAddress(chainId);

        if (!contractAddress) {
          throw new Error(`Contract not deployed on ${chainName}`);
        }

        const receipt = await fetchTransactionReceipt(txHash, chainId);

        if (!receipt) {
          throw new Error('Transaction not found. Please check the hash and chain.');
        }

        const eventData = decodeAnchoredEvent(receipt, contractAddress);

        if (!eventData) {
          throw new Error('This transaction does not contain a valid Anchored event from the VerifierRegistry contract.');
        }

        setRegistrationData({
          ...eventData,
          blockNumber: receipt.blockNumber,
          txHash: receipt.transactionHash,
        });
      } catch (err: any) {
        setError(err.message || 'Failed to fetch transaction data');
        console.error('Error fetching transaction:', err);
      } finally {
        setLoading(false);
      }
    },
    [inputValue, selectedChain]
  );

  useEffect(() => {
    if (router.isReady && !mounted) {
      setMounted(true);
    }
  }, [router.isReady, mounted]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const currentAsPath = router.asPath;
    if (lastProcessedPathRef.current === currentAsPath) {
      return;
    }

    lastProcessedPathRef.current = currentAsPath;

    const [pathname, searchAndHash] = currentAsPath.split('?');
    const [search = ''] = (searchAndHash ?? '').split('#');
    const pathSegments = pathname.split('/').filter(Boolean);

    let chainFromPath: ChainName | null = null;
    let hashFromPath: string | null = null;

    if (pathSegments[0] === 'certificate') {
      if (pathSegments.length >= 2 && isValidChain(pathSegments[1])) {
        chainFromPath = pathSegments[1] as ChainName;
      }

      if (pathSegments.length >= 3) {
        const maybeHash = decodeURIComponent(pathSegments[2]);
        if (validateTxHash(maybeHash)) {
          hashFromPath = maybeHash;
        }
      }
    }

    const queryParams = new URLSearchParams(search);
    const chainFromQuery = normalizeChain(
      getFirst(router.query.chain) ||
        getFirst(router.query.chainId) ||
        getFirst(router.query.network) ||
        queryParams.get('chain') ||
        queryParams.get('chainId') ||
        queryParams.get('network')
    );

    const hashFromQuery =
      getFirst(router.query.hash) ||
      getFirst(router.query.tx) ||
      getFirst(router.query.txHash) ||
      queryParams.get('hash') ||
      queryParams.get('tx') ||
      queryParams.get('txHash');

    const chainToUse = chainFromQuery || chainFromPath;
    const hashToUse = hashFromQuery || hashFromPath;

    if (chainToUse && chainToUse !== selectedChain) {
      setSelectedChain(chainToUse);
    }

    if (hashToUse && hashToUse !== inputValue) {
      setInputValue(hashToUse);
    }

    if (chainToUse && hashToUse && validateTxHash(hashToUse)) {
      handleFetch(hashToUse, chainToUse);
    }
  }, [router.isReady, router.asPath, router.query, handleFetch, inputValue, selectedChain]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    setInputValue(value);
    setError(null);
    setPdfReady(false);

    const urlData = parseTransactionUrl(value);
    if (urlData) {
      const chainName = CHAIN_ID_TO_NAME[urlData.chainId];
      if (chainName) {
        setSelectedChain(chainName);
        setInputValue(urlData.txHash);
      }
    }
  };

  const handleGeneratePDF = async () => {
    if (!registrationData) return;

    try {
      setLoading(true);
      await generateCertificatePDF({
        cid: registrationData.cid,
        filename: registrationData.filename,
        sha256Hash: registrationData.cid,
        walletAddress: registrationData.submitter,
        timestamp: Number(registrationData.timestamp) * 1000,
        blockNumber: Number(registrationData.blockNumber),
        chainId: CHAIN_NAME_TO_ID[selectedChain],
        transactionHash: registrationData.txHash,
        feeAmountWei: registrationData.paid,
        feeCurrencyTicker: 'ETH',
      });

      setPdfReady(true);
    } catch (err: any) {
      setError(err.message || 'Failed to generate PDF');
      console.error('Error generating PDF:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Generate Certificate - Akashi Notari</title>
        <meta
          name="description"
          content="Generate a proof of existence certificate from a blockchain transaction"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#000',
          color: '#00ff00',
          fontFamily: 'Courier, monospace',
          padding: '2rem 1rem',
        }}
      >
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>証 Akashi Notari</h1>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Generate Certificate</h2>
            <p style={{ fontSize: '1rem', opacity: 0.8 }}>
              Enter a transaction hash or block explorer URL to generate a proof of existence certificate
            </p>
          </div>

          <div
            style={{
              border: '2px solid #00ff00',
              padding: '2rem',
              marginBottom: '2rem',
            }}
          >
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Chain:
              </label>
              <select
                value={selectedChain}
                onChange={(e) => setSelectedChain(e.target.value as ChainName)}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#000',
                  color: '#00ff00',
                  border: '1px solid #00ff00',
                  fontFamily: 'Courier, monospace',
                  fontSize: '1rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                <option value="base">Base</option>
                <option value="ethereum">Ethereum</option>
                <option value="optimism">Optimism</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Transaction Hash or Block Explorer URL:
              </label>
              <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                placeholder="0x... or https://basescan.org/tx/0x..."
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#000',
                  color: '#00ff00',
                  border: '1px solid #00ff00',
                  fontFamily: 'Courier, monospace',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', opacity: 0.7 }}>
                You can paste a transaction hash or a full block explorer URL
              </p>
            </div>

            <button
              onClick={() => handleFetch()}
              disabled={loading || !inputValue}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: loading || !inputValue ? '#003300' : '#00ff00',
                color: loading || !inputValue ? '#006600' : '#000',
                border: 'none',
                fontFamily: 'Courier, monospace',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: loading || !inputValue ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => {
                if (!loading && inputValue) {
                  e.currentTarget.style.backgroundColor = '#00cc00';
                }
              }}
              onMouseOut={(e) => {
                if (!loading && inputValue) {
                  e.currentTarget.style.backgroundColor = '#00ff00';
                }
              }}
            >
              {loading ? 'Loading...' : 'Fetch Transaction Data'}
            </button>
          </div>

          {error && (
            <div
              style={{
                border: '2px solid #ff0000',
                padding: '1rem',
                marginBottom: '2rem',
                backgroundColor: '#330000',
              }}
            >
              <p style={{ margin: 0, color: '#ff6666' }}>{error}</p>
            </div>
          )}

          {registrationData && !error && (
            <div
              style={{
                border: '2px solid #00ff00',
                padding: '2rem',
                marginBottom: '2rem',
                backgroundColor: '#001100',
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.25rem' }}>
                Document Registration Found
              </h3>
              <div style={{ fontSize: '0.875rem', lineHeight: '1.8' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>Filename:</span>
                  <span style={{ wordBreak: 'break-all' }}>{registrationData.filename || '(no filename)'}</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>Hash/CID:</span>
                  <span style={{ wordBreak: 'break-all', fontSize: '0.75rem' }}>{registrationData.cid}</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>Submitter:</span>
                  <span style={{ wordBreak: 'break-all', fontSize: '0.75rem' }}>{registrationData.submitter}</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>Timestamp:</span>
                  <span>{new Date(Number(registrationData.timestamp) * 1000).toLocaleString()}</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>Block:</span>
                  <span>#{registrationData.blockNumber.toString()}</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>Chain:</span>
                  <span>{getNetworkName(CHAIN_NAME_TO_ID[selectedChain])}</span>
                </div>
              </div>

              <button
                onClick={handleGeneratePDF}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  marginTop: '1.5rem',
                  backgroundColor: loading ? '#003300' : '#00ff00',
                  color: loading ? '#006600' : '#000',
                  border: 'none',
                  fontFamily: 'Courier, monospace',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseOver={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#00cc00';
                  }
                }}
                onMouseOut={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#00ff00';
                  }
                }}
              >
                {pdfReady ? '✓ Download Certificate' : 'Generate & Download Certificate'}
              </button>
            </div>
          )}

          <div
            style={{
              border: '2px solid #00ff00',
              padding: '2rem',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.25rem' }}>Example URLs</h3>
            <div style={{ fontSize: '0.875rem', lineHeight: '1.8', opacity: 0.8 }}>
              <p style={{ margin: '0.5rem 0' }}>• https://basescan.org/tx/0x575e3899...</p>
              <p style={{ margin: '0.5rem 0' }}>• https://basescan.org/tx/0x575e3899...#eventlog</p>
              <p style={{ margin: '0.5rem 0' }}>• https://etherscan.io/tx/0x123...</p>
              <p style={{ margin: '0.5rem 0' }}>• 0x575e3899b2697043acd5719cd1ca376794b2a62a92f18334c3ce04d85ebe8b0b</p>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <a
              href="/"
              style={{
                color: '#00ff00',
                textDecoration: 'underline',
                fontSize: '1rem',
              }}
            >
              ← Back to Home
            </a>
          </div>
        </div>
      </div>
    </>
  );
}


