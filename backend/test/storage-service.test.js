import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import StorageService from '../src/services/storage.service.js';

test('creates secure storage folders and uploads optimized WebP variants', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'esyglob-storage-'));
  process.env.VPS_STORAGE_ROOT = root;
  process.env.STORAGE_PUBLIC_BASE_URL = 'https://api.esyglob.test/storage';
  t.after(async () => {
    delete process.env.VPS_STORAGE_ROOT;
    delete process.env.STORAGE_PUBLIC_BASE_URL;
    await fs.rm(root, { recursive: true, force: true });
  });

  const status = await StorageService.ensureFoldersExist();
  assert.equal(status.writable, true);
  assert.ok(StorageService.folders.every(folder => status.folders.includes(folder)));

  const input = await sharp({ create: { width: 1400, height: 800, channels: 3, background: '#1769d2' } }).png().toBuffer();
  const uploaded = await StorageService.uploadImage({ buffer: input, mimeType: 'image/png', folder: 'products/test-user', originalName: '../../unsafe.png' });
  assert.equal(uploaded.storageProvider, 'vps');
  assert.equal(uploaded.mimeType, 'image/webp');
  assert.match(uploaded.storageKey, /^products\/test-user\/[0-9a-f-]{36}-original\.webp$/);
  assert.match(uploaded.variants.thumbnail.storageKey, /^product-thumbnails\/test-user\//);
  assert.equal(uploaded.url, `https://api.esyglob.test/storage/${uploaded.storageKey}`);
  const metadata = await sharp(await StorageService.readFile(uploaded.storageKey)).metadata();
  assert.equal(metadata.format, 'webp');
  assert.ok(metadata.width <= 2048);

  const replacement = await StorageService.replaceImage(uploaded.storageKey, { buffer: input, mimeType: 'image/png', folder: 'products/test-user', originalName: 'replacement.png' });
  await assert.rejects(StorageService.readFile(uploaded.storageKey), error => error.code === 'ENOENT');
  assert.ok(await StorageService.readFile(replacement.storageKey));
  assert.equal(await StorageService.deleteImage(replacement.storageKey), true);
});

test('rejects spoofed and executable uploads', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'esyglob-storage-'));
  process.env.VPS_STORAGE_ROOT = root;
  t.after(async () => {
    delete process.env.VPS_STORAGE_ROOT;
    await fs.rm(root, { recursive: true, force: true });
  });
  await StorageService.ensureFoldersExist();
  await assert.rejects(
    StorageService.uploadImage({ buffer: Buffer.from('not an image'), mimeType: 'image/png' }),
    error => error.code === 'INVALID_IMAGE_CONTENT',
  );
  await assert.rejects(
    StorageService.uploadFile({ buffer: Buffer.from('MZ executable'), mimetype: 'application/octet-stream', originalname: 'payload.exe' }),
    error => error.code === 'INVALID_FILE_CONTENT',
  );
});

test('removes only expired unreferenced media during cleanup', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'esyglob-storage-cleanup-'));
  process.env.VPS_STORAGE_ROOT = root;
  t.after(async () => {
    delete process.env.VPS_STORAGE_ROOT;
    await fs.rm(root, { recursive: true, force: true });
  });
  await StorageService.ensureFoldersExist();
  const input = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#0f766e' } }).png().toBuffer();
  const uploaded = await StorageService.uploadImage({ buffer: input, mimeType: 'image/png', folder: 'products/cleanup' });
  const oldDate = new Date(Date.now() - 2 * 60 * 1000);
  await Promise.all(Object.values(uploaded.variants).map(variant => (
    fs.utimes(path.join(root, ...variant.storageKey.split('/')), oldDate, oldDate)
  )));

  const removed = await StorageService.cleanupUnusedImages([], { olderThanMs: 60_000 });
  assert.equal(removed.length, 3);
  await assert.rejects(StorageService.readFile(uploaded.storageKey), error => error.code === 'ENOENT');
});
