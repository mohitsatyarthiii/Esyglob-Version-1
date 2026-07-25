import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_STORAGE_DIR = fileURLToPath(new URL('../../storage/market-insights/', import.meta.url));

function storageDirectory() {
  return path.resolve(String(process.env.MARKET_REPORT_STORAGE_DIR || DEFAULT_STORAGE_DIR));
}

function safeStorageKey(reportId) {
  const value = String(reportId || '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Invalid market report storage key');
  return `${value}.pdf`;
}

function absolutePath(storageKey) {
  const directory = storageDirectory();
  const resolved = path.resolve(directory, path.basename(String(storageKey || '')));
  if (path.dirname(resolved) !== directory) throw new Error('Invalid market report storage path');
  return resolved;
}

export default class MarketReportStorageService {
  static directory() {
    return storageDirectory();
  }

  static async write(reportId, buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('A valid PDF buffer is required');
    const directory = storageDirectory();
    const storageKey = safeStorageKey(reportId);
    const destination = absolutePath(storageKey);
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(temporary, buffer, { flag: 'wx' });
    await fs.rename(temporary, destination);
    return { storageKey, storageProvider: 'filesystem', fileSize: buffer.length };
  }

  static async read(storageKey) {
    if (!storageKey) return null;
    try {
      return await fs.readFile(absolutePath(storageKey));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  static async exists(storageKey) {
    if (!storageKey) return false;
    try {
      await fs.access(absolutePath(storageKey));
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }

  static async remove(storageKey) {
    if (!storageKey) return false;
    try {
      await fs.unlink(absolutePath(storageKey));
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  }
}
