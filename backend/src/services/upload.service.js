import crypto from 'crypto';
import path from 'path';
import { loadCloudinaryAccounts } from '../config/cloudinary-accounts.js';
import { UPLOAD } from '../lib/constants.js';

const accountHealth = new Map();
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 30 * 1000;

export class UploadStorageError extends Error {
  constructor(message, { code = 'UPLOAD_STORAGE_UNAVAILABLE', statusCode = 503, attempts = [] } = {}) {
    super(message);
    this.name = 'UploadStorageError';
    this.code = code;
    this.statusCode = statusCode;
    this.attempts = attempts;
  }
}

function safeExtension(filename) {
  const extension = path.extname(filename || '').toLowerCase();
  return /^[.][a-z0-9]{1,8}$/.test(extension) ? extension : '';
}

function safeFolderName(folder) {
  return String(folder || 'general').trim().slice(0, 180).replace(/[^a-z0-9/_-]/gi, '') || 'general';
}

function initialHealth(account) {
  return {
    accountId: account.id,
    cloudName: account.cloudName,
    status: 'healthy',
    lastSuccessfulUpload: null,
    lastFailure: null,
    failureCount: 0,
    consecutiveFailures: 0,
    lastError: null,
    cooldownUntil: null,
  };
}

function healthFor(account) {
  if (!accountHealth.has(account.id)) accountHealth.set(account.id, initialHealth(account));
  return accountHealth.get(account.id);
}

function availableAccounts(accounts, now = Date.now()) {
  const available = accounts.filter((account) => {
    const health = healthFor(account);
    return !health.cooldownUntil || new Date(health.cooldownUntil).getTime() <= now;
  });

  // If every account is cooling down, make one best-effort pass instead of failing early.
  return available.length ? available : accounts;
}

function createSignature({ folder, timestamp, apiSecret }) {
  return crypto
    .createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');
}

function cloudinaryErrorDetails(response, result) {
  const message = String(result?.error?.message || `Cloudinary upload failed with HTTP ${response.status}`);
  const normalized = message.toLowerCase();
  const quotaLanguage = [
    'quota',
    'usage limit',
    'limit exceeded',
    'storage',
    'bandwidth',
    'rate limit',
    'too many requests',
    'maximum number',
    'credits',
  ].some((value) => normalized.includes(value));
  const retryableStatus = [401, 403, 420, 429, 500, 502, 503, 504].includes(response.status);

  return {
    message,
    code: quotaLanguage ? 'CLOUDINARY_QUOTA_LIMIT' : retryableStatus ? 'CLOUDINARY_TEMPORARY_FAILURE' : 'CLOUDINARY_UPLOAD_REJECTED',
    retryable: quotaLanguage || retryableStatus,
    status: response.status,
  };
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    code: error?.code || 'UPLOAD_FAILED',
    message: String(error?.message || 'Upload failed').slice(0, 500),
    providerStatus: error?.status,
  };
}

function markSuccess(account) {
  const health = healthFor(account);
  health.status = 'healthy';
  health.lastSuccessfulUpload = new Date().toISOString();
  health.consecutiveFailures = 0;
  health.lastError = null;
  health.cooldownUntil = null;
}

function markFailure(account, error, retryable) {
  const health = healthFor(account);
  const cooldownMs = Math.max(1_000, Number(process.env.CLOUDINARY_FAILOVER_COOLDOWN_MS || DEFAULT_COOLDOWN_MS));
  health.status = retryable ? 'cooldown' : 'degraded';
  health.lastFailure = new Date().toISOString();
  health.failureCount += 1;
  health.consecutiveFailures += 1;
  health.lastError = serializeError(error);
  health.cooldownUntil = retryable ? new Date(Date.now() + cooldownMs).toISOString() : null;
}

function logAttempt(level, details) {
  const payload = {
    event: 'cloudinary_upload',
    timestamp: new Date().toISOString(),
    ...details,
  };
  const line = `[UploadService] ${JSON.stringify(payload)}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

function normalizeFile(file) {
  if (!file) return null;
  return {
    arrayBuffer: file.arrayBuffer
      ? () => file.arrayBuffer()
      : () => Promise.resolve(file.buffer),
    name: file.name || file.originalname || `${crypto.randomUUID()}${safeExtension(file.originalname)}`,
    type: file.type || file.mimetype || 'application/octet-stream',
    size: Number(file.size || file.buffer?.length || 0),
  };
}

async function performUpload(account, source, folder, options, signal) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createSignature({ folder, timestamp, apiSecret: account.apiSecret });
  const formData = new FormData();

  if (source.kind === 'remote') {
    formData.append('file', source.url);
  } else {
    const file = source.file;
    const buffer = Buffer.from(await file.arrayBuffer());
    formData.append('file', new Blob([buffer], { type: file.type }), file.name);
  }

  formData.append('api_key', account.apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('folder', folder);
  formData.append('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(account.cloudName)}/auto/upload`,
    { method: 'POST', body: formData, signal }
  );
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const details = cloudinaryErrorDetails(response, result);
    throw Object.assign(new Error(details.message), details);
  }

  const originalName = source.kind === 'remote'
    ? new URL(source.url).pathname.split('/').pop() || 'remote-image'
    : source.file.name;
  const mimeType = source.kind === 'remote'
    ? result.resource_type === 'image' ? `image/${result.format || 'jpeg'}` : result.resource_type
    : source.file.type;

  return {
    url: result.secure_url,
    storageProvider: 'cloudinary',
    storageKey: result.public_id,
    originalName,
    mimeType,
    size: source.kind === 'remote' ? result.bytes : source.file.size,
    visibility: options.visibility === 'private' ? 'private' : 'public',
    width: result.width,
    height: result.height,
    format: result.format,
  };
}

