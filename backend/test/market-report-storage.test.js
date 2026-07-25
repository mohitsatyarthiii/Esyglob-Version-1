import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import test from 'node:test';
import MarketReportStorageService from '../src/services/market-report-storage.service.js';

test('writes, reads, persists, and deletes market insight PDF files', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'esyglob-market-reports-'));
  const previous = process.env.MARKET_REPORT_STORAGE_DIR;
  process.env.MARKET_REPORT_STORAGE_DIR = directory;
  try {
    for (const id of ['steel-market-india', 'textile-export-uae']) {
      const pdf = Buffer.from(`%PDF-1.7\n${id}\n%%EOF`);
      const stored = await MarketReportStorageService.write(id, pdf);
      assert.equal(stored.storageProvider, 'filesystem');
      assert.equal(await MarketReportStorageService.exists(stored.storageKey), true);
      assert.deepEqual(await MarketReportStorageService.read(stored.storageKey), pdf);
      assert.equal((await fs.stat(path.join(directory, stored.storageKey))).size, pdf.length);
      assert.equal(await MarketReportStorageService.remove(stored.storageKey), true);
      assert.equal(await MarketReportStorageService.exists(stored.storageKey), false);
    }
  } finally {
    if (previous === undefined) delete process.env.MARKET_REPORT_STORAGE_DIR;
    else process.env.MARKET_REPORT_STORAGE_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
