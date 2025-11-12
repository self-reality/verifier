import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { getVerifierRegistryContract, SUPPORTED_CHAIN_IDS } from '../constants/contracts';
import { getCurrencyTicker, roundDownWei, fetchPriceFeed, validateFilename, computeSHA256, formatUnixTime, formatHumanTime, renderProgressBar, getNetworkName, getTxUrl, getExplorerDomain } from '../utils';
import { generateCertificatePDF } from '../utils/pdfGenerator';
import { AboutOverlay } from '../components/AboutOverlay';

// Fee configuration (in cents, e.g., 100 = $1.00, 1 = $0.01)
const FEE_CENTS = 1;

export default function Home() {
  // Wagmi hooks
  const { address: walletAddress, isConnected: walletConnected, chainId } = useAccount();
  const { connectors, connect, error: connectError, reset: resetConnect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: txHash, writeContract, error: writeError, isPending: isTxPending } = useWriteContract();
  const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Fee state
  const [feeAmountWei, setFeeAmountWei] = useState<bigint | null>(null);
  const [feeCurrencyTicker, setFeeCurrencyTicker] = useState<string>('ETH');
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState<string>('');

  // File and UI state
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [hashProgress, setHashProgress] = useState(0);
  const [filename, setFilename] = useState('');
  const [editedFilename, setEditedFilename] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [fileHash, setFileHash] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [downloadClicked, setDownloadClicked] = useState(false);
  const [showResetConfirmOverlay, setShowResetConfirmOverlay] = useState(false);
  const [showConnectorSelection, setShowConnectorSelection] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Message states for each section
  const [uploadMessage, setUploadMessage] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');
  const [downloadMessage, setDownloadMessage] = useState('');
  
  // Network validation state
  const [showNetworkSelector, setShowNetworkSelector] = useState(false);
  
  // About overlay state
  const [showAboutOverlay, setShowAboutOverlay] = useState(false);
  
  // Mounted state to prevent hydration mismatch
  const [mounted, setMounted] = useState(false);

  // Helper function to check if network is supported
  const isNetworkSupported = (chainId: number | undefined): boolean => {
    if (!chainId) return false;
    return SUPPORTED_CHAIN_IDS.includes(chainId as any);
  };

  // Derived states from progress values
  const isUploading = uploadProgress >= 0 && uploadProgress < 100;
  const isHashing = uploadProgress === 100 && hashProgress >= 0 && hashProgress < 100;
  const isUploaded = hashProgress === 100;
  
  // Compute transaction status from wagmi state
  const transactionStatus: 'idle' | 'sent' | 'minted' = 
    isTxConfirmed ? 'minted' : 
    (isTxPending || isTxConfirming) ? 'sent' : 
    'idle';
  
  const transactionHash = txHash || '';

  useEffect(() => {
    // Set initial time only on client side to avoid hydration mismatch
    setMounted(true);
    setCurrentTime(Date.now());
    
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);



  // Fetch price when wallet connects or chain changes
  useEffect(() => {
    if (!walletConnected || !chainId) {
      setFeeAmountWei(null);
      setFeeCurrencyTicker('ETH');
      setFeeLoading(false);
      setFeeError('');
      return;
    }

    const fetchPrice = async () => {
      setFeeLoading(true);
      setFeeError('');
      try {
        const result = await fetchPriceFeed(chainId, FEE_CENTS);
        setFeeAmountWei(result.amountWei);
        setFeeCurrencyTicker(result.ticker);
      } catch (error) {
        console.error('Failed to fetch price:', error);
        setFeeError('Failed to fetch fee');
        setFeeAmountWei(null);
      } finally {
        setFeeLoading(false);
      }
    };

    fetchPrice();
  }, [walletConnected, chainId]);

  // Network validation
  useEffect(() => {
    if (walletConnected && chainId && !isNetworkSupported(chainId)) {
      setVerifyMessage(`[ WARNING ]: You are connected to ${getNetworkName(chainId)}. Please switch to a supported network.`);
    } else if (walletConnected && chainId && isNetworkSupported(chainId)) {
      // Clear warning when on supported network
      if (verifyMessage.includes('WARNING') && verifyMessage.includes('switch to a supported network')) {
        setVerifyMessage('');
      }
    }
  }, [walletConnected, chainId]);

  // Handle connection errors
  useEffect(() => {
    if (connectError) {
      // Close the connector selection overlay
      setShowConnectorSelection(false);
      
      const errorMessage = connectError.message || 'Connection failed';
      if (errorMessage.includes('Proposal expired')) {
        setVerifyMessage('[ ERROR !!! ]: WalletConnect proposal expired. Please try again.');
        // Reset the connection state to allow retry
        setTimeout(() => {
          resetConnect();
          setVerifyMessage('');
        }, 3000);
      } else if (errorMessage.includes('User rejected')) {
        setVerifyMessage('[ ERROR !!! ]: Connection rejected by user');
        setTimeout(() => {
          resetConnect();
          setVerifyMessage('');
        }, 2000);
      } else {
        setVerifyMessage('[ ERROR !!! ]: ' + errorMessage.split('\n')[0]);
        setTimeout(() => {
          resetConnect();
        }, 3000);
      }
    }
  }, [connectError, resetConnect]);

  // Handle write errors
  useEffect(() => {
    if (writeError) {
      const errorMessage = writeError.message || 'Transaction failed';
      if (errorMessage.includes('insufficient funds')) {
        setVerifyMessage('[ ERROR !!! ]: Insufficient funds for transaction fee');
      } else if (errorMessage.includes('User rejected') || errorMessage.includes('User denied')) {
        setVerifyMessage('[ ERROR !!! ]: Transaction rejected by user');
      } else if (errorMessage.includes('filename')) {
        setVerifyMessage('[ ERROR !!! ]: ' + errorMessage);
      } else if (errorMessage.includes('cidv1')) {
        setVerifyMessage('[ ERROR !!! ]: Invalid CID format');
      } else {
        setVerifyMessage('[ ERROR !!! ]: ' + errorMessage.split('\n')[0]);
      }
    }
  }, [writeError]);

  // Show success message when transaction is sent
  useEffect(() => {
    if (txHash && (isTxPending || isTxConfirming) && !isTxConfirmed) {
      const explorerName = chainId ? getNetworkName(chainId) : 'Block Explorer';
      const txUrl = getTxUrl(chainId, txHash);
      setVerifyMessage(`[ SUCCESS ]: Transaction sent! View on ${explorerName}: ${txUrl}`);
    }
  }, [txHash, isTxPending, isTxConfirming, isTxConfirmed, chainId]);

  // Auto-download PDF when transaction is minted
  useEffect(() => {
    const generatePdf = async () => {
      if (!walletAddress || !chainId || !txHash || !feeAmountWei || !fileHash) {
        return;
      }

      try {
        await generateCertificatePDF(
          {
            filename: editedFilename || filename,
            sha256Hash: fileHash,
            walletAddress: walletAddress,
            timestamp: currentTime,
            chainId: chainId,
            transactionHash: txHash,
            feeAmountWei: feeAmountWei,
            feeCurrencyTicker: feeCurrencyTicker,
          }
        );
        
        setDownloadClicked(true);
      } catch (error) {
        console.error('PDF generation error:', error);
        setDownloadMessage('[ ERROR !!! ]: Failed to generate PDF certificate');
      }
    };

    if (isTxConfirmed && !downloadClicked) {
      generatePdf();
    }
  }, [isTxConfirmed, downloadClicked, walletAddress, chainId, txHash, feeAmountWei, fileHash, editedFilename, filename, currentTime, feeCurrencyTicker]);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    const originalName = selectedFile.name;
    const validation = validateFilename(originalName);
    
    if (validation.isValid) {
      setFilename(validation.sanitized);
      setEditedFilename(validation.sanitized);
      
      if (validation.warnings.length > 0) {
        setUploadMessage('[ WARNING ]: ' + validation.warnings.join(', '));
      } else {
        setUploadMessage('');
      }
    } else {
      setFilename('');
      setEditedFilename('');
      setUploadMessage('[ ERROR !!! ]: ' + validation.warnings.join(', '));
      return;
    }
    
    // Initialize progress bars
    setUploadProgress(1);
    setHashProgress(1);
    setFileHash('');
    
    // Start computing SHA-256 hash
    try {
      const hash = await computeSHA256(
        selectedFile,
        (progress) => setUploadProgress(progress),
        (progress) => setHashProgress(progress)
      );
      setFileHash(hash);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to compute hash';
      setUploadMessage('[ ERROR !!! ]: ' + errorMessage);
      setUploadProgress(0);
      setHashProgress(0);
      setFileHash('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setFilename('');
    setEditedFilename('');
    setUploadProgress(0);
    setHashProgress(0);
    setFileHash('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleNewFile = () => {
    setShowResetConfirmOverlay(true);
  };

  const handleConfirmReset = () => {
    // Reset file and transaction state, but keep wallet connected
    setFile(null);
    setFilename('');
    setEditedFilename('');
    setUploadProgress(0);
    setHashProgress(0);
    setFileHash('');
    setTermsAccepted(false);
    setDownloadClicked(false);
    setShowResetConfirmOverlay(false);
    setUploadMessage('');
    setVerifyMessage('');
    setDownloadMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConnectWallet = () => {
    // Clear any previous connection errors
    resetConnect();
    setVerifyMessage('');
    // Show connector selection or connect with first available connector
    if (connectors.length > 0) {
      setShowConnectorSelection(true);
    }
  };

  const handleDisconnectWallet = () => {
    disconnect();
    setVerifyMessage('');
  };

  const handleSwitchNetwork = (targetChainId: number) => {
    try {
      switchChain({ chainId: targetChainId });
      setShowNetworkSelector(false);
      setVerifyMessage('');
    } catch (error) {
      setVerifyMessage('[ ERROR !!! ]: Failed to switch network');
    }
  };

  const handleVerifyOnChain = () => {
    // Clear previous errors
    setVerifyMessage('');
    
    // Validate network
    if (!chainId) {
      setVerifyMessage('[ ERROR !!! ]: Please connect your wallet first');
      return;
    }
    
    if (!isNetworkSupported(chainId)) {
      setVerifyMessage('[ ERROR !!! ]: Unsupported network. Please switch to Base, Ethereum, Optimism, or Polygon');
      setShowNetworkSelector(true);
      return;
    }
    
    // Validate filename one more time before sending
    const validation = validateFilename(editedFilename || filename);
    if (!validation.isValid) {
      setVerifyMessage('[ ERROR !!! ]: Invalid filename: ' + validation.warnings.join(', '));
      return;
    }
    
    // Validate fee is loaded
    if (!feeAmountWei) {
      setVerifyMessage('[ ERROR !!! ]: Fee not loaded yet. Please wait or refresh.');
      return;
    }
    
    // Get contract for current chain
    let contract;
    try {
      contract = getVerifierRegistryContract(chainId);
    } catch (error) {
      setVerifyMessage('[ ERROR !!! ]: Contract not deployed on this network');
      return;
    }
    
    // Call the contract
    try {
      writeContract({
        address: contract.address,
        abi: contract.abi,
        functionName: 'anchor',
        args: [fileHash, validation.sanitized],
        value: feeAmountWei,
      } as any);
    } catch (error: any) {
      setVerifyMessage('[ ERROR !!! ]: ' + (error.message || 'Failed to send transaction'));
    }
  };

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
      </Head>
      <div style={{
        minHeight: '100vh',
        padding: '20px',
        fontSize: 'var(--font-size-sm)',
        lineHeight: 'var(--line-height)'
      }}>
        {/* Header */}
        <header className="pixel-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="logo">
              証 
              </div>
              <span className="text-md">Akashi Notari | Simple Proof of Existence</span>
            </div>
            <div>
              {walletConnected && mounted ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span 
                      className="text-xs" 
                      onClick={() => {
                        if (transactionStatus !== 'sent' && transactionStatus !== 'minted') {
                          setShowNetworkSelector(true);
                        }
                      }}
                      style={{ 
                        opacity: isNetworkSupported(chainId) ? 1 : 0.6,
                        cursor: (transactionStatus === 'sent' || transactionStatus === 'minted') ? 'default' : 'pointer'
                      }}
                    >
                      ↓↑ {getNetworkName(chainId)}
                    </span>
                    <button
                      onClick={handleDisconnectWallet}
                      disabled={transactionStatus === 'sent' || transactionStatus === 'minted'}
                      className={`btn ${(transactionStatus === 'sent' || transactionStatus === 'minted') ? 'btn-disabled' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      CONNECTED
                      <span className={`btn-x-inline ${(transactionStatus === 'sent' || transactionStatus === 'minted') ? 'btn-disabled' : ''}`}>X</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleConnectWallet}
                  className="btn"
                >
                  CONNECT WALLET
                </button>
              )}
            </div>
          </div>
          <div className="text-xs">
            VERIFY AND TIMESTAMP ANY FILE FOR JUST $1. YOUR PROOF NEVER LEAVES BLOCKCHAIN.
          </div>
        </header>

        {/* Upload Section */}
        <section style={{ marginBottom: '20px' }}>
          <h2 className="section-title">
            1. UPLOAD
          </h2>

          {!file && (
            <div
              ref={dropZoneRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="drop-zone"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-sm">
                DROP YOUR FILE HERE OR...
              </div>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
              <button className="btn btn-large">
                SELECT
              </button>
              <br />
               ( your file never leaves your computer )
            </div>
          )}

          {file && (
            <div className="pixel-box">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
                <span className="text-sm">{editedFilename || filename}</span>
                <button 
                  onClick={handleRemoveFile}
                  disabled={transactionStatus === 'sent' || transactionStatus === 'minted'}
                  className={`btn-x ${(transactionStatus === 'sent' || transactionStatus === 'minted') ? 'btn-disabled' : ''}`}>
                  X
                </button>
              </div>

              {uploadProgress > 0 && (
                <div style={{ marginBottom: '15px' }}>
                  <div className="text-xs" style={{ marginBottom: '5px' }}>UPLOAD PROGRESS</div>
                  <div className="progress-bar">{renderProgressBar(uploadProgress)}</div>
                  <div className="text-xs" style={{ marginTop: '5px' }}>{uploadProgress}%</div>
                </div>
              )}

              {hashProgress > 0 && (
                <div>
                  <div className="text-xs" style={{ marginBottom: '5px' }}>HASHING PROGRESS</div>
                  <div className="progress-bar">{renderProgressBar(hashProgress)}</div>
                  <div className="text-xs" style={{ marginTop: '5px' }}>{hashProgress}%</div>
                </div>
              )}
            </div>
            
          )}

          {uploadMessage && (
            <div className="message-box">
              {uploadMessage}
            </div>
          )}

        </section>

        {/* Anchor Section - Always visible, dimmed when inactive */}
        <section style={{ marginBottom: '20px', opacity: isUploaded ? 1 : 0.3 }}>
          <h2 className="section-title">
            2. VERIFY ON CHAIN
          </h2>

            {/* Preview Section */}
            <div className="pixel-box pixel-box-mb">
              <h3 className="subsection-title">
                ON-CHAIN CERTIFICATE PREVIEW
              </h3>
              <div className="text-xs" style={{ marginBottom: '10px' }}>
                THIS WILL APPEAR ON-CHAIN:
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span className="text-xs">YOUR WALLET ADDRESS: </span>
                {mounted && walletConnected ? (
                  <span className="text-xs word-break-all">{walletAddress}</span>
                ) : (
                  <span className="text-xs text-disabled">(CONNECT YOUR WALLET)</span>
                )}
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span className="text-xs">FILENAME: </span>
                <span className="text-xs">{editedFilename || filename}</span>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span className="text-xs">SHA-256 HASH: </span>
                <span className="text-xs word-break-all">{fileHash || '(computing...)'}</span>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span className="text-xs">TIMESTAMP: </span>
                <span className="text-xs">{mounted ? formatHumanTime(currentTime) : '00:00:00'} GMT</span>
              </div>

              <div>
                <span className="text-xs">FEE: </span>
                {mounted && walletConnected ? (
                  feeError ? (
                    <span className="text-xs" style={{ color: 'var(--color-accent)' }}>ERROR FETCHING FEE</span>
                  ) : feeLoading ? (
                    <span className="text-xs" style={{ opacity: 0.6 }}>LOADING...</span>
                  ) : feeAmountWei ? (
                    <span className="text-xs">
                      {(Number(feeAmountWei) / 1e18).toFixed(6)} {feeCurrencyTicker} ($1)
                    </span>
                  ) : (
                    <span className="text-xs text-disabled">LOADING...</span>
                  )
                ) : (
                  <span className="text-xs text-disabled">(CONNECT YOUR WALLET)</span>
                )}
              </div>
            </div>

            {/* Transaction Section */}
            <div className="pixel-box">
              <h3 className="subsection-title">
                VERIFY ON CHAIN
              </h3>

              <div className="text-xs" style={{ marginBottom: '15px' }}>
                STATUS: <span className={transactionStatus === 'sent' || transactionStatus === 'minted' ? '' : 'text-disabled'}>TRANSACTION SENT</span> | <span className={transactionStatus === 'minted' ? '' : 'text-disabled'}>TRANSACTION MINED</span>
              </div>

              <div className="text-xs" style={{ marginBottom: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="input-checkbox"
                  />
                  <span>
                    FILE NEVER LEAVES YOUR COMPUTER. KEEP IT SAFE & UNMODIFIED TO VERIFY LATER.
                  </span>
                </label>
              </div>

              <button
                onClick={handleVerifyOnChain}
                disabled={!isUploaded || !walletConnected || !termsAccepted || transactionStatus === 'minted' || !feeAmountWei || feeLoading}
                className={`btn btn-large btn-full-width ${isUploaded && walletConnected && termsAccepted && transactionStatus !== 'minted' && feeAmountWei && !feeLoading ? '' : 'btn-disabled'}`}
              >
                VERIFY ON CHAIN
              </button>
            </div>

          {verifyMessage && editedFilename !== 'hide' && (
            <div className="message-box">
              {verifyMessage}
            </div>
          )}

        </section>

        {/* Certificate Section - Always visible, dimmed when inactive */}
        <section style={{ opacity: transactionStatus === 'minted' ? 1 : 0.3 }}>
          <h2 className="section-title">
            3. DOWNLOAD PDF CERTIFICATE
          </h2>

            {/* Certificate Info Section */}
            <div className="pixel-box pixel-box-mb">
              <div className="text-xs" style={{ marginBottom: '15px' }}>
                THE CERTIFICATE INCLUDES:
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span className="text-xs">NETWORK NAME: </span>
                {mounted && walletConnected ? (
                  <span className="text-xs">{getNetworkName(chainId).toUpperCase()}</span>
                ) : (
                  <span className="text-xs text-disabled">(CONNECT YOUR WALLET)</span>
                )}
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span className="text-xs">TRANSACTION HASH: </span>
                {transactionHash ? (
                  <span className="text-xs word-break-all">{transactionHash}</span>
                ) : (
                  <span className="text-xs text-disabled">(SEND VERIFICATION TRANSACTION)</span>
                )}
              </div>

              <div style={{ marginBottom: '15px' }}>
                <span className="text-xs">TRANSACTION URL: </span>
                {transactionHash && chainId ? (
                  <a 
                    href={getTxUrl(chainId, transactionHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs word-break-all"
                    style={{ 
                      color: 'var(--color-accent)',
                      textDecoration: 'underline',
                      cursor: 'pointer'
                    }}
                  >
                    {getTxUrl(chainId, transactionHash).toUpperCase()}
                  </a>
                ) : (
                  <span className="text-xs text-disabled">(SEND VERIFICATION TRANSACTION)</span>
                )}
              </div>

              <div className="text-xs">
                ADDITIONALLY: ALL OF THE ON-CHAIN DATA FROM ANCHOR SECTION ABOVE, TRANSACTION URL QR, VERIFICATION INSTRUCTIONS, LEGAL INFO.
              </div>
            </div>

            {/* Download Section */}
            <div className="pixel-box" style={{ textAlign: 'center' }}>
              <button
                onClick={async () => {
                  if (!walletAddress || !chainId || !txHash || !feeAmountWei) {
                    setDownloadMessage('[ ERROR !!! ]: Missing required data for certificate');
                    return;
                  }

                  try {
                    setDownloadMessage('[ INFO ]: Generating PDF certificate...');
                    
                    await generateCertificatePDF(
                      {
                        filename: editedFilename || filename,
                        sha256Hash: fileHash,
                        walletAddress: walletAddress,
                        timestamp: currentTime,
                        chainId: chainId,
                        transactionHash: txHash,
                        feeAmountWei: feeAmountWei,
                        feeCurrencyTicker: feeCurrencyTicker,
                      }
                    );
                    
                    setDownloadClicked(true);
                    setDownloadMessage('[ SUCCESS ]: PDF certificate generated and downloaded!');
                  } catch (error) {
                    console.error('PDF generation error:', error);
                    setDownloadMessage('[ ERROR !!! ]: Failed to generate PDF certificate');
                  }
                }}
                disabled={transactionStatus !== 'minted'}
                className={`btn btn-large btn-full-width ${transactionStatus === 'minted' ? '' : 'btn-disabled'}`}
                style={{
                  padding: '15px 30px',
                  marginBottom: '15px'
                }}
              >
                DOWNLOAD PDF
              </button>
              <button
                onClick={handleNewFile}
                disabled={transactionStatus !== 'minted' || !downloadClicked}
                className={`btn btn-large btn-full-width ${(transactionStatus === 'minted' && downloadClicked) ? '' : 'btn-disabled'}`}
                style={{
                  padding: '15px 30px'
                }}
              >
                NEW FILE
              </button>
            </div>

          <div style={{ 
            textAlign: 'right', 
            fontSize: 'var(--font-size-xs)', 
            marginTop: '10px' 
          }}>
            <span 
              onClick={() => setShowAboutOverlay(true)}
              style={{ 
                cursor: 'pointer',
                textDecoration: 'underline',
                opacity: 0.7
              }}
            >
              ABOUT
            </span>
          </div>

          {downloadMessage && editedFilename !== 'hide' && (
            <div className="message-box">
              {downloadMessage}
            </div>
          )}

        </section>

        {/* Connector Selection Overlay */}
        {showConnectorSelection && (
          <div className="overlay">
            <div className="overlay-content">
              <h3 className="subsection-title">
                SELECT WALLET
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {connectors.map((connector) => (
                  <button
                    key={connector.id}
                    onClick={() => {
                      resetConnect(); // Clear any previous errors
                      connect({ connector });
                      setShowConnectorSelection(false);
                    }}
                    className="btn btn-large"
                  >
                    {connector.name}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setShowConnectorSelection(false);
                    resetConnect();
                  }}
                  className="btn btn-large"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reset Confirmation Overlay */}
        {showResetConfirmOverlay && (
          <div className="overlay">
            <div className="overlay-content">
              <div className="text-xs" style={{
                marginBottom: '20px',
                lineHeight: '1.8'
              }}>
                DID YOU SAVE YOUR PDF? YOU CAN STILL FIND THE TRANSACTION IN YOUR WALLET, BUT HAVING THE PDF IS MORE CONVENIENT.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={handleConfirmReset}
                  className="btn btn-large"
                >
                  YES, I SAVED IT
                </button>
                <button
                  onClick={() => setShowResetConfirmOverlay(false)}
                  className="btn btn-large"
                >
                  NO, LET ME SAVE IT
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Network Selection Overlay */}
        {showNetworkSelector && (
          <div className="overlay">
            <div className="overlay-content">
              <h3 className="subsection-title">
                SELECT NETWORK
              </h3>
              <div className="text-xs" style={{ marginBottom: '15px', opacity: 0.7 }}>
                CHOOSE A SUPPORTED NETWORK:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {SUPPORTED_CHAIN_IDS.map((supportedChainId) => (
                  <button
                    key={supportedChainId}
                    onClick={() => handleSwitchNetwork(supportedChainId)}
                    className="btn btn-large"
                  >
                    {getNetworkName(supportedChainId)}
                  </button>
                ))}
                <button
                  onClick={() => setShowNetworkSelector(false)}
                  className="btn btn-large"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* About Overlay */}
        {showAboutOverlay && (
          <AboutOverlay onClose={() => setShowAboutOverlay(false)} />
        )}
      </div>
    </>
  );
}
