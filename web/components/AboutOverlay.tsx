interface AboutOverlayProps {
  onClose: () => void;
}

export function AboutOverlay({ onClose }: AboutOverlayProps) {
  return (
    <div className="overlay">
      <div className="overlay-content">
        {/* Header with close button */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h3 className="subsection-title" style={{ marginBottom: 0 }}>
            ABOUT
          </h3>
          <button
            onClick={onClose}
            className="btn-x"
          >
            X
          </button>
        </div>

        {/* PDF Example */}
        <div style={{ marginBottom: '15px' }}>
          <div className="text-xs" style={{ marginBottom: '5px' }}>
            PDF EXAMPLE & DISCLAIMER:
          </div>
          <a 
            href="/abstract.txt.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs"
            style={{ 
              color: 'var(--color-accent)',
              textDecoration: 'underline'
            }}
          >
            ABSTRACT.TXT.PDF
          </a>
        </div>

        {/* Contract Addresses */}
        <div style={{ marginBottom: '15px' }}>
          <div className="text-xs" style={{ marginBottom: '5px' }}>
            CONTRACT ADDRESSES:
          </div>
          <div className="text-xs" style={{ marginBottom: '3px' }}>
            BASE: <a 
              href="https://basescan.org/address/0xeed9D0f7265892e84e43d05dA464c75add199260#code"
              target="_blank"
              rel="noopener noreferrer"
              style={{ 
                color: 'var(--color-accent)',
                textDecoration: 'underline',
                wordBreak: 'break-all'
              }}
            >
              0xeed9D0f7265892e84e43d05dA464c75add199260
            </a>
          </div>
          <div className="text-xs" style={{ marginBottom: '3px' }}>
            ETHEREUM: <a 
              href="https://etherscan.io/address/0xeed9D0f7265892e84e43d05dA464c75add199260#code"
              target="_blank"
              rel="noopener noreferrer"
              style={{ 
                color: 'var(--color-accent)',
                textDecoration: 'underline',
                wordBreak: 'break-all'
              }}
            >
              0xeed9D0f7265892e84e43d05dA464c75add199260
            </a>
          </div>
          <div className="text-xs">
            OPTIMISM: <a 
              href="https://optimistic.etherscan.io/address/0x859Fe07D2995875319b7e65592812392B16BBADe#code"
              target="_blank"
              rel="noopener noreferrer"
              style={{ 
                color: 'var(--color-accent)',
                textDecoration: 'underline',
                wordBreak: 'break-all'
              }}
            >
              0x859Fe07D2995875319b7e65592812392B16BBADe
            </a>
          </div>
        </div>

        {/* Transaction Example */}
        <div style={{ marginBottom: '15px' }}>
          <div className="text-xs" style={{ marginBottom: '5px' }}>
            TRANSACTION EXAMPLE:
          </div>
          <a 
            href="https://basescan.org/tx/0x575e3899b2697043acd5719cd1ca376794b2a62a92f18334c3ce04d85ebe8b0b#eventlog"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs"
            style={{ 
              color: 'var(--color-accent)',
              textDecoration: 'underline',
              wordBreak: 'break-all'
            }}
          >
            VIEW ON BASESCAN
          </a>
        </div>

        {/* GitHub */}
        <div style={{ marginBottom: '15px' }}>
          <div className="text-xs" style={{ marginBottom: '5px' }}>
            GITHUB:
          </div>
          <a 
            href="https://github.com/self-reality/verifier"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs"
            style={{ 
              color: 'var(--color-accent)',
              textDecoration: 'underline',
              wordBreak: 'break-all'
            }}
          >
            github.com/self-reality/verifier
          </a>
        </div>

        {/* Contact */}
        <div>
          <div className="text-xs" style={{ marginBottom: '5px' }}>
            CONTACT:
          </div>
          <a 
            href="https://discord.gg/KBc44HTzP2"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs"
            style={{ 
              color: 'var(--color-accent)',
              textDecoration: 'underline'
            }}
          >
            DISCORD
          </a>
        </div>
      </div>
    </div>
  );
}

