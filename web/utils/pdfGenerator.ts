import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { getNetworkName, getEventLogUrl } from './index';

export interface CertificateData {
  filename: string;
  sha256Hash: string;
  walletAddress: string;
  timestamp: number;
  chainId: number;
  transactionHash: string;
  feeAmountWei: bigint;
  feeCurrencyTicker: string;
}

export async function generateCertificatePDF(
  data: CertificateData,
  onProgress?: (progress: number) => void,
  outputMode: 'download' | 'buffer' = 'download'
): Promise<void | ArrayBuffer> {
  try {
    if (onProgress) onProgress(10);

    // Create new PDF document (A4 size)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Use Courier font for 1980s dot-matrix aesthetic
    doc.setFont('courier', 'normal');
    
    let y = 20; // Starting Y position
    const leftMargin = 20;
    const rightMargin = 190;
    const lineHeight = 6;

    if (onProgress) onProgress(20);

    // Helper function to draw ASCII border
    const drawBorder = (startY: number, endY: number) => {
      const width = rightMargin - leftMargin;
      const charWidth = 2.1; // Approximate width of '=' character in Courier
      const numChars = Math.floor(width / charWidth);
      
      doc.setFontSize(10);
      // Top border
      doc.text('='.repeat(numChars), leftMargin, startY);
      // Bottom border
      doc.text('='.repeat(numChars), leftMargin, endY);
    };

    // Helper function to add wrapped text
    const addWrappedText = (text: string, currentY: number, indent: number = 0): number => {
      const maxWidth = rightMargin - leftMargin - indent;
      const lines = doc.splitTextToSize(text, maxWidth);
      for (const line of lines) {
        doc.text(line, leftMargin + indent, currentY);
        currentY += lineHeight;
      }
      return currentY;
    };

    // ========== HEADER ==========
    doc.setFontSize(12);
    doc.text('PROOF OF EXISTENCE CERTIFICATE', leftMargin, y);
    y += lineHeight;
    drawBorder(y, y + 1);
    y += lineHeight;

    if (onProgress) onProgress(30);

    // ========== DOCUMENT INFORMATION ==========
    doc.setFontSize(10);
    y += lineHeight;
    doc.text('DOCUMENT INFORMATION', leftMargin, y);
    y += lineHeight;
    drawBorder(y, y + 1);
    y += lineHeight;
    
    doc.text('Filename:', leftMargin, y);
    y += lineHeight;
    y = addWrappedText(`  ${data.filename}`, y, 2);
    y += 2;
    
    doc.text('SHA-256 Hash (FIPS 180-4):', leftMargin, y);
    y += lineHeight;
    // Split hash into two lines for readability
    const hashLine1 = data.sha256Hash.substring(0, 32);
    const hashLine2 = data.sha256Hash.substring(32);
    doc.text(`  ${hashLine1}`, leftMargin, y);
    y += lineHeight;
    doc.text(`  ${hashLine2}`, leftMargin, y);
    y += lineHeight + 2;
    
    doc.text('Wallet Address:', leftMargin, y);
    y += lineHeight;
    // Split address into two lines
    const addrLine1 = data.walletAddress.substring(0, 21);
    const addrLine2 = data.walletAddress.substring(21);
    doc.text(`  ${addrLine1}`, leftMargin, y);
    y += lineHeight;
    doc.text(`  ${addrLine2}`, leftMargin, y);
    y += lineHeight + 2;
    
    const timestampDate = new Date(data.timestamp);
    doc.text('Timestamp:', leftMargin, y);
    y += lineHeight;
    doc.text(`  ${timestampDate.toUTCString()}`, leftMargin, y);
    y += lineHeight;
    doc.text(`  Unix: ${Math.floor(data.timestamp / 1000)}`, leftMargin, y);
    y += lineHeight;

    if (onProgress) onProgress(40);

    // ========== NETWORK INFORMATION ==========
    y += lineHeight;
    doc.text('NETWORK INFORMATION', leftMargin, y);
    y += lineHeight;
    drawBorder(y, y + 1);
    y += lineHeight;
    
    const networkName = getNetworkName(data.chainId);
    doc.text(`Network:     ${networkName}`, leftMargin, y);
    y += lineHeight;
    doc.text(`Chain ID:    ${data.chainId}`, leftMargin, y);
    y += lineHeight + 2;
    
    doc.text('Transaction Hash:', leftMargin, y);
    y += lineHeight;
    // Split tx hash into two lines
    const txLine1 = data.transactionHash.substring(0, 34);
    const txLine2 = data.transactionHash.substring(34);
    doc.text(`  ${txLine1}`, leftMargin, y);
    y += lineHeight;
    doc.text(`  ${txLine2}`, leftMargin, y);
    y += lineHeight + 2;
    
    const feeInNative = (Number(data.feeAmountWei) / 1e18).toFixed(6);
    doc.text(`Fee:         ${feeInNative} ${data.feeCurrencyTicker} ($0.01)`, leftMargin, y);
    y += lineHeight;

    if (onProgress) onProgress(50);

    // ========== TRANSACTION URL & QR CODE ==========
    y += lineHeight;
    doc.text('TRANSACTION EVENT LOG', leftMargin, y);
    y += lineHeight;
    drawBorder(y, y + 1);
    y += lineHeight;
    
    const eventLogUrl = getEventLogUrl(data.chainId, data.transactionHash);
    doc.text('URL:', leftMargin, y);
    y += lineHeight;
    y = addWrappedText(`  ${eventLogUrl}`, y, 2);
    y += 4;
    
    if (onProgress) onProgress(60);

    // Generate QR code
    try {
      const qrDataUrl = await QRCode.toDataURL(eventLogUrl, {
        width: 256,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      
      // Add QR code image
      const qrSize = 40; // mm
      doc.addImage(qrDataUrl, 'PNG', leftMargin, y, qrSize, qrSize);
      y += qrSize + 6;
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      doc.text('  [QR Code generation failed]', leftMargin, y);
      y += lineHeight;
    }

    if (onProgress) onProgress(70);

    // ========== VERIFICATION INSTRUCTIONS ==========
    doc.text('VERIFICATION INSTRUCTIONS', leftMargin, y);
    y += lineHeight;
    drawBorder(y, y + 1);
    y += lineHeight;
    
    const instructions = [
      'To verify this document in the future:',
      '',
      '1. Visit the event log URL or scan the QR code above',
      '2. Locate the "Anchor" event in the event logs',
      '3. Compare the SHA-256 hash parameter with your',
      '   document\'s hash',
      '4. Hash your original file using SHA-256 (FIPS 180-4)',
      '5. If the hashes match, the document is proven to',
      '   exist as of the timestamp shown above',
    ];
    
    for (const line of instructions) {
      doc.text(line, leftMargin, y);
      y += lineHeight;
    }

    if (onProgress) onProgress(80);

    // ========== LEGAL DISCLAIMER ==========
    y += lineHeight;
    doc.text('LEGAL DISCLAIMER', leftMargin, y);
    y += lineHeight;
    drawBorder(y, y + 1);
    y += lineHeight;
    
    const disclaimer = 
      'This certificate is provided "as-is" without warranty of any kind. ' +
      'The blockchain transaction serves as cryptographic proof that a hash ' +
      'was recorded at a specific time. This service does not verify document ' +
      'authenticity, content, or legal validity. Users are responsible for ' +
      'maintaining their original files.';
    
    y = addWrappedText(disclaimer, y);

    if (onProgress) onProgress(90);

    // ========== FOOTER ==========
    y += lineHeight * 2;
    drawBorder(y, y + 1);
    y += lineHeight;
    doc.setFontSize(8);
    doc.text(`Certificate generated: ${timestampDate.toUTCString()}`, leftMargin, y);
    y += lineHeight - 1;
    doc.text('Proof of Existence - Your file never left your computer', leftMargin, y);

    if (onProgress) onProgress(95);

    // Save the PDF or return buffer based on output mode
    const filename = `proof-of-existence-${data.filename.replace(/[^a-z0-9\-_.]/g, '_')}.pdf`;

    if (outputMode === 'buffer') {
      if (onProgress) onProgress(100);
      return doc.output('arraybuffer') as ArrayBuffer;
    } else {
      doc.save(filename);
      if (onProgress) onProgress(100);
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF certificate');
  }
}

