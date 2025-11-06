#!/usr/bin/env node

/**
 * Test script for PDF generator
 * 
 * This script tests the generateCertificatePDF function with mock data
 * and saves the output to the filesystem for inspection.
 * 
 * Usage: npx tsx web/utils/testPdfGenerator.ts
 */

import { generateCertificatePDF, CertificateData } from './pdfGenerator';
import * as fs from 'fs';
import * as path from 'path';

async function testPdfGeneration() {
  console.log('🚀 Starting PDF generation test...\n');

  // Create mock certificate data
  const mockData: CertificateData = {
    filename: 'sample-document.pdf',
    sha256Hash: 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
    walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    timestamp: Date.now(),
    chainId: 8453, // Base
    transactionHash: '0x28b737965c7639578fae86da5032f328e8020c6f0d8c7c9279606c0e90de684d',
    feeAmountWei: BigInt('3500000000000000'), // ~0.0035 ETH
    feeCurrencyTicker: 'ETH',
  };

  console.log('📋 Mock Certificate Data:');
  console.log(`   Filename:         ${mockData.filename}`);
  console.log(`   SHA-256:          ${mockData.sha256Hash}`);
  console.log(`   Wallet Address:   ${mockData.walletAddress}`);
  console.log(`   Chain ID:         ${mockData.chainId} (Base)`);
  console.log(`   Transaction Hash: ${mockData.transactionHash}`);
  console.log(`   Fee:              ${(Number(mockData.feeAmountWei) / 1e18).toFixed(6)} ${mockData.feeCurrencyTicker}`);
  console.log(`   Timestamp:        ${new Date(mockData.timestamp).toUTCString()}\n`);

  // Progress callback
  let lastProgress = 0;
  const onProgress = (progress: number) => {
    if (progress - lastProgress >= 10 || progress === 100) {
      console.log(`⏳ Progress: ${progress}%`);
      lastProgress = progress;
    }
  };

  try {
    // Generate PDF in buffer mode
    console.log('🔧 Generating PDF...');
    const pdfBuffer = await generateCertificatePDF(mockData, onProgress, 'buffer');

    if (!pdfBuffer) {
      throw new Error('PDF buffer is empty');
    }

    // Ensure output directory exists
    const outputDir = path.join(__dirname, '..', 'test-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`📁 Created output directory: ${outputDir}`);
    }

    // Save to file
    const outputPath = path.join(outputDir, 'test-certificate.pdf');
    const buffer = Buffer.from(pdfBuffer);
    fs.writeFileSync(outputPath, buffer);

    console.log(`\n✅ Success! PDF saved to: ${outputPath}`);
    console.log(`📊 File size: ${(buffer.length / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error('\n❌ Error generating PDF:', error);
    process.exit(1);
  }
}

// Run the test
testPdfGeneration();

