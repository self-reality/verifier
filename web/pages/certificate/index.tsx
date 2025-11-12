import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { parseTransactionUrl, validateTxHash, getNetworkName, getTxUrl } from '../../utils';
import { generateCertificatePDF } from '../../utils/pdfGenerator';
import {
  getContractAddress,
  BASE_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
} from '../../constants/contracts';
import {
  fetchTransactionReceipt,
  decodeAnchoredEvent,
  type AnchoredEventData,
} from '../../utils/txParser';

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
  const lastFetchedKeyRef = useRef<string | null>(null);

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
          throw new Error(
            'This transaction does not contain a valid Anchored event from the VerifierRegistry contract.'
          );
        }

        setRegistrationData({
          ...eventData,
          blockNumber: receipt.blockNumber,
          txHash: receipt.transactionHash,
        });

        const key = `${chainName}:${txHash.toLowerCase()}`;
        lastFetchedKeyRef.current = key;

        if (router.isReady) {
          const currentChainParam = normalizeChain(
            getFirst(router.query.chain) ||
              getFirst(router.query.chainId) ||
              getFirst(router.query.network)
          );
          const currentHashParam =
            getFirst(router.query.hash) ||
            getFirst(router.query.tx) ||
            getFirst(router.query.txHash);

          if (
            currentChainParam !== chainName ||
            (currentHashParam || '').toLowerCase() !== txHash.toLowerCase()
          ) {
            router.replace(
              {
                pathname: '/certificate',
                query: { chain: chainName, hash: txHash },
              },
              undefined,
              { shallow: true }
            );
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch transaction data');
        console.error('Error fetching transaction:', err);
        lastFetchedKeyRef.current = null;
      } finally {
        setLoading(false);
      }
    },
    [inputValue, selectedChain, router]
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

    const [, searchAndHash = ''] = router.asPath.split('?');
    const [search = ''] = searchAndHash.split('#');
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

    if (chainFromQuery && chainFromQuery !== selectedChain) {
      setSelectedChain(chainFromQuery);
    }

    if (hashFromQuery && hashFromQuery !== inputValue) {
      setInputValue(hashFromQuery);
    }

    if (chainFromQuery && hashFromQuery && validateTxHash(hashFromQuery)) {
      const key = `${chainFromQuery}:${hashFromQuery.toLowerCase()}`;
      if (lastFetchedKeyRef.current !== key) {
        lastFetchedKeyRef.current = key;
        handleFetch(hashFromQuery, chainFromQuery);
      }
    }
  }, [router.isReady, router.asPath, router.query, handleFetch, selectedChain, inputValue]);

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
        filename: registrationData.filename,
        sha256Hash: registrationData.cid,
        walletAddress: registrationData.submitter,
        timestamp: Number(registrationData.timestamp) * 1000,
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

  const fetchButtonDisabled = loading || !inputValue;
  const selectedChainId = CHAIN_NAME_TO_ID[selectedChain];
  const transactionUrl =
    registrationData?.txHash ? getTxUrl(selectedChainId, registrationData.txHash) : null;

  return (
    <>
      <Head>
        <title>Generate Certificate - Akashi Notari</title>
        <meta
          name="description"
          content="Generate a proof of existence certificate from a blockchain transaction"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="pixel-page certificate-page">
        <header className="pixel-header">
          <div className="header-row">
            <div className="header-left">
              <div className="logo">証</div>
              <span className="text-md">Akashi Notari | Simple Proof of Existence</span>
            </div>
            <div className="header-right">
              <Link href="/" className="btn">
                HOME
              </Link>
            </div>
          </div>
          <div className="text-xs">
            VERIFY AND TIMESTAMP ANY FILE FOR JUST $1. YOUR PROOF NEVER LEAVES BLOCKCHAIN.
          </div>
        </header>

        <main className="certificate-main">
          <section className="certificate-section">
            <h2 className="section-title">1. LOOK UP TRANSACTION</h2>
            <div className="pixel-box">
              <div className="form-field">
                <label className="pixel-label" htmlFor="certificate-chain">
                  Chain
                </label>
                <select
                  id="certificate-chain"
                  value={selectedChain}
                  onChange={(e) => setSelectedChain(e.target.value as ChainName)}
                  disabled={loading}
                  className="input-select"
                >
                  <option value="base">Base</option>
                  <option value="ethereum">Ethereum</option>
                  <option value="optimism">Optimism</option>
                </select>
              </div>

              <div className="form-field">
                <label className="pixel-label" htmlFor="certificate-hash">
                  Transaction Hash or Block Explorer URL
                </label>
                <input
                  id="certificate-hash"
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  placeholder="0x... or https://basescan.org/tx/0x..."
                  disabled={loading}
                  className="pixel-input"
                />
                <p className="field-hint text-xs">
                  You can paste a transaction hash or a full block explorer URL.
                </p>
              </div>

              <button
                onClick={() => handleFetch()}
                disabled={fetchButtonDisabled}
                className={`btn btn-large btn-full-width ${fetchButtonDisabled ? 'btn-disabled' : ''}`}
              >
                {loading ? 'Loading...' : 'Fetch Transaction Data'}
              </button>
            </div>

            {error && (
              <div className="message-box message-box-error">
                {error}
              </div>
            )}
          </section>

          {registrationData && !error && (
            <section className="certificate-section">
              <h2 className="section-title">2. REGISTRATION DETAILS</h2>
              <div className="pixel-box">
                <div className="info-grid">
                  <div className="info-row">
                    <span className="info-label">Filename</span>
                    <span className="info-value">
                      {registrationData.filename || '(no filename)'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Hash</span>
                    <span className="info-value">{registrationData.cid}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Submitter</span>
                    <span className="info-value">{registrationData.submitter}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Timestamp</span>
                    <span className="info-value">
                      {new Date(Number(registrationData.timestamp) * 1000).toLocaleString()}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Block</span>
                    <span className="info-value">#{registrationData.blockNumber.toString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Chain</span>
                    <span className="info-value">{getNetworkName(selectedChainId)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Transaction</span>
                    <span className="info-value">
                      {transactionUrl ? (
                        <a
                          href={transactionUrl}
                          className="info-link"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {registrationData.txHash}
                        </a>
                      ) : (
                        registrationData.txHash
                      )}
                    </span>
                  </div>
                </div>

                <div className="certificate-actions">
                  <button
                    onClick={handleGeneratePDF}
                    disabled={loading}
                    className={`btn btn-large btn-full-width ${loading ? 'btn-disabled' : ''}`}
                  >
                    {pdfReady ? '✓ Download Certificate' : 'Generate & Download Certificate'}
                  </button>
                </div>
              </div>
            </section>
          )}

          {!registrationData && !error && (
            <section className="certificate-section">
              <div className="pixel-box">
                <div className="text-xs">
                  ENTER A TRANSACTION HASH TO LOAD REGISTRATION DETAILS AND DOWNLOAD THE CERTIFICATE.
                </div>
              </div>
            </section>
          )}

          <div className="certificate-footer">
            <Link href="/" className="pixel-link">
              ← Back to Home
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}