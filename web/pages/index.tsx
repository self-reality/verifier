import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { verifierRegistryContract } from '../constants/contracts';

export default function Home() {
  // Wagmi hooks
  const { address: walletAddress, isConnected: walletConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: txHash, writeContract, error: writeError, isPending: isTxPending } = useWriteContract();
  const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // File and UI state
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [hashProgress, setHashProgress] = useState(0);
  const [filename, setFilename] = useState('');
  const [editedFilename, setEditedFilename] = useState('');
  const [showEditOverlay, setShowEditOverlay] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mockCID, setMockCID] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [downloadClicked, setDownloadClicked] = useState(false);
  const [showResetConfirmOverlay, setShowResetConfirmOverlay] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [showConnectorSelection, setShowConnectorSelection] = useState(false);
  const [filenameEditWarning, setFilenameEditWarning] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Message states for each section
  const [uploadMessage, setUploadMessage] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');
  const [downloadMessage, setDownloadMessage] = useState('[ INFO ]: PDF generation may take up to 30 seconds');
  
  // Mounted state to prevent hydration mismatch
  const [mounted, setMounted] = useState(false);

  // Derived states from progress values
  const isUploading = uploadProgress > 0 && uploadProgress < 100;
  const isHashing = uploadProgress === 100 && hashProgress > 0 && hashProgress < 100;
  const isUploaded = hashProgress === 100;
  
  // Compute transaction status from wagmi state
  const transactionStatus: 'idle' | 'sent' | 'minted' = 
    isTxConfirmed ? 'minted' : 
    (isTxPending || isTxConfirming) ? 'sent' : 
    'idle';
  
  const transactionHash = txHash || '';

  // Filename validation utility
  const validateFilename = (name: string): { isValid: boolean; sanitized: string; warnings: string[] } => {
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
  const generateCIDv1 = () => {
    const base32Chars = 'abcdefghijklmnopqrstuvwxyz234567';
    let cid = 'bafy';
    for (let i = 0; i < 55; i++) {
      cid += base32Chars[Math.floor(Math.random() * base32Chars.length)];
    }
    return cid;
  };

  useEffect(() => {
    // Generate CIDv1 and set initial time only on client side to avoid hydration mismatch
    setMounted(true);
    setMockCID(generateCIDv1());
    setCurrentTime(Date.now());
    
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (uploadProgress > 0 && uploadProgress < 100) {
      const timer = setTimeout(() => {
        setUploadProgress(prev => Math.min(prev + 5, 100));
      }, 30);
      return () => clearTimeout(timer);
    } else if (uploadProgress === 100 && hashProgress === 0) {
      // Automatically start hashing when upload completes
      setHashProgress(1);
    }
  }, [uploadProgress, hashProgress]);

  useEffect(() => {
    if (hashProgress > 0 && hashProgress < 100) {
      const timer = setTimeout(() => {
        setHashProgress(prev => Math.min(prev + 5, 100));
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [hashProgress]);

  useEffect(() => {
    if (pdfProgress > 0 && pdfProgress < 100) {
      const timer = setTimeout(() => {
        setPdfProgress(prev => Math.min(prev + 5, 100));
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [pdfProgress]);

  // Watch for transaction confirmation and start PDF generation
  useEffect(() => {
    if (isTxConfirmed && pdfProgress === 0) {
      setPdfProgress(1);
    }
  }, [isTxConfirmed, pdfProgress]);

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
      setVerifyMessage(`[ SUCCESS ]: Transaction sent! View on Basescan: https://basescan.org/tx/${txHash}`);
    }
  }, [txHash, isTxPending, isTxConfirming, isTxConfirmed]);

  const handleFileSelect = (selectedFile: File) => {
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
    
    setHashProgress(0);
    setUploadProgress(1); // Kick off upload progress
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
    setTermsAccepted(false);
    setDownloadClicked(false);
    setPdfProgress(0);
    setShowResetConfirmOverlay(false);
    setUploadMessage('');
    setVerifyMessage('');
    setDownloadMessage('[ INFO ]: PDF generation may take up to 30 seconds');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConnectWallet = () => {
    // Show connector selection or connect with first available connector
    if (connectors.length > 0) {
      setShowConnectorSelection(true);
    }
  };

  const handleDisconnectWallet = () => {
    disconnect();
    setVerifyMessage('');
  };

  const handleVerifyOnChain = () => {
    // Clear previous errors
    setVerifyMessage('');
    
    // Validate filename one more time before sending
    const validation = validateFilename(editedFilename || filename);
    if (!validation.isValid) {
      setVerifyMessage('[ ERROR !!! ]: Invalid filename: ' + validation.warnings.join(', '));
      return;
    }
    
    // Call the contract
    try {
      writeContract({
        address: verifierRegistryContract.address,
        abi: verifierRegistryContract.abi,
        functionName: 'anchor',
        args: [mockCID, validation.sanitized],
        value: BigInt(0), // Hardcoded fee of 0 for now
      } as any);
    } catch (error: any) {
      setVerifyMessage('[ ERROR !!! ]: ' + (error.message || 'Failed to send transaction'));
    }
  };

  const formatUnixTime = (timestamp: number) => {
    return Math.floor(timestamp / 1000).toString();
  };

  const formatHumanTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const renderProgressBar = (progress: number) => {
    const blocks = 20;
    const filled = Math.floor((progress / 100) * blocks);
    return '█'.repeat(filled) + '░'.repeat(blocks - filled);
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
                P
              </div>
              <span className="text-md">PROOF OF EXISTENCE</span>
            </div>
            <div>
              {walletConnected && mounted ? (
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
            VERIFY ANY DOC ON BLOCKCHAIN FOR JUST $1. (YOUR FILE NEVER LEAVES YOUR COMPUTER).
          </div>
        </header>

        {/* Upload Section */}
        <section style={{ marginBottom: '20px' }}>
          <h2 className="section-title">
            1. UPLOAD
          </h2>

          {!file && !isUploading && !isHashing && !isUploaded && (
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
            </div>
          )}

          {(isUploading || isHashing || isUploaded) && file && (
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
                {walletConnected ? (
                  <span className="text-xs word-break-all">{walletAddress}</span>
                ) : (
                  <span className="text-xs text-disabled">(CONNECT YOUR WALLET)</span>
                )}
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span className="text-xs">FILENAME: </span>
                <span className="text-xs">{editedFilename || filename}</span>
                <button
                  onClick={() => setShowEditOverlay(true)}
                  disabled={!isUploaded || transactionStatus === 'sent' || transactionStatus === 'minted'}
                  className={`btn ${(isUploaded && transactionStatus !== 'sent' && transactionStatus !== 'minted') ? '' : 'btn-disabled'}`}
                  style={{
                    padding: '4px 8px',
                    marginLeft: '10px'
                  }}
                >
                  EDIT
                </button>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span className="text-xs">CID: </span>
                <span className="text-xs word-break-all">{mockCID}</span>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span className="text-xs">TIMESTAMP: </span>
                <span className="text-xs">{formatHumanTime(currentTime)} GMT</span>
              </div>

              <div>
                <span className="text-xs">FEE: </span>
                {walletConnected ? (
                  <span className="text-xs">0.001 ETH (APPROX $1)</span>
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

              <div style={{ marginBottom: '15px' }}>
                {walletConnected && mounted ? (
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
                ) : (
                  <button
                    onClick={handleConnectWallet}
                    className="btn"
                  >
                    CONNECT WALLET
                  </button>
                )}
              </div>

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
                disabled={!isUploaded || !walletConnected || !termsAccepted || transactionStatus === 'minted'}
                className={`btn btn-large btn-full-width ${isUploaded && walletConnected && termsAccepted && transactionStatus !== 'minted' ? '' : 'btn-disabled'}`}
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
                {walletConnected ? (
                  <span className="text-xs">ETHEREUM MAINNET</span>
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
                {transactionHash ? (
                  <a 
                    href={`https://basescan.org/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs word-break-all"
                    style={{ 
                      color: 'var(--color-accent)',
                      textDecoration: 'underline',
                      cursor: 'pointer'
                    }}
                  >
                    HTTPS://BASESCAN.ORG/TX/{transactionHash}
                  </a>
                ) : (
                  <span className="text-xs text-disabled">(SEND VERIFICATION TRANSACTION)</span>
                )}
              </div>

              <div className="text-xs" style={{ marginBottom: pdfProgress > 0 ? '15px' : '0' }}>
                ADDITIONALLY: ALL OF THE ON-CHAIN DATA FROM ANCHOR SECTION ABOVE, TRANSACTION URL QR, VERIFICATION INSTRUCTIONS, LEGAL INFO.
              </div>

              {pdfProgress > 0 && (
                <div>
                  <div className="text-xs" style={{ marginBottom: '5px' }}>PDF GENERATION PROGRESS</div>
                  <div className="progress-bar">{renderProgressBar(pdfProgress)}</div>
                  <div className="text-xs" style={{ marginTop: '5px' }}>{pdfProgress}%</div>
                </div>
              )}
            </div>

            {/* Download Section */}
            <div className="pixel-box" style={{ textAlign: 'center' }}>
              <button
                onClick={() => {
                  setDownloadClicked(true);
                }}
                disabled={pdfProgress < 100}
                className={`btn btn-large btn-full-width ${pdfProgress === 100 ? '' : 'btn-disabled'}`}
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

          {downloadMessage && editedFilename !== 'hide' && (
            <div className="message-box">
              {downloadMessage}
            </div>
          )}

        </section>

        {/* Edit Filename Overlay */}
        {showEditOverlay && (
          <div className="overlay">
            <div className="overlay-content">
              <h3 className="subsection-title">
                EDIT FILENAME
              </h3>
              <input
                type="text"
                value={editedFilename}
                onChange={(e) => {
                  const input = e.target.value;
                  const validation = validateFilename(input);
                  setEditedFilename(validation.sanitized);
                  if (validation.warnings.length > 0) {
                    setFilenameEditWarning(validation.warnings.join(', '));
                  } else {
                    setFilenameEditWarning('');
                  }
                }}
                className="input-text"
                style={{ marginBottom: '10px' }}
              />
              {filenameEditWarning && (
                <div className="text-xs" style={{ 
                  marginBottom: '15px',
                  color: 'var(--color-accent)',
                  opacity: 0.7
                }}>
                  {filenameEditWarning}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => {
                    setEditedFilename(filename);
                    setFilenameEditWarning('');
                    setShowEditOverlay(false);
                  }}
                  className="btn btn-large"
                  style={{ flex: 1 }}
                >
                  CANCEL
                </button>
                <button
                  onClick={() => {
                    setFilenameEditWarning('');
                    setShowEditOverlay(false);
                  }}
                  className="btn btn-large"
                  style={{ flex: 1 }}
                >
                  SAVE
                </button>
              </div>
            </div>
          </div>
        )}

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
                      connect({ connector });
                      setShowConnectorSelection(false);
                    }}
                    className="btn btn-large"
                  >
                    {connector.name}
                  </button>
                ))}
                <button
                  onClick={() => setShowConnectorSelection(false)}
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
      </div>
    </>
  );
}
