import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectToDatabase, closeDatabase } from '../src/config/database.js';
import User from '../src/models/User.js';
import Seller from '../src/models/Seller.js';
import SellerVerification from '../src/models/SellerVerification.js';
import SupplierVerification from '../src/models/SupplierVerification.js';
import FactoryProfile from '../src/models/FactoryProfile.js';
import VerificationAudit from '../src/models/VerificationAudit.js';

const EXECUTE = process.argv.includes('--execute');
const CONFIRMED = process.argv.includes('--confirm=DELETE_MARKETPLACE_CONTENT');
const BACKUP_ONLY = process.argv.includes('--backup-only');
const IMAGES_ONLY = process.argv.includes('--images-only');
const BACKUP_DIRECTORY = fileURLToPath(new URL('../../backups/', import.meta.url));
const BACKUP_PATH = path.join(BACKUP_DIRECTORY, 'seller-verification-backup.json');
const CLEAN_COLLECTIONS = Object.freeze([
  'products',
  'productcategorymappings',
  'servicebookings',
  'serviceproviderquotes',
  'servicerequests',
  'chats',
  'messages',
  'conversations',
  'aichats',
  'rfqs',
  'quotations',
  'bulkproductimports',
  'recentlyvieweds',
  'saveditems',
  'reviews',
]);
const SYSTEM_COLLECTION_PREFIXES = ['system.'];

