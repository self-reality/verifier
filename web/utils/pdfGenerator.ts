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

    // Helper function to add wrapped text with clickable link
    const addWrappedTextWithLink = (text: string, url: string, currentY: number, indent: number = 0): number => {
      const maxWidth = rightMargin - leftMargin - indent;
      const lines = doc.splitTextToSize(text, maxWidth);
      const fontSize = doc.getFontSize();
      const textHeight = fontSize * 0.35; // Approximate text height in mm
      
      for (const line of lines) {
        doc.text(line, leftMargin + indent, currentY);
        // Add clickable link for this line
        const textWidth = doc.getTextWidth(line);
        doc.link(leftMargin + indent, currentY - textHeight, textWidth, textHeight, { url });
        currentY += lineHeight;
      }
      return currentY;
    };

    // ========== HEADER ==========
    doc.setFontSize(12);
    // // doc.text('証', leftMargin, y);
    // y += lineHeight;
    doc.text('Akashi Notari', leftMargin, y);
    y += lineHeight;
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
    y = addWrappedText(`  ${data.sha256Hash}`, y, 2);
    y += 2;
    
    doc.text('Wallet Address:', leftMargin, y);
    y += lineHeight;
    y = addWrappedText(`  ${data.walletAddress}`, y, 2);
    y += 2;
    
    const timestampDate = new Date(data.timestamp);
    doc.text('Timestamp:', leftMargin, y);
    y += lineHeight;
    doc.text(`  ${timestampDate.toUTCString()}`, leftMargin, y);
    y += lineHeight;
    doc.text(`  Unix: ${Math.floor(data.timestamp / 1000)}`, leftMargin, y);
    y += lineHeight;

    if (onProgress) onProgress(40);

    // ========== NETWORK INFORMATION ==========
    const eventLogUrl = getEventLogUrl(data.chainId, data.transactionHash);
    
    y += lineHeight;
    doc.text('NETWORK INFORMATION', leftMargin, y);
    y += lineHeight;
    drawBorder(y, y + 1);
    y += lineHeight;
    
    const networkName = getNetworkName(data.chainId);
    doc.text(`Network:     ${networkName}`, leftMargin, y);
    y += lineHeight + 2;
    
    doc.text('Transaction Hash:', leftMargin, y);
    y += lineHeight;
    y = addWrappedText(`  ${data.transactionHash}`, y, 2);
    y += 2;
    
    // y += lineHeight;
    doc.text('Event Log URL:', leftMargin, y);
    y += lineHeight;
    y = addWrappedTextWithLink(`  ${eventLogUrl}`, eventLogUrl, y, 2);
    y += 4;
    
    if (onProgress) onProgress(50);

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
    
    if (onProgress) onProgress(60);

    if (onProgress) onProgress(70);

    // ========== VERIFICATION INSTRUCTIONS ==========
    doc.addPage();
    y = 20;
    
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

    y += lineHeight;
    doc.text('HOW TO GET THE HASH OF YOUR FILE:', leftMargin, y);
    y += lineHeight;
    drawBorder(y, y + 1);
    y += lineHeight;

    const hashInstructions = [
      'Online Tools (free):',
      '  - https://hash-file.online/',
      '  - https://hash.online-convert.com/sha256-generator',
      '  - https://inventivehq.com/tools/hash-generator',
      '',
      'macOS / Linux (Terminal):',
      '  shasum -a 256 filename',
      '  OR',
      '  sha256sum filename',
      '',
      'Windows (PowerShell):',
      '  Get-FileHash -Algorithm SHA256 filename',
    ];

    for (const line of hashInstructions) {
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
    y += lineHeight;
    const websiteUrl = 'https://akashi-notari.com/';
    const websiteText = websiteUrl;
    doc.textWithLink(websiteText, leftMargin, y, { url: websiteUrl });

    if (onProgress) onProgress(95);

    // Save the PDF or return buffer based on output mode
    const filename = data.filename.endsWith('.pdf') ? data.filename : `${data.filename}.pdf`;

    if (outputMode === 'buffer') {
      if (onProgress) onProgress(100);
      return doc.output('arraybuffer') as ArrayBuffer;
    } else {
      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noopener';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      if (onProgress) onProgress(100);
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF certificate');
  }
}

