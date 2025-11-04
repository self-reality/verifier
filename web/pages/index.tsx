import React, { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [hashProgress, setHashProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isHashing, setIsHashing] = useState(false);
  const [isUploaded, setIsUploaded] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [filename, setFilename] = useState('');
  const [editedFilename, setEditedFilename] = useState('');
  const [showEditOverlay, setShowEditOverlay] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<'idle' | 'sent' | 'minted'>('idle');
  const [transactionHash, setTransactionHash] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [mockCID, setMockCID] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Shared X button styles
  const xButtonStyle = {
    border: '2px solid #DDFFE7',
    backgroundColor: '#343434',
    display: 'inline-block',
    lineHeight: '8px',
    padding: '4px'
  };

  const xButtonStandaloneStyle = {
    border: '2px solid #DDFFE7',
    backgroundColor: '#343434',
    color: '#DDFFE7',
    cursor: 'pointer',
    fontFamily: "'Press Start 2P', monospace",
    fontSize: '12px',
    width: '24px',
    height: '24px',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: '1'
  };

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
    if (isUploading && uploadProgress < 100) {
      const timer = setTimeout(() => {
        setUploadProgress(prev => Math.min(prev + 2, 100));
      }, 50);
      return () => clearTimeout(timer);
    } else if (isUploading && uploadProgress === 100) {
      setIsUploading(false);
      setIsHashing(true);
      setHashProgress(0);
    }
  }, [isUploading, uploadProgress]);

  useEffect(() => {
    if (isHashing && hashProgress < 100) {
      const timer = setTimeout(() => {
        setHashProgress(prev => Math.min(prev + 3, 100));
      }, 50);
      return () => clearTimeout(timer);
    } else if (isHashing && hashProgress === 100) {
      setIsHashing(false);
      setIsUploaded(true);
    }
  }, [isHashing, hashProgress]);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setFilename(selectedFile.name);
    setEditedFilename(selectedFile.name);
    setUploadProgress(0);
    setHashProgress(0);
    setIsUploading(true);
    setIsUploaded(false);
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
    setIsUploading(false);
    setIsHashing(false);
    setIsUploaded(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
        fontFamily: "'Press Start 2P', monospace",
        backgroundColor: '#343434',
        color: '#DDFFE7',
        minHeight: '100vh',
        padding: '20px',
        fontSize: '10px',
        lineHeight: '1.6'
      }}>
        {/* Header */}
        <header style={{
          border: '3px solid #DDFFE7',
          padding: '15px',
          marginBottom: '20px',
          backgroundColor: '#343434'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '30px',
                height: '30px',
                border: '2px solid #DDFFE7',
                backgroundColor: '#DDFFE7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#343434'
              }}>
                P
              </div>
              <span style={{ fontSize: '12px' }}>PROOF OF EXISTENCE</span>
            </div>
            <div>
              {walletConnected ? (
                <button
                  onClick={handleDisconnectWallet}
                  style={{
                    border: '2px solid #DDFFE7',
                    backgroundColor: '#343434',
                    color: '#DDFFE7',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  CONNECTED
                  <span style={xButtonStyle}>X</span>
                </button>
              ) : (
                <button
                  onClick={handleConnectWallet}
                  style={{
                    border: '2px solid #DDFFE7',
                    backgroundColor: '#343434',
                    color: '#DDFFE7',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '8px'
                  }}
                >
                  CONNECT WALLET
                </button>
              )}
            </div>
          </div>
          <div style={{ fontSize: '8px', color: '#DDFFE7' }}>
            VERIFY ANY DOC ON BLOCKCHAIN FOR JUST $1. (YOUR FILE NEVER LEAVES YOUR COMPUTER).
          </div>
        </header>

        {/* Upload Section */}
        <section style={{ marginBottom: '20px' }}>
          <h2 style={{
            fontSize: '12px',
            marginBottom: '15px',
            textTransform: 'uppercase',
            borderBottom: '2px solid #DDFFE7',
            paddingBottom: '8px'
          }}>
            1. UPLOAD
          </h2>

          {!file && !isUploading && !isHashing && !isUploaded && (
            <div
              ref={dropZoneRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              style={{
                border: '3px dashed #DDFFE7',
                padding: '40px',
                textAlign: 'center',
                backgroundColor: '#343434',
                cursor: 'pointer',
                minHeight: '150px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '15px'
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={{ fontSize: '10px' }}>
                DROP YOUR FILE HERE OR...
              </div>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
              <button
                style={{
                  border: '2px solid #DDFFE7',
                  backgroundColor: '#343434',
                  color: '#DDFFE7',
                  padding: '10px 20px',
                  cursor: 'pointer',
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '10px'
                }}
              >
                SELECT
              </button>
            </div>
          )}

          {(isUploading || isHashing || isUploaded) && file && (
            <div style={{
              border: '3px solid #DDFFE7',
              padding: '20px',
              backgroundColor: '#343434'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
                <span style={{ fontSize: '10px' }}>{editedFilename || filename}</span>
                <button onClick={handleRemoveFile} style={xButtonStandaloneStyle}>
                  X
                </button>
              </div>

              {isUploading && (
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '8px', marginBottom: '5px' }}>UPLOAD PROGRESS</div>
                  <div style={{ fontSize: '12px', letterSpacing: '2px' }}>{renderProgressBar(uploadProgress)}</div>
                  <div style={{ fontSize: '8px', marginTop: '5px' }}>{uploadProgress}%</div>
                </div>
              )}

              {isHashing && (
                <div>
                  <div style={{ fontSize: '8px', marginBottom: '5px' }}>HASHING PROGRESS</div>
                  <div style={{ fontSize: '12px', letterSpacing: '2px' }}>{renderProgressBar(hashProgress)}</div>
                  <div style={{ fontSize: '8px', marginTop: '5px' }}>{hashProgress}%</div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Anchor Section - Always visible, dimmed when inactive */}
        <section style={{ marginBottom: '20px', opacity: isUploaded ? 1 : 0.3 }}>
          <h2 style={{
            fontSize: '12px',
            marginBottom: '15px',
            textTransform: 'uppercase',
            borderBottom: '2px solid #DDFFE7',
            paddingBottom: '8px'
          }}>
            2. VERIFY ON CHAIN
          </h2>

            {/* Preview Section */}
            <div style={{
              border: '3px solid #DDFFE7',
              padding: '20px',
              marginBottom: '20px',
              backgroundColor: '#343434'
            }}>
              <h3 style={{
                fontSize: '10px',
                marginBottom: '15px',
                textTransform: 'uppercase'
              }}>
                ON-CHAIN CERTIFICATE PREVIEW
              </h3>
              <div style={{ fontSize: '8px', marginBottom: '10px' }}>
                THIS WILL APPEAR ON-CHAIN:
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span style={{ fontSize: '8px' }}>YOUR WALLET ADDRESS: </span>
                {walletConnected ? (
                  <span style={{ fontSize: '8px', wordBreak: 'break-all' }}>{walletAddress}</span>
                ) : (
                  <span style={{ fontSize: '8px', color: '#888' }}>(CONNECT YOUR WALLET)</span>
                )}
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span style={{ fontSize: '8px' }}>FILENAME: </span>
                <span style={{ fontSize: '8px' }}>{editedFilename || filename}</span>
                <button
                  onClick={() => setShowEditOverlay(true)}
                  style={{
                    border: '2px solid #DDFFE7',
                    backgroundColor: '#343434',
                    color: '#DDFFE7',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '8px',
                    marginLeft: '10px'
                  }}
                >
                  EDIT
                </button>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span style={{ fontSize: '8px' }}>CID: </span>
                <span style={{ fontSize: '8px', wordBreak: 'break-all' }}>{mockCID}</span>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span style={{ fontSize: '8px' }}>TIMESTAMP: </span>
                <span style={{ fontSize: '8px' }}>{formatHumanTime(currentTime)} GMT</span>
              </div>

              <div>
                <span style={{ fontSize: '8px' }}>FEE: </span>
                {walletConnected ? (
                  <span style={{ fontSize: '8px' }}>0.001 ETH (APPROX $1)</span>
                ) : (
                  <span style={{ fontSize: '8px', color: '#888' }}>(CONNECT YOUR WALLET)</span>
                )}
              </div>
            </div>

            {/* Transaction Section */}
            <div style={{
              border: '3px solid #DDFFE7',
              padding: '20px',
              backgroundColor: '#343434'
            }}>
              <h3 style={{
                fontSize: '10px',
                marginBottom: '15px',
                textTransform: 'uppercase'
              }}>
                VERIFY ON CHAIN
              </h3>

              <div style={{ marginBottom: '15px' }}>
                {walletConnected ? (
                  <button
                    onClick={handleDisconnectWallet}
                    style={{
                      border: '2px solid #DDFFE7',
                      backgroundColor: '#343434',
                      color: '#DDFFE7',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    CONNECTED
                    <span style={xButtonStyle}>X</span>
                  </button>
                ) : (
                  <button
                    onClick={handleConnectWallet}
                    style={{
                      border: '2px solid #DDFFE7',
                      backgroundColor: '#343434',
                      color: '#DDFFE7',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: '8px'
                    }}
                  >
                    CONNECT WALLET
                  </button>
                )}
              </div>

              <div style={{ marginBottom: '15px', fontSize: '8px' }}>
                STATUS:
                <div style={{ marginLeft: '10px', marginTop: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                    {transactionStatus !== 'idle' ? '✓' : ' '} WALLET CONNECTED
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                    {transactionStatus === 'sent' || transactionStatus === 'minted' ? '✓' : ' '} TRANSACTION SENT
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {transactionStatus === 'minted' ? '✓' : ' '} TRANSACTION MINED
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '15px', fontSize: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    style={{ width: '12px', height: '12px', marginTop: '2px' }}
                  />
                  <span>
                    I UNDERSTAND THAT THE FILE ITSELF IS NOT SENT ANYWHERE, I WILL KEEP IT IN A SAFE PLACE AND WILL NOT MODIFY IT. THIS IS THE ONLY WAY TO VERIFY THE VERIFICATION.
                  </span>
                </label>
              </div>

              <button
                onClick={handleVerifyOnChain}
                disabled={!walletConnected || transactionStatus === 'minted'}
                style={{
                  border: '2px solid #DDFFE7',
                  backgroundColor: walletConnected && transactionStatus !== 'minted' ? '#343434' : '#222',
                  color: walletConnected && transactionStatus !== 'minted' ? '#DDFFE7' : '#888',
                  padding: '10px 20px',
                  cursor: walletConnected && transactionStatus !== 'minted' ? 'pointer' : 'not-allowed',
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '10px',
                  width: '100%'
                }}
              >
                VERIFY ON CHAIN
              </button>
            </div>
        </section>

        {/* Certificate Section - Always visible, dimmed when inactive */}
        <section style={{ opacity: transactionStatus === 'minted' ? 1 : 0.3 }}>
          <h2 style={{
            fontSize: '12px',
            marginBottom: '15px',
            textTransform: 'uppercase',
            borderBottom: '2px solid #DDFFE7',
            paddingBottom: '8px'
          }}>
            3. DOWNLOAD PDF CERTIFICATE
          </h2>

            {/* Certificate Info Section */}
            <div style={{
              border: '3px solid #DDFFE7',
              padding: '20px',
              marginBottom: '20px',
              backgroundColor: '#343434'
            }}>
              <div style={{ fontSize: '8px', marginBottom: '15px' }}>
                THE CERTIFICATE INCLUDES:
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span style={{ fontSize: '8px' }}>NETWORK NAME: </span>
                {walletConnected ? (
                  <span style={{ fontSize: '8px' }}>ETHEREUM MAINNET</span>
                ) : (
                  <span style={{ fontSize: '8px', color: '#888' }}>(CONNECT YOUR WALLET)</span>
                )}
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span style={{ fontSize: '8px' }}>TRANSACTION HASH: </span>
                {transactionHash ? (
                  <span style={{ fontSize: '8px', wordBreak: 'break-all' }}>{transactionHash}</span>
                ) : (
                  <span style={{ fontSize: '8px', color: '#888' }}>(SEND VERIFICATION TRANSACTION)</span>
                )}
              </div>

              <div style={{ marginBottom: '15px' }}>
                <span style={{ fontSize: '8px' }}>TRANSACTION URL: </span>
                {transactionHash ? (
                  <span style={{ fontSize: '8px', wordBreak: 'break-all' }}>
                    HTTPS://ETHERSCAN.IO/TX/{transactionHash}
                  </span>
                ) : (
                  <span style={{ fontSize: '8px', color: '#888' }}>(SEND VERIFICATION TRANSACTION)</span>
                )}
              </div>

              <div style={{ fontSize: '8px', color: '#DDFFE7' }}>
                ADDITIONALLY: ALL OF THE ON-CHAIN DATA FROM ANCHOR SECTION ABOVE, TRANSACTION URL QR, VERIFICATION INSTRUCTIONS, LEGAL INFO.
              </div>
            </div>

            {/* Download Section */}
            <div style={{
              border: '3px solid #DDFFE7',
              padding: '20px',
              backgroundColor: '#343434',
              textAlign: 'center'
            }}>
              <button
                style={{
                  border: '2px solid #DDFFE7',
                  backgroundColor: '#343434',
                  color: '#DDFFE7',
                  padding: '15px 30px',
                  cursor: 'pointer',
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '10px',
                  width: '100%'
                }}
              >
                DOWNLOAD PDF
              </button>
            </div>
        </section>

        {/* Edit Filename Overlay */}
        {showEditOverlay && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              border: '3px solid #DDFFE7',
              padding: '30px',
              backgroundColor: '#343434',
              maxWidth: '500px',
              width: '90%'
            }}>
              <h3 style={{
                fontSize: '10px',
                marginBottom: '20px',
                textTransform: 'uppercase'
              }}>
                EDIT FILENAME
              </h3>
              <input
                type="text"
                value={editedFilename}
                onChange={(e) => setEditedFilename(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #DDFFE7',
                  backgroundColor: '#343434',
                  color: '#DDFFE7',
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '8px',
                  marginBottom: '20px'
                }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => {
                    setEditedFilename(filename);
                    setShowEditOverlay(false);
                  }}
                  style={{
                    border: '2px solid #DDFFE7',
                    backgroundColor: '#343434',
                    color: '#DDFFE7',
                    padding: '10px 20px',
                    cursor: 'pointer',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '8px',
                    flex: 1
                  }}
                >
                  CANCEL
                </button>
                <button
                  onClick={() => setShowEditOverlay(false)}
                  style={{
                    border: '2px solid #DDFFE7',
                    backgroundColor: '#343434',
                    color: '#DDFFE7',
                    padding: '10px 20px',
                    cursor: 'pointer',
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '8px',
                    flex: 1
                  }}
                >
                  SAVE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