async function writeBackup() {
  const sellers = await Seller.find({}).lean();
  const sellerRecordIds = sellers.map(seller => seller._id);
  const sellerUserObjectIds = sellers.map(seller => seller.userId).filter(Boolean);
  const sellerUsers = await User.find({ $or: [{ roles: 'seller' }, { _id: { $in: sellerUserObjectIds } }] }).select('-passwordHash').lean();
  const sellerUserIds = [...new Set(sellerUsers.map(user => String(user._id)))];
  const [sellerVerifications, supplierVerifications, factories, audits] = await Promise.all([
    SellerVerification.find({}).lean(),
    SupplierVerification.find({}).lean(),
    FactoryProfile.find({}).lean(),
    VerificationAudit.find({}).lean(),
  ]);
  let previous = null;
  try {
    previous = JSON.parse(await fs.readFile(BACKUP_PATH, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const mergeById = (current, earlier = []) => {
    const records = new Map(current.map(record => [String(record._id), record]));
    // Prefer the original pre-cleanup copy when a backup already exists.
    for (const record of earlier) records.set(String(record._id), record);
    return [...records.values()];
  };
  const mergedSellerUsers = mergeById(sellerUsers, previous?.sellerUsers);
  const mergedSellers = mergeById(sellers, previous?.businessInformation);
  const mergedSellerVerifications = mergeById(sellerVerifications, previous?.sellerVerification);
  const mergedSupplierVerifications = mergeById(supplierVerifications, previous?.supplierVerification);
  const mergedFactories = mergeById(factories, previous?.factoryProfiles);
  const mergedAudits = mergeById(audits, previous?.verificationAudits);
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    purpose: 'Pre-VPS-storage cleanup seller verification backup',
    counts: {
      sellerUsers: mergedSellerUsers.length,
      sellers: mergedSellers.length,
      sellerVerifications: mergedSellerVerifications.length,
      supplierVerifications: mergedSupplierVerifications.length,
      factoryProfiles: mergedFactories.length,
      verificationAudits: mergedAudits.length,
    },
    sellerUserIds,
    sellerUsers: mergedSellerUsers,
    businessInformation: mergedSellers,
    sellerVerification: mergedSellerVerifications,
    supplierVerification: mergedSupplierVerifications,
    factoryProfiles: mergedFactories,
    verificationAudits: mergedAudits,
  };
  await fs.mkdir(BACKUP_DIRECTORY, { recursive: true });
  const temporary = `${BACKUP_PATH}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(payload, null, 2), { flag: 'wx', mode: 0o600 });
  await fs.rename(temporary, BACKUP_PATH);
  const check = JSON.parse(await fs.readFile(BACKUP_PATH, 'utf8'));
  if (check.schemaVersion !== 1 || check.counts.sellerVerifications !== mergedSellerVerifications.length) throw new Error('Seller verification backup validation failed');
  return { path: BACKUP_PATH, counts: payload.counts };
}

const LEGACY_MEDIA_FIELDS = new Set([
  'avatarUrl', 'companyLogo', 'coverImage', 'companyPhotos', 'logo', 'logoUrl',
  'image', 'images', 'imageUrl', 'thumbnailUrl', 'fileUrl', 'certificateUrl',
  'auditReportUrl', 'idProof', 'factoryImages', 'banner', 'bannerUrl',
]);

function clearMediaValue(value, fieldName = '') {
  if (LEGACY_MEDIA_FIELDS.has(fieldName)) {
    return { value: Array.isArray(value) ? [] : '', changed: Boolean(Array.isArray(value) ? value.length : value) };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const output = value.map(item => {
      const result = clearMediaValue(item);
      changed ||= result.changed;
      return result.value;
    });
    return { value: output, changed };
  }
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)
    || value._bsontype || typeof value.toHexString === 'function') return { value, changed: false };
  let changed = false;
  const output = { ...value };
  for (const [key, item] of Object.entries(value)) {
    const result = clearMediaValue(item, key);
    output[key] = result.value;
    changed ||= result.changed;
  }
  return { value: output, changed };
}

async function clearLegacyMediaReferences(database) {
  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  const results = [];
  for (const { name } of collections) {
    if (SYSTEM_COLLECTION_PREFIXES.some(prefix => name.startsWith(prefix))) continue;
    const collection = database.collection(name);
    const operations = [];
    let changedDocuments = 0;
    for await (const document of collection.find({})) {
      const sets = {};
      for (const [key, value] of Object.entries(document)) {
        if (key === '_id') continue;
        const sanitized = clearMediaValue(value, key);
        if (sanitized.changed) sets[key] = sanitized.value;
      }
      if (!Object.keys(sets).length) continue;
      changedDocuments += 1;
      operations.push({ updateOne: { filter: { _id: document._id }, update: { $set: sets } } });
      if (operations.length >= 250) {
        await collection.bulkWrite(operations, { ordered: false });
        operations.length = 0;
      }
    }
    if (operations.length) await collection.bulkWrite(operations, { ordered: false });
    if (changedDocuments) results.push({ collection: name, changedDocuments });
  }
  return results;
}

async function counts(database, names) {
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await database.collection(name).countDocuments()])));
}

async function main() {
  await connectToDatabase();
  const database = User.db.db;
  const protectedBefore = {
    users: await User.countDocuments(),
    admins: await User.countDocuments({ roles: 'admin' }),
    sellers: await Seller.countDocuments(),
    sellerVerifications: await SellerVerification.countDocuments(),
  };
  const existingCollections = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name));
  const targets = CLEAN_COLLECTIONS.filter(name => existingCollections.has(name));
  const targetCounts = await counts(database, targets);
  if (BACKUP_ONLY) {
    console.log(JSON.stringify({ mode: 'backup-only', backup: await writeBackup() }, null, 2));
    return;
  }
  if (!EXECUTE) {
    console.log(JSON.stringify({ mode: 'dry-run', protectedBefore, cleanupTargets: targetCounts, backupPath: BACKUP_PATH }, null, 2));
    return;
  }
  if (!CONFIRMED) throw new Error('Destructive cleanup requires --confirm=DELETE_MARKETPLACE_CONTENT');
  const backup = await writeBackup();
  const clearedLegacyMedia = await clearLegacyMediaReferences(database);
  if (IMAGES_ONLY) {
    const protectedAfter = {
      users: await User.countDocuments(),
      admins: await User.countDocuments({ roles: 'admin' }),
      sellers: await Seller.countDocuments(),
      sellerVerifications: await SellerVerification.countDocuments(),
    };
    for (const key of Object.keys(protectedBefore)) {
      if (protectedAfter[key] !== protectedBefore[key]) throw new Error(`Protected ${key} count changed during media cleanup`);
    }
    console.log(JSON.stringify({ mode: 'images-only', backup, protectedBefore, protectedAfter, clearedLegacyMedia }, null, 2));
    return;
  }
  const removed = {};
  for (const name of targets) removed[name] = (await database.collection(name).deleteMany({})).deletedCount;
  const protectedAfter = {
    users: await User.countDocuments(),
    admins: await User.countDocuments({ roles: 'admin' }),
    sellers: await Seller.countDocuments(),
    sellerVerifications: await SellerVerification.countDocuments(),
  };
  for (const key of Object.keys(protectedBefore)) {
    if (protectedAfter[key] !== protectedBefore[key]) throw new Error(`Protected ${key} count changed during cleanup`);
  }
  console.log(JSON.stringify({ mode: 'executed', backup, protectedBefore, protectedAfter, removed, clearedLegacyMedia }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => closeDatabase().catch(() => undefined));
