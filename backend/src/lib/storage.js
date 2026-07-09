import crypto from 'crypto';
import path from 'path';

function safeExtension(filename) {
  const extension = path.extname(filename || '').toLowerCase();
  return /^[.][a-z0-9]{1,8}$/.test(extension) ? extension : '';
}

export async function storeUpload(file, folder = 'documents', options = {}) {
  return uploadToCloudinary(file, folder, options);
}

export async function storeRemoteUpload(url, folder = 'documents', options = {}) {
  return uploadRemoteToCloudinary(url, folder, options);
}

async function uploadToCloudinary(file, folder = 'documents', options = {}) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary storage is missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET'
    );
  }

  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, '') || 'uploads';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash('sha1')
    .update(`folder=${safeFolder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');

  const buffer = Buffer.from(await file.arrayBuffer());
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([buffer], { type: file.type }),
    file.name || `${crypto.randomUUID()}${safeExtension(file.name)}`
  );
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('folder', safeFolder);
  formData.append('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error?.message || 'Cloudinary upload failed');
  }

  return {
    url: result.secure_url,
    storageProvider: 'cloudinary',
    storageKey: result.public_id,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
    visibility: options.visibility === 'private' ? 'private' : 'public',
    width: result.width,
    height: result.height,
    format: result.format,
  };
}

async function uploadRemoteToCloudinary(url, folder = 'documents', options = {}) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary storage is missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET'
    );
  }

  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only HTTP image URLs can be imported');
  }

  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, '') || 'uploads';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash('sha1')
    .update(`folder=${safeFolder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');

  const formData = new FormData();
  formData.append('file', url);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('folder', safeFolder);
  formData.append('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error?.message || 'Cloudinary remote upload failed');
  }

  return {
    url: result.secure_url,
    storageProvider: 'cloudinary',
    storageKey: result.public_id,
    originalName: parsedUrl.pathname.split('/').pop() || 'remote-image',
    mimeType:
      result.resource_type === 'image'
        ? `image/${result.format || 'jpeg'}`
        : result.resource_type,
    size: result.bytes,
    visibility: options.visibility === 'private' ? 'private' : 'public',
    width: result.width,
    height: result.height,
    format: result.format,
  };
}