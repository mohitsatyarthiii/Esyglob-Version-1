import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { UPLOAD } from '../lib/constants.js';

const REQUIRED_FOLDERS = Object.freeze([
  'products',
  'product-thumbnails',
  'categories',
  'subcategories',
  'manufacturers',
  'companies',
  'seller-logos',
  'seller-banners',
  'profiles',
  'banners',
  'homepage',
  'services',
  'verification',
  'documents',
  'certificates',
  'temp',
]);
const PUBLIC_FOLDERS = new Set(REQUIRED_FOLDERS.filter(folder => !['verification', 'temp'].includes(folder)));
const FOLDER_ALIASES = Object.freeze({
  general: 'documents',
  'image-search': 'temp',
  'product-videos': 'products',
  quotations: 'documents',
  rfqs: 'documents',
  'service-requests': 'documents',
  'final-quotations': 'documents',
  'final-quotation-revisions': 'documents',
  'product-enquiries': 'documents',
  factory: 'manufacturers',
  factories: 'manufacturers',
});
const IMAGE_MIMES = new Set(UPLOAD.ALLOWED_IMAGE_TYPES);
const DOCUMENT_MIMES = new Map([
  ['application/pdf', '.pdf'],
  ['text/csv', '.csv'],
  ['application/csv', '.csv'],
  ['text/plain', '.txt'],
  ['application/zip', '.zip'],
  ['application/vnd.ms-excel', '.xls'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  ['application/msword', '.doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
  ['audio/webm', '.webm'],
  ['audio/mpeg', '.mp3'],
  ['audio/mp4', '.m4a'],
  ['audio/wav', '.wav'],
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov'],
]);
const MAX_REMOTE_BYTES = UPLOAD.MAX_FILE_SIZE;
const PRIVATE_NETWORKS = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(?:1[6-9]|2\d|3[01])\./, /^0\./,
  /^::1$/i, /^fc/i, /^fd/i, /^fe80:/i,
];

function defaultRoot() {
  if (process.env.NODE_ENV === 'production' && process.platform !== 'win32') return '/var/www/esyglob/storage';
  return fileURLToPath(new URL('../../storage/', import.meta.url));
}

function storageRoot() {
  return path.resolve(String(process.env.VPS_STORAGE_ROOT || process.env.STORAGE_ROOT || defaultRoot()));
}

function publicBaseUrl() {
  const configured = String(process.env.STORAGE_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return 'https://api.esyglob.in/storage';
  return `http://localhost:${Number(process.env.PORT) || 5000}/storage`;
}

function normalizeFolder(value) {
  const segments = String(value || 'documents').replace(/\\/g, '/').split('/').filter(Boolean);
  const requested = String(segments.shift() || 'documents').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const rootFolder = FOLDER_ALIASES[requested] || (REQUIRED_FOLDERS.includes(requested) ? requested : 'documents');
  const children = segments.slice(0, 3).map(segment => segment.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)).filter(Boolean);
  return [rootFolder, ...children].join('/');
}

function absoluteStoragePath(storageKey) {
  const root = storageRoot();
  const normalized = String(storageKey || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw Object.assign(new Error('Invalid storage key'), { statusCode: 400, code: 'INVALID_STORAGE_KEY' });
  }
  const resolved = path.resolve(root, ...normalized.split('/'));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw Object.assign(new Error('Invalid storage path'), { statusCode: 400, code: 'INVALID_STORAGE_PATH' });
  }
  return resolved;
}

