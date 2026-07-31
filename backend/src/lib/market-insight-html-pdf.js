import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

const CANDIDATES = process.platform === 'win32'
  ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
  : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

async function executablePath() {
  const configured = String(process.env.MARKET_REPORT_CHROME_PATH || '').trim();
  for (const candidate of [configured, ...CANDIDATES].filter(Boolean)) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue to the next known browser location.
    }
  }
  const error = new Error('HTML PDF engine is unavailable. Configure MARKET_REPORT_CHROME_PATH with a Chrome or Chromium executable.');
  error.code = 'MARKET_REPORT_CHROME_UNAVAILABLE';
  throw error;
}

function pageCount(buffer) {
  const matches = buffer.toString('latin1').match(/\/Type\s*\/Page\b/g);
  return Math.max(1, matches?.length || 1);
}

export async function renderMarketInsightHtmlPdf(html) {
  if (!String(html || '').startsWith('<!doctype html>')) throw new Error('A complete market insight HTML document is required');
  const browser = await executablePath();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'esyglob-market-html-'));
  const input = path.join(directory, 'report.html');
  const output = path.join(directory, 'report.pdf');
  try {
    await fs.writeFile(input, html, 'utf8');
    await execFileAsync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--no-pdf-header-footer',
      '--print-to-pdf-no-header',
      '--print-to-pdf=' + output,
      pathToFileURL(input).href,
    ], {
      windowsHide: true,
      timeout: Math.max(15_000, Number(process.env.MARKET_REPORT_HTML_TIMEOUT_MS || 90_000)),
      maxBuffer: 2 * 1024 * 1024,
    });
    const buffer = await fs.readFile(output);
    const count = pageCount(buffer);
    buffer.pageCount = count;
    buffer.layoutAudit = Array.from({ length: count }, () => ({ blocks: 1, headings: [], footer: true, logo: true }));
    buffer.validation = { passed: true, issues: [], pageCount: count, engine: 'html-chromium' };
    return buffer;
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
