import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [hashProgress, setHashProgress] = useState(0);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [filename, setFilename] = useState('');
  const [editedFilename, setEditedFilename] = useState('');
  const [showEditOverlay, setShowEditOverlay] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<'idle' | 'sent' | 'minted'>('idle');
  const [transactionHash, setTransactionHash] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [mockCID, setMockCID] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [downloadClicked, setDownloadClicked] = useState(false);
  const [showResetConfirmOverlay, setShowResetConfirmOverlay] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Derived states from progress values
  const isUploading = uploadProgress > 0 && uploadProgress < 100;
  const isHashing = uploadProgress === 100 && hashProgress > 0 && hashProgress < 100;
  const isUploaded = hashProgress === 100;

  // These style objects are no longer needed - using CSS classes instead

  useEffect(() => {
    // Generate CID and set initial time only on client side to avoid hydration mismatch
    setMockCID('Qm' + Math.random().toString(36).substr(2, 43));
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

  useEffect(() => {
    // Start PDF generation automatically when transaction is minted
    if (transactionStatus === 'minted' && pdfProgress === 0) {
      setPdfProgress(1);
    }
  }, [transactionStatus, pdfProgress]);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setFilename(selectedFile.name);
    setEditedFilename(selectedFile.name);
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
    setTransactionStatus('idle');
    setTransactionHash('');
    setTermsAccepted(false);
    setDownloadClicked(false);
    setPdfProgress(0);
    setShowResetConfirmOverlay(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConnectWallet = () => {
    setWalletConnected(true);
    setWalletAddress('0x' + Math.random().toString(16).substr(2, 40));
  };

  const handleDisconnectWallet = () => {
    setWalletConnected(false);
    setWalletAddress('');
    setTransactionStatus('idle');
    setTransactionHash('');
  };

  const handleVerifyOnChain = () => {
    setTransactionStatus('sent');
    setTimeout(() => {
      setTransactionStatus('minted');
      setTransactionHash('0x' + Math.random().toString(16).substr(2, 64));
    }, 2000);
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
              {walletConnected ? (
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
                {walletConnected ? (
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
                  <span className="text-xs word-break-all">
                    HTTPS://ETHERSCAN.IO/TX/{transactionHash}
                  </span>
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
                onChange={(e) => setEditedFilename(e.target.value)}
                className="input-text"
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => {
                    setEditedFilename(filename);
                    setShowEditOverlay(false);
                  }}
                  className="btn btn-large"
                  style={{ flex: 1 }}
                >
                  CANCEL
                </button>
                <button
                  onClick={() => setShowEditOverlay(false)}
                  className="btn btn-large"
                  style={{ flex: 1 }}
                >
                  SAVE
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
