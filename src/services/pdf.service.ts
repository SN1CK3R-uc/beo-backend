import puppeteer, { type Browser } from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { storage } from './storage.service.js';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    // Resolve cache directory — same path used by postinstall and runtime
    const cacheDir =
      process.env.PUPPETEER_CACHE_DIR ??
      path.resolve(process.cwd(), '.cache', 'puppeteer');

    console.log('[puppeteer] launching browser, cache dir:', cacheDir);

    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote',
      ],
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
    // Encode the HTML as a data URL so Puppeteer treats it as a real page load
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(input.html);
    await page.goto(dataUrl, { waitUntil: 'networkidle0', timeout: 30_000 });
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
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}
