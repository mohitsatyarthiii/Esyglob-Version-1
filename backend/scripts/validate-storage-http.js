import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'esyglob-storage-http-'));
process.env.VPS_STORAGE_ROOT = temporaryRoot;
process.env.STORAGE_PUBLIC_BASE_URL = 'http://127.0.0.1/storage';

let server;
try {
  const [{ default: StorageService }, { default: app }] = await Promise.all([
    import('../src/services/storage.service.js'),
    import('../src/app.js'),
  ]);
  await StorageService.ensureFoldersExist();
  const source = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#175cd3' },
  }).png().toBuffer();
  const upload = await StorageService.uploadImage({
    buffer: source,
    mimeType: 'image/png',
    folder: 'products/http-validation',
    originalName: 'validation.png',
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port } = server.address();
  const publicResponse = await fetch(`http://127.0.0.1:${port}/storage/${upload.storageKey}`);
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get('content-type'), 'image/webp');
  assert.match(publicResponse.headers.get('cache-control') || '', /immutable/);
  assert.equal(publicResponse.headers.get('x-content-type-options'), 'nosniff');
  const privateResponse = await fetch(`http://127.0.0.1:${port}/storage/temp/not-public.webp`);
  assert.equal(privateResponse.status, 404);
  await StorageService.deleteImage(upload.storageKey);
  console.log(JSON.stringify({ status: 'valid', publicMedia: 200, privateMedia: 404, deletedAfterTest: true }, null, 2));
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
