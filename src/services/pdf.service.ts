import puppeteer, { type Browser } from 'puppeteer';
import crypto from 'node:crypto';
import { storage } from './storage.service.js';

// Reuse a single browser instance across requests
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

export interface GenerateInput {
  html: string;
  type: 'receipt' | 'memo' | 'statement';
  refId: string;
}

export interface GenerateResult {
  fileId: string;
  filename: string;
  storageKey: string;
  sizeBytes: number;
}

export async function generatePdf(input: GenerateInput): Promise<GenerateResult> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Load the HTML into a blank page
    await page.setContent(input.html, { waitUntil: 'networkidle0' });

    // Give fonts and images a beat to render
    await page.evaluateHandle('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
    });

    const fileId = crypto.randomUUID();
    const filename = `${input.type}_${input.refId}_${fileId.slice(0, 8)}.pdf`;
    const storageKey = `${fileId}.pdf`;

    storage.save(storageKey, Buffer.from(pdfBuffer));

    return {
      fileId,
      filename,
      storageKey,
      sizeBytes: pdfBuffer.length,
    };
  } finally {
    await page.close();   // ← always close the page, or memory leaks
  }
}

// Graceful shutdown — call this from server.ts on exit
export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}