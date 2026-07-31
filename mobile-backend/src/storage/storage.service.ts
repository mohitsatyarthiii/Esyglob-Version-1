import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';

const FOLDERS = [
  'products', 'product-thumbnails', 'categories', 'subcategories', 'manufacturers',
  'companies', 'seller-logos', 'seller-banners', 'profiles', 'banners', 'homepage',
  'services', 'verification', 'documents', 'certificates', 'temp',
] as const;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_EXTENSIONS = new Map<string, string>([
  ['application/pdf', '.pdf'], ['text/plain', '.txt'], ['text/csv', '.csv'],
  ['application/zip', '.zip'], ['application/msword', '.doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
  ['application/vnd.ms-excel', '.xls'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  ['audio/mpeg', '.mp3'], ['audio/mp4', '.m4a'], ['audio/wav', '.wav'],
  ['audio/webm', '.webm'], ['video/mp4', '.mp4'], ['video/webm', '.webm'],
]);
const MAX_BYTES = 5 * 1024 * 1024;
const FOLDER_MAP: Record<string, string> = {
  products: 'products', verification: 'verification', factory: 'manufacturers',
  'factory-profiles': 'manufacturers', 'profile-photos': 'profiles', chat: 'documents',
  general: 'documents',
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly root = resolve(
    process.env.VPS_STORAGE_ROOT
      || (process.env.NODE_ENV === 'production' && process.platform !== 'win32'
        ? '/var/www/esyglob/storage'
        : join(process.cwd(), '..', 'backend', 'storage')),
  );

  async onModuleInit() {
    await this.ensureFoldersExist();
    const probe = this.absolute(`.write-test-${process.pid}-${randomUUID()}`);
    await writeFile(probe, 'ok', { flag: 'wx', mode: 0o600 });
    await unlink(probe);
    console.info(`[Storage] VPS storage ready (${FOLDERS.length} folders)`);
  }

  async ensureFoldersExist() {
    await mkdir(this.root, { recursive: true, mode: 0o750 });
    await Promise.all(FOLDERS.map(folder => mkdir(join(this.root, folder), { recursive: true, mode: 0o750 })));
  }

  async upload(file: any, requestedFolder = 'general') {
    const buffer = Buffer.isBuffer(file?.buffer) ? file.buffer : null;
    const mimeType = String(file?.mimetype || '').toLowerCase();
    if (!buffer?.length) throw new BadRequestException('Upload file is required.');
    if (buffer.length > MAX_BYTES) throw new BadRequestException('Upload file must be 5MB or smaller.');
    const [requestedRoot, ...requestedChildren] = String(requestedFolder || 'general').replace(/\\/g, '/').split('/').filter(Boolean);
    const rootFolder = FOLDER_MAP[requestedRoot] || 'documents';
    const children = requestedChildren.slice(0, 3).map(value => value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)).filter(Boolean);
    const folder = [rootFolder, ...children].join('/');
    return IMAGE_MIMES.has(mimeType)
      ? this.uploadImage(buffer, mimeType, folder, file.originalname)
      : this.uploadDocument(buffer, mimeType, folder, file.originalname);
  }

  async read(storageKey: string) {
    return readFile(this.absolute(storageKey));
  }

  private async uploadImage(buffer: Buffer, mimeType: string, folder: string, originalName = 'image') {
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
    } catch {
      throw new BadRequestException('The uploaded image is invalid or corrupted.');
    }
    const actual = String(metadata.format || '').replace('jpeg', 'jpg');
    const declared = mimeType.split('/')[1].replace('jpeg', 'jpg');
    if (actual !== declared || !metadata.width || !metadata.height || Number(metadata.pages || 1) > 1) {
      throw new BadRequestException('Image content does not match its MIME type.');
    }
    const id = randomUUID();
    const specifications = [
      { name: 'original', width: 2048, quality: 84, folder },
      { name: 'medium', width: 1024, quality: 80, folder },
      { name: 'thumbnail', width: 320, quality: 76, folder: folder.split('/')[0] === 'products' ? ['product-thumbnails', ...folder.split('/').slice(1)].join('/') : folder },
    ];
    const variants: Record<string, { storageKey: string; url: string; size: number }> = {};
    for (const specification of specifications) {
      const optimized = await sharp(buffer).rotate().resize({ width: specification.width, height: specification.width, fit: 'inside', withoutEnlargement: true }).webp({ quality: specification.quality, effort: 5 }).toBuffer();
      const storageKey = `${specification.folder}/${id}-${specification.name}.webp`;
      await this.atomicWrite(storageKey, optimized);
      variants[specification.name] = { storageKey, url: this.url(storageKey), size: optimized.length };
    }
    return {
      id: variants.original.storageKey,
      storageKey: variants.original.storageKey,
      storageProvider: 'vps',
      url: variants.original.url,
      secure_url: variants.original.url,
      name: String(originalName).slice(0, 255),
      mimeType: 'image/webp',
      size: variants.original.size,
      variants,
    };
  }

  private async uploadDocument(buffer: Buffer, mimeType: string, folder: string, originalName = 'document') {
    const extension = DOCUMENT_EXTENSIONS.get(mimeType);
    if (!extension || !this.validSignature(buffer, mimeType)) {
      throw new BadRequestException('Unsupported or invalid file content.');
    }
    const storageKey = `${folder}/${randomUUID()}${extension}`;
    await this.atomicWrite(storageKey, buffer);
    return {
      id: storageKey,
      storageKey,
      storageProvider: 'vps',
      url: this.url(storageKey),
      secure_url: this.url(storageKey),
      name: String(originalName).slice(0, 255),
      mimeType,
      size: buffer.length,
    };
  }

  private validSignature(buffer: Buffer, mimeType: string) {
    if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
    if (mimeType.includes('zip') || mimeType.includes('openxmlformats')) return buffer.subarray(0, 2).toString() === 'PK';
    if (mimeType === 'application/msword' || mimeType === 'application/vnd.ms-excel') return buffer.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
    if (mimeType.startsWith('text/')) return !buffer.includes(0);
    if (mimeType === 'audio/mpeg') return buffer.subarray(0, 3).toString() === 'ID3' || buffer[0] === 0xff;
    if (mimeType === 'audio/wav') return buffer.subarray(0, 4).toString() === 'RIFF';
    if (mimeType.includes('mp4')) return buffer.subarray(4, 8).toString() === 'ftyp';
    if (mimeType.includes('webm')) return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    return false;
  }

  private url(storageKey: string) {
    const base = String(process.env.STORAGE_PUBLIC_BASE_URL || 'https://api.esyglob.in/storage').replace(/\/$/, '');
    return `${base}/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
  }

  private absolute(storageKey: string) {
    const normalized = String(storageKey || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || normalized.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
      throw new BadRequestException('Invalid storage path.');
    }
    const absolute = resolve(this.root, ...normalized.split('/'));
    if (relative(this.root, absolute).startsWith(`..${sep}`) || absolute === this.root) {
      throw new BadRequestException('Invalid storage path.');
    }
    return absolute;
  }

  private async atomicWrite(storageKey: string, buffer: Buffer) {
    const destination = this.absolute(storageKey);
    await mkdir(dirname(destination), { recursive: true, mode: 0o750 });
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, buffer, { flag: 'wx', mode: 0o640 });
    await rename(temporary, destination);
  }
}