async function uploadWithFailover(source, folder = 'documents', options = {}) {
  let accounts;
  try {
    accounts = loadCloudinaryAccounts();
  } catch (error) {
    throw new UploadStorageError('Cloudinary storage configuration is invalid', {
      code: 'CLOUDINARY_CONFIGURATION_INVALID',
      attempts: [{ ...serializeError(error) }],
    });
  }
  if (!accounts.length) {
    throw new UploadStorageError(
      'Cloudinary storage is missing a complete account configuration',
      { code: 'CLOUDINARY_CONFIGURATION_MISSING' }
    );
  }

  const requestId = crypto.randomUUID();
  const attempts = [];
  const safeFolder = safeFolderName(folder);
  const candidates = availableAccounts(accounts);

  for (let index = 0; index < candidates.length; index += 1) {
    const account = candidates[index];
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutMs = Math.max(1_000, Number(process.env.CLOUDINARY_UPLOAD_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();

    logAttempt('info', {
      requestId,
      accountId: account.id,
      cloudName: account.cloudName,
      folder: safeFolder,
      attempt: index + 1,
      retryCount: index,
      status: 'started',
    });

    try {
      const result = await performUpload(account, source, safeFolder, options, controller.signal);
      markSuccess(account);
      logAttempt('info', {
        requestId,
        accountId: account.id,
        cloudName: account.cloudName,
        folder: safeFolder,
        attempt: index + 1,
        retryCount: index,
        durationMs: Date.now() - startedAt,
        status: 'success',
      });
      return result;
    } catch (caught) {
      const error = caught?.name === 'AbortError'
        ? Object.assign(new Error(`Cloudinary upload timed out after ${timeoutMs}ms`), {
          code: 'CLOUDINARY_TIMEOUT',
          retryable: true,
        })
        : caught;
      const retryable = error.retryable === true || error instanceof TypeError;
      const attempt = {
        accountId: account.id,
        cloudName: account.cloudName,
        retryCount: index,
        durationMs: Date.now() - startedAt,
        ...serializeError(error),
      };
      attempts.push(attempt);
      markFailure(account, error, retryable);
      logAttempt(retryable ? 'warn' : 'error', { requestId, folder: safeFolder, status: 'failure', retryable, ...attempt });

      if (!retryable) {
        throw new UploadStorageError('The upload was rejected by the storage provider', {
          code: error.code || 'CLOUDINARY_UPLOAD_REJECTED',
          statusCode: error.status === 400 ? 422 : 500,
          attempts,
        });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new UploadStorageError(
    'All configured upload storage accounts are temporarily unavailable. Please try again shortly.',
    { code: 'CLOUDINARY_ACCOUNTS_EXHAUSTED', attempts }
  );
}

class UploadService {
  static validateFiles(files) {
    if (!files?.length) {
      throw Object.assign(new Error(`Upload between 1 and ${UPLOAD.MAX_FILES_PER_UPLOAD} files`), { statusCode: 422 });
    }
    if (files.length > UPLOAD.MAX_FILES_PER_UPLOAD) {
      throw Object.assign(new Error(`Maximum ${UPLOAD.MAX_FILES_PER_UPLOAD} files per upload`), { statusCode: 422 });
    }

    for (const file of files) {
      const allowedTypes = [...UPLOAD.ALLOWED_IMAGE_TYPES, ...UPLOAD.ALLOWED_DOCUMENT_TYPES, 'application/image'];
      const isVideo = file.mimetype?.startsWith('video/');
      if (!allowedTypes.includes(file.mimetype) && !isVideo) {
        throw Object.assign(new Error(`Unsupported file type: ${file.mimetype}`), { statusCode: 415 });
      }
      if (file.size > UPLOAD.MAX_FILE_SIZE) {
        throw Object.assign(new Error(`${file.originalname || 'File'} exceeds the 5MB limit`), { statusCode: 413 });
      }
    }
  }

  static async uploadFiles(userId, files, folder = 'general') {
    UploadService.validateFiles(files);
    const safeFolder = safeFolderName(folder);
    const uploads = [];

    // Files remain sequential to avoid multiplying quota/rate pressure during failover.
    for (const file of files) {
      uploads.push(await UploadService.uploadFile(file, `${safeFolder}/${userId}`));
    }
    return { uploads };
  }

  static async uploadFile(file, folder = 'documents', options = {}) {
    const normalized = normalizeFile(file);
    if (!normalized) throw Object.assign(new Error('A file is required'), { statusCode: 422 });
    return uploadWithFailover({ kind: 'file', file: normalized }, folder, options);
  }

  static async uploadRemote(url, folder = 'documents', options = {}) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw Object.assign(new Error('A valid remote image URL is required'), { statusCode: 422 });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw Object.assign(new Error('Only HTTP image URLs can be imported'), { statusCode: 422 });
    }
    return uploadWithFailover({ kind: 'remote', url: parsedUrl.toString() }, folder, options);
  }

  static getAccountHealth() {
    const accounts = loadCloudinaryAccounts();
    return accounts.map((account) => ({ ...healthFor(account) }));
  }
}

export default UploadService;
