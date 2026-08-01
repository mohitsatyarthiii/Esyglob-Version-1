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
  assert.equal(uploaded.filename, path.posix.basename(uploaded.storageKey));
  assert.equal(uploaded.storagePath, uploaded.storageKey);
  assert.equal(uploaded.hashes.sha256, uploaded.checksum);
  assert.match(uploaded.storageKey, /^products\/test-user\/[0-9a-f-]{36}-original\.webp$/);
  assert.match(uploaded.variants.thumbnail.storageKey, /^product-thumbnails\/test-user\//);
  assert.equal(uploaded.url, `https://api.esyglob.test/storage/${uploaded.storageKey}`);
  const metadata = await sharp(await StorageService.readFile(uploaded.storageKey)).metadata();
  assert.equal(metadata.format, 'webp');
  assert.ok(metadata.width <= 2048);

  let committedStorageKey = uploaded.storageKey;
  const replacement = await StorageService.replaceImage(uploaded.storageKey, { buffer: input, mimeType: 'image/png', folder: 'products/test-user', originalName: 'replacement.png' }, {
    commit: async next => { committedStorageKey = next.storageKey; },
    isReferenced: async () => false,
  });
  assert.equal(committedStorageKey, replacement.storageKey);
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

  const preview = await StorageService.cleanupUnusedImages([], { olderThanMs: 60_000, manifestComplete: true });
  assert.equal(preview.length, 3);
  assert.ok(await StorageService.readFile(uploaded.storageKey));
  const removed = await StorageService.cleanupUnusedImages([], { olderThanMs: 60_000, manifestComplete: true, dryRun: false });
  assert.equal(removed.length, 3);
  await assert.rejects(StorageService.readFile(uploaded.storageKey), error => error.code === 'ENOENT');
});

test('cleanup preserves every variant when the database references only the original', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'esyglob-storage-referenced-'));
  process.env.VPS_STORAGE_ROOT = root;
  t.after(async () => {
    delete process.env.VPS_STORAGE_ROOT;
    await fs.rm(root, { recursive: true, force: true });
  });
  await StorageService.ensureFoldersExist();
  const input = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#7c3aed' } }).png().toBuffer();
  const uploaded = await StorageService.uploadImage({ buffer: input, mimeType: 'image/png', folder: 'products/referenced' });
  const oldDate = new Date(Date.now() - 2 * 60 * 1000);
  await Promise.all(Object.values(uploaded.variants).map(variant => fs.utimes(path.join(root, ...variant.storageKey.split('/')), oldDate, oldDate)));
  const removed = await StorageService.cleanupUnusedImages([uploaded.storageKey], { olderThanMs: 60_000, manifestComplete: true, dryRun: false });
  assert.deepEqual(removed, []);
  await Promise.all(Object.values(uploaded.variants).map(variant => StorageService.readFile(variant.storageKey)));
});

test('replacement rolls back the new files and retains the old files when the database commit fails', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'esyglob-storage-rollback-'));
  process.env.VPS_STORAGE_ROOT = root;
  t.after(async () => {
    delete process.env.VPS_STORAGE_ROOT;
    await fs.rm(root, { recursive: true, force: true });
  });
  await StorageService.ensureFoldersExist();
  const input = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#be123c' } }).png().toBuffer();
  const uploaded = await StorageService.uploadImage({ buffer: input, mimeType: 'image/png', folder: 'seller-logos/rollback' });
  await assert.rejects(
    StorageService.replaceImage(uploaded.storageKey, { buffer: input, mimeType: 'image/png', folder: 'seller-logos/rollback' }, {
      commit: async () => { throw new Error('database unavailable'); },
      isReferenced: async () => false,
    }),
    /database unavailable/,
  );
  await StorageService.readFile(uploaded.storageKey);
  const files = (await fs.readdir(path.join(root, 'seller-logos', 'rollback'))).filter(name => name.endsWith('.webp'));
  assert.equal(files.length, 3);
});

test('cleanup cannot run without a complete database reference manifest', async () => {
  await assert.rejects(StorageService.cleanupUnusedImages([]), error => error.code === 'INCOMPLETE_MEDIA_MANIFEST');
});