function imageFamilyKeys(storageKey) {
  const normalized = String(storageKey || '').replace(/\\/g, '/');
  const filename = path.posix.basename(normalized);
  const directory = path.posix.dirname(normalized);
  const match = filename.match(/^([0-9a-f-]{36})-(?:original|medium|thumbnail)\.webp$/i);
  if (!match) return normalized ? [normalized] : [];
  const rootFolder = directory.split('/')[0];
  const relativeDirectory = directory.split('/').slice(1).join('/');
  const primaryRoot = rootFolder === 'product-thumbnails' ? 'products' : rootFolder;
  const thumbnailRoot = primaryRoot === 'products' ? 'product-thumbnails' : primaryRoot;
  const join = (root, suffix) => [root, relativeDirectory, `${match[1]}-${suffix}.webp`].filter(Boolean).join('/');
  return [join(primaryRoot, 'original'), join(primaryRoot, 'medium'), join(thumbnailRoot, 'thumbnail')];
}

function isPrivateAddress(address) {
  return PRIVATE_NETWORKS.some(pattern => pattern.test(String(address || '')));
}

function bufferStartsWith(buffer, bytes) {
  return bytes.every((byte, index) => buffer[index] === byte);
}

async function readResponseWithLimit(response, maximumBytes) {
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maximumBytes) throw Object.assign(new Error('Remote image exceeds the 5MB limit'), { statusCode: 413, code: 'REMOTE_IMAGE_TOO_LARGE' });
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw Object.assign(new Error('Remote image exceeds the 5MB limit'), { statusCode: 413, code: 'REMOTE_IMAGE_TOO_LARGE' });
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

function validateDocumentSignature(buffer, mimeType) {
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (['application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mimeType)) {
    return bufferStartsWith(buffer, [0x50, 0x4b]);
  }
  if (['application/vnd.ms-excel', 'application/msword'].includes(mimeType)) {
    return bufferStartsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0]);
  }
  if (['text/csv', 'application/csv', 'text/plain'].includes(mimeType)) return !buffer.includes(0x00);
  if (mimeType === 'audio/mpeg') return buffer.subarray(0, 3).toString() === 'ID3' || buffer[0] === 0xff;
  if (mimeType === 'audio/wav') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WAVE';
  if (['video/mp4', 'audio/mp4', 'video/quicktime'].includes(mimeType)) return buffer.subarray(4, 8).toString() === 'ftyp';
  if (['video/webm', 'audio/webm'].includes(mimeType)) return bufferStartsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
  return false;
}

async function atomicWrite(destination, buffer) {
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o750 });
  const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, buffer, { flag: 'wx', mode: 0o640 });
  await fs.rename(temporary, destination);
}

function uploadResult({ storageKey, originalName, mimeType, size, visibility, width, height, checksum, variants }) {
  const url = StorageService.getImageUrl(storageKey);
  return {
    url,
    secure_url: url,
    location: url,
    storageProvider: 'vps',
    storageKey,
    storagePath: storageKey,
    filename: path.posix.basename(storageKey),
    originalName: String(originalName || 'upload').slice(0, 255),
    name: String(originalName || 'upload').slice(0, 255),
    mimeType,
    type: mimeType,
    size,
    visibility,
    width,
    height,
    checksum,
    hashes: checksum ? { sha256: checksum } : {},
    format: mimeType === 'image/webp' ? 'webp' : path.extname(storageKey).slice(1),
    variants,
  };
}

