import { connectToDatabase, closeDatabase } from '../src/config/database.js';
import User from '../src/models/User.js';
import Seller from '../src/models/Seller.js';
import SellerVerification from '../src/models/SellerVerification.js';

const EMPTY_COLLECTIONS = [
  'products', 'productcategorymappings', 'servicebookings', 'serviceproviderquotes',
  'servicerequests', 'chats', 'messages', 'conversations', 'aichats', 'rfqs',
  'quotations', 'bulkproductimports', 'recentlyvieweds', 'saveditems', 'reviews',
];
const LEGACY_MEDIA_FIELDS = new Set([
  'avatarUrl', 'companyLogo', 'coverImage', 'companyPhotos', 'logo', 'logoUrl',
  'image', 'images', 'imageUrl', 'thumbnailUrl', 'fileUrl', 'certificateUrl',
  'auditReportUrl', 'idProof', 'factoryImages', 'banner', 'bannerUrl',
]);

function isPopulated(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '';
}

function inspect(value, fieldName = '', result = { legacyMediaReferences: 0 }) {
  if (typeof value === 'string') {
    if (LEGACY_MEDIA_FIELDS.has(fieldName) && isPopulated(value)) result.legacyMediaReferences += 1;
    return result;
  }
  if (Array.isArray(value)) {
    if (LEGACY_MEDIA_FIELDS.has(fieldName) && value.length) result.legacyMediaReferences += 1;
    else for (const item of value) inspect(item, '', result);
    return result;
  }
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)
    || value._bsontype || typeof value.toHexString === 'function') return result;
  for (const [key, item] of Object.entries(value)) inspect(item, key, result);
  return result;
}

async function main() {
  await connectToDatabase();
  const database = User.db.db;
  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  const collectionNames = new Set(collections.map(item => item.name));
  const cleanupCounts = {};
  for (const name of EMPTY_COLLECTIONS) {
    if (collectionNames.has(name)) cleanupCounts[name] = await database.collection(name).countDocuments();
  }
  const referenceAudit = [];
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    const result = { legacyMediaReferences: 0 };
    for await (const document of database.collection(name).find({})) inspect(document, '', result);
    if (result.legacyMediaReferences) referenceAudit.push({ collection: name, ...result });
  }
  const protectedCounts = {
    users: await User.countDocuments(),
    admins: await User.countDocuments({ roles: 'admin' }),
    sellers: await Seller.countDocuments(),
    sellerVerifications: await SellerVerification.countDocuments(),
  };
  const failedCollections = Object.entries(cleanupCounts).filter(([, count]) => count !== 0);
  if (failedCollections.length || referenceAudit.length) {
    throw new Error(`Migration validation failed: ${JSON.stringify({ failedCollections, referenceAudit })}`);
  }
  console.log(JSON.stringify({ status: 'valid', protectedCounts, cleanupCounts, referenceAudit }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => closeDatabase().catch(() => undefined));