export class UploadStorageError extends Error {
  constructor(message, { code = 'UPLOAD_STORAGE_UNAVAILABLE', statusCode = 503, cause } = {}) {
    super(message, { cause });
    this.name = 'UploadStorageError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export default class StorageService {
  static folders = REQUIRED_FOLDERS;

  static rootDirectory() {
    return storageRoot();
  }

  static publicFolders() {
    return new Set(PUBLIC_FOLDERS);
  }

  static normalizeFolder(folder) {
    return normalizeFolder(folder);
  }

  static async ensureFoldersExist() {
    const root = storageRoot();
    await fs.mkdir(root, { recursive: true, mode: 0o750 });
    await Promise.all(REQUIRED_FOLDERS.map(folder => fs.mkdir(path.join(root, folder), { recursive: true, mode: 0o750 })));
    const probe = path.join(root, `.write-test-${process.pid}-${crypto.randomUUID()}`);
    await fs.writeFile(probe, 'ok', { flag: 'wx', mode: 0o600 });
    await fs.unlink(probe);
    return { root, folders: [...REQUIRED_FOLDERS], writable: true };
  }

  static async initialize() {
    const status = await this.ensureFoldersExist();
    console.info('[Storage] VPS storage ready', JSON.stringify({ root: status.root, folders: status.folders.length, writable: status.writable }));
    return status;
  }

  static async validateImage(buffer, mimeType) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw Object.assign(new Error('A non-empty image is required'), { statusCode: 422, code: 'EMPTY_IMAGE' });
    if (buffer.length > UPLOAD.MAX_FILE_SIZE) throw Object.assign(new Error('Image exceeds the 5MB limit'), { statusCode: 413, code: 'IMAGE_TOO_LARGE' });
    if (!IMAGE_MIMES.has(mimeType)) throw Object.assign(new Error(`Unsupported image type: ${mimeType || 'unknown'}`), { statusCode: 415, code: 'UNSUPPORTED_IMAGE_TYPE' });
    try {
      const metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
      const expected = mimeType.split('/')[1].replace('jpeg', 'jpg');
      const actual = String(metadata.format || '').replace('jpeg', 'jpg');
      if (!actual || actual !== expected || !metadata.width || !metadata.height || Number(metadata.pages || 1) > 1) throw new Error('Image content does not match its MIME type');
      return metadata;
    } catch (error) {
      throw Object.assign(new Error('The uploaded image is invalid or corrupted'), { statusCode: 422, code: 'INVALID_IMAGE_CONTENT', cause: error });
    }
  }

  static async optimizeImage(buffer) {
    const base = sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 }).rotate();
    const variants = await Promise.all([
      { name: 'original', width: 2048, quality: 84 },
      { name: 'medium', width: 1024, quality: 80 },
      { name: 'thumbnail', width: 320, quality: 76 },
    ].map(async variant => {
      const { data, info } = await base.clone()
        .resize({ width: variant.width, height: variant.width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: variant.quality, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      return { ...variant, buffer: data, outputWidth: info.width, outputHeight: info.height };
    }));
    return variants;
  }

  static async uploadImage({ buffer, mimeType, folder = 'products', originalName = 'image', visibility = 'public' }) {
    const metadata = await this.validateImage(buffer, mimeType);
    const safeFolder = normalizeFolder(folder);
    const id = crypto.randomUUID();
    const optimized = await this.optimizeImage(buffer);
    const written = [];
    try {
      const variants = {};
      for (const variant of optimized) {
        const variantFolder = variant.name === 'thumbnail' && safeFolder.split('/')[0] === 'products'
          ? ['product-thumbnails', ...safeFolder.split('/').slice(1)].join('/')
          : safeFolder;
        const key = `${variantFolder}/${id}-${variant.name}.webp`;
        await atomicWrite(absoluteStoragePath(key), variant.buffer);
        written.push(key);
        variants[variant.name] = {
          storageKey: key,
          url: this.getImageUrl(key),
          size: variant.buffer.length,
          width: variant.outputWidth,
          height: variant.outputHeight,
          checksum: crypto.createHash('sha256').update(variant.buffer).digest('hex'),
        };
      }
      const primary = variants.original;
      return uploadResult({
        storageKey: primary.storageKey,
        originalName,
        mimeType: 'image/webp',
        size: primary.size,
        visibility,
        width: Math.min(Number(metadata.width), 2048),
        height: Math.round(Number(metadata.height) * Math.min(1, 2048 / Number(metadata.width))),
        checksum: primary.checksum,
        variants,
      });
    } catch (error) {
      await Promise.all(written.map(key => fs.unlink(absoluteStoragePath(key)).catch(() => undefined)));
      throw new UploadStorageError('Unable to store the optimized image', { code: 'VPS_IMAGE_WRITE_FAILED', cause: error });
    }
  }

  static async uploadDocument({ buffer, mimeType, folder = 'documents', originalName = 'document', visibility = 'public' }) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw Object.assign(new Error('A non-empty file is required'), { statusCode: 422, code: 'EMPTY_FILE' });
    if (buffer.length > UPLOAD.MAX_FILE_SIZE) throw Object.assign(new Error('File exceeds the 5MB limit'), { statusCode: 413, code: 'FILE_TOO_LARGE' });
    const extension = DOCUMENT_MIMES.get(mimeType);
    if (!extension || !validateDocumentSignature(buffer, mimeType)) throw Object.assign(new Error(`Unsupported or invalid file type: ${mimeType || 'unknown'}`), { statusCode: 415, code: 'INVALID_FILE_CONTENT' });
    const safeFolder = normalizeFolder(visibility === 'private' ? `verification/${folder.split('/').slice(1).join('/')}` : folder);
    const storageKey = `${safeFolder}/${crypto.randomUUID()}${extension}`;
    try {
      await atomicWrite(absoluteStoragePath(storageKey), buffer);
      return uploadResult({
        storageKey,
        originalName,
        mimeType,
        size: buffer.length,
        visibility,
        checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
        variants: {},
      });
    } catch (error) {
      throw new UploadStorageError('Unable to store the uploaded file', { code: 'VPS_FILE_WRITE_FAILED', cause: error });
    }
  }

  static async uploadFile(file, folder = 'documents', options = {}) {
    const buffer = Buffer.isBuffer(file?.buffer)
      ? file.buffer
      : file?.arrayBuffer ? Buffer.from(await file.arrayBuffer()) : null;
    const mimeType = String(file?.mimetype || file?.type || '').toLowerCase();
    const originalName = file?.originalname || file?.name || 'upload';
    if (IMAGE_MIMES.has(mimeType)) return this.uploadImage({ buffer, mimeType, folder, originalName, visibility: options.visibility || 'public' });
    return this.uploadDocument({ buffer, mimeType, folder, originalName, visibility: options.visibility || 'public' });
  }

  static async uploadRemote(url, folder = 'products', options = {}) {
    let parsed;
    try { parsed = new URL(url); } catch { throw Object.assign(new Error('A valid remote image URL is required'), { statusCode: 422 }); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw Object.assign(new Error('Only public HTTP image URLs can be imported'), { statusCode: 422 });
    const addresses = await dns.lookup(parsed.hostname, { all: true });
    if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw Object.assign(new Error('Private network image URLs are not allowed'), { statusCode: 422, code: 'REMOTE_IMAGE_HOST_BLOCKED' });
    const response = await fetch(parsed, { redirect: 'error', signal: AbortSignal.timeout(Number(process.env.REMOTE_IMAGE_TIMEOUT_MS || 12_000)), headers: { Accept: 'image/jpeg,image/png,image/webp' } });
    const mimeType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (!response.ok || !IMAGE_MIMES.has(mimeType)) throw Object.assign(new Error('Remote URL did not return a supported image'), { statusCode: 422, code: 'REMOTE_IMAGE_INVALID' });
    if (declaredSize > MAX_REMOTE_BYTES) throw Object.assign(new Error('Remote image exceeds the 5MB limit'), { statusCode: 413, code: 'REMOTE_IMAGE_TOO_LARGE' });
    const buffer = await readResponseWithLimit(response, MAX_REMOTE_BYTES);
    return this.uploadImage({ buffer, mimeType, folder, originalName: path.basename(parsed.pathname) || 'remote-image', visibility: options.visibility || 'public' });
  }

  static getImageUrl(storageKey) {
    const normalized = String(storageKey || '').replace(/\\/g, '/').replace(/^\/+/, '');
    absoluteStoragePath(normalized);
    return `${publicBaseUrl()}/${normalized.split('/').map(encodeURIComponent).join('/')}`;
  }

  static storageKeyFromUrl(url) {
    const parsed = new URL(url);
    const configured = new URL(`${publicBaseUrl()}/`);
    const trustedOrigins = new Set([configured.origin, 'https://api.esyglob.in']);
    if (process.env.NODE_ENV !== 'production') {
      trustedOrigins.add(`http://localhost:${parsed.port || 5000}`);
      trustedOrigins.add(`http://127.0.0.1:${parsed.port || 5000}`);
    }
    const basePath = configured.pathname.replace(/\/$/, '');
    const pathPrefix = parsed.origin === configured.origin ? `${basePath}/` : '/storage/';
    if (!trustedOrigins.has(parsed.origin) || !parsed.pathname.startsWith(pathPrefix)) {
      throw Object.assign(new Error('The URL is not an EsyGlob VPS storage asset'), { statusCode: 400, code: 'INVALID_STORAGE_URL' });
    }
    let storageKey;
    try {
      storageKey = parsed.pathname.slice(pathPrefix.length).split('/').map(decodeURIComponent).join('/');
    } catch {
      throw Object.assign(new Error('The storage URL is malformed'), { statusCode: 400, code: 'INVALID_STORAGE_URL' });
    }
    absoluteStoragePath(storageKey);
    return storageKey;
  }

  static async readFile(storageKey) {
    return fs.readFile(absoluteStoragePath(storageKey));
  }

  static async deleteImage(storageKey) {
    if (!storageKey) return false;
    const keys = imageFamilyKeys(storageKey);
    const removed = await Promise.all(keys.map(key => fs.unlink(absoluteStoragePath(key)).then(() => true).catch(error => error.code === 'ENOENT' ? false : Promise.reject(error))));
    return removed.some(Boolean);
  }

  static async replaceImage(storageKey, upload, options = {}) {
    if (typeof options.commit !== 'function') {
      throw Object.assign(new Error('Image replacement requires a database commit callback'), { statusCode: 409, code: 'MEDIA_COMMIT_REQUIRED' });
    }
    if (typeof options.isReferenced !== 'function') {
      throw Object.assign(new Error('Image replacement requires a database reference check'), { statusCode: 409, code: 'MEDIA_REFERENCE_CHECK_REQUIRED' });
    }
    const replacement = await this.uploadImage(upload);
    try {
      await options.commit(replacement);
    } catch (error) {
      await this.deleteImage(replacement.storageKey).catch(() => undefined);
      throw error;
    }
    try {
      const previousStillReferenced = await options.isReferenced(storageKey);
      if (!previousStillReferenced) {
        await this.deleteImage(storageKey).catch(error => console.warn('[Storage] Previous image cleanup failed after commit:', error.message));
      } else {
        replacement.previousCleanupDeferred = true;
      }
    } catch (error) {
      replacement.previousCleanupDeferred = true;
      console.warn('[Storage] Previous image retained because its reference check failed:', error.message);
    }
    return replacement;
  }

  static async cleanupUnusedImages(activeStorageKeys = [], { olderThanMs = 24 * 60 * 60 * 1000, manifestComplete = false, dryRun = true } = {}) {
    if (!manifestComplete) {
      throw Object.assign(new Error('Media cleanup requires an explicitly complete reference manifest'), { statusCode: 409, code: 'INCOMPLETE_MEDIA_MANIFEST' });
    }
    const active = new Set(activeStorageKeys.flatMap(imageFamilyKeys));
    const removed = [];
    const cutoff = Date.now() - Math.max(60_000, Number(olderThanMs));
    for (const folder of REQUIRED_FOLDERS) {
      const base = path.join(storageRoot(), folder);
      const entries = await fs.readdir(base, { recursive: true, withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const absolute = path.join(entry.parentPath || entry.path || base, entry.name);
        const relative = path.relative(storageRoot(), absolute).split(path.sep).join('/');
        const stat = await fs.stat(absolute);
        if (!active.has(relative) && stat.mtimeMs < cutoff) {
          if (!dryRun) await fs.unlink(absolute);
          removed.push(relative);
        }
      }
    }
    return removed;
  }
}
