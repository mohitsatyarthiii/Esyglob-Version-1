import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectToDatabase, closeDatabase } from '../src/config/database.js';
import StorageService from '../src/services/storage.service.js';

const EXECUTE = process.argv.includes('--execute');
const CONFIRMED = process.argv.includes('--confirm=DELETE_ALL_SELLER_DATA');
if (EXECUTE && !CONFIRMED) throw new Error('Execution requires --confirm=DELETE_ALL_SELLER_DATA');

const MASTER_COLLECTIONS = new Set([
  'categories', 'subcategories', 'hscodes', 'commercesettings', 'subscriptionplans',
  'knowledgedocuments', 'taxcalculations',
]);
const SPORTS_PATTERN = /sports(?:wear)?\s*(?:&|and)?\s*outdoor\s*apparel/i;
const REPORT_DIR = path.resolve(new URL('../../qa-artifacts/data-cleanup/', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, value => value.slice(1)));

function ids(rows) { return rows.map(row => row._id); }
function inIds(values) { return { $in: values }; }
function asKey(id) { return String(id); }
function isObjectId(value) { return value?._bsontype === 'ObjectId'; }

function collectObjectIds(value, output = new Set()) {
  if (isObjectId(value)) output.add(asKey(value));
  else if (Array.isArray(value)) value.forEach(item => collectObjectIds(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectObjectIds(item, output));
  return output;
}

function collectStorageKeys(value, output = new Set(), field = '') {
  if (Array.isArray(value)) value.forEach(item => collectStorageKeys(item, output, field));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectStorageKeys(item, output, key);
  } else if (typeof value === 'string') {
    if (/storagekey/i.test(field) && /^[a-z0-9-]+\//i.test(value)) output.add(value.replace(/\\/g, '/'));
    const match = value.match(/\/storage\/([^?#]+)/i);
    if (match) {
      try { output.add(match[1].split('/').map(decodeURIComponent).join('/')); } catch { /* malformed legacy URL */ }
    }
  }
  return output;
}

async function rowsFor(db, collection, filter, session) {
  return db.collection(collection).find(filter, { session }).toArray();
}

async function deleteRows(db, report, collection, filter, session, targetIds, mediaCandidates) {
  const rows = await rowsFor(db, collection, filter, session);
  if (!rows.length) return [];
  rows.forEach(row => {
    targetIds.add(asKey(row._id));
    collectStorageKeys(row, mediaCandidates);
  });
  const result = await db.collection(collection).deleteMany({ _id: { $in: ids(rows) } }, { session });
  report.collections[collection] = (report.collections[collection] || 0) + result.deletedCount;
  return rows;
}

async function findDangling(db, collections, targetIds, session) {
  const dangling = [];
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    const cursor = db.collection(name).find({}, { session });
    for await (const document of cursor) {
      const references = [...collectObjectIds(document)].filter(id => id !== asKey(document._id) && targetIds.has(id));
      if (references.length) dangling.push({ collection: name, _id: document._id, references });
    }
  }
  return dangling;
}

async function allRemainingStorageKeys(db) {
  const output = new Set();
  const collections = await db.listCollections().toArray();
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    const cursor = db.collection(name).find({});
    for await (const document of cursor) collectStorageKeys(document, output);
  }
  return output;
}

async function indexAudit(db) {
  const duplicates = [];
  const collections = await db.listCollections().toArray();
  for (const { name } of collections) {
    const indexes = await db.collection(name).listIndexes().toArray().catch(() => []);
    const seen = new Map();
    for (const index of indexes) {
      const signature = JSON.stringify({ key: index.key, unique: Boolean(index.unique), sparse: Boolean(index.sparse), partialFilterExpression: index.partialFilterExpression || null });
      if (seen.has(signature)) duplicates.push({ collection: name, indexes: [seen.get(signature), index.name] });
      else seen.set(signature, index.name);
    }
  }
  return duplicates;
}

async function run() {
  await connectToDatabase();
  const db = mongoose.connection.db;
  const session = await mongoose.startSession();
  const report = {
    mode: EXECUTE ? 'execute' : 'dry-run', database: db.databaseName, startedAt: new Date().toISOString(),
    collections: {}, category: {}, storage: { candidates: 0, removed: [], stillReferenced: [], missingLocally: [], errors: [] }, integrity: {},
  };
  const targetIds = new Set();
  const mediaCandidates = new Set();
  let committed = false;

  try {
    session.startTransaction();
    const sellerUsers = await rowsFor(db, 'users', { roles: 'seller' }, session);
    const adminSeller = sellerUsers.filter(user => user.roles?.includes('admin'));
    if (adminSeller.length) throw new Error(`Refusing cleanup: ${adminSeller.length} administrator accounts also have the seller role`);
    const sellerProfiles = await rowsFor(db, 'sellers', {}, session);
    const sellerUserIds = ids(sellerUsers);
    const sellerIds = ids(sellerProfiles);
    sellerUsers.forEach(row => { targetIds.add(asKey(row._id)); collectStorageKeys(row, mediaCandidates); });
    sellerProfiles.forEach(row => { targetIds.add(asKey(row._id)); collectStorageKeys(row, mediaCandidates); });
    report.sellerUsers = sellerUsers.length;
    report.sellerProfiles = sellerProfiles.length;

    const products = await rowsFor(db, 'products', {}, session);
    const productIds = ids(products);
    products.forEach(row => { targetIds.add(asKey(row._id)); collectStorageKeys(row, mediaCandidates); });
    const productDrafts = await rowsFor(db, 'productdrafts', {}, session);
    const productDraftIds = ids(productDrafts);

    const orders = await rowsFor(db, 'orders', { $or: [{ sellerId: { $exists: true } }, { productId: inIds(productIds) }, { 'products.productId': inIds(productIds) }] }, session);
    const orderIds = ids(orders); orders.forEach(row => targetIds.add(asKey(row._id)));
    const quotations = await rowsFor(db, 'quotations', { $or: [{ sellerId: inIds(sellerIds) }, { userId: inIds(sellerUserIds) }, { productId: inIds(productIds) }] }, session);
    const quotationIds = ids(quotations); quotations.forEach(row => targetIds.add(asKey(row._id)));
    const rfqs = await rowsFor(db, 'rfqs', { $or: [{ sellerId: inIds(sellerIds) }, { sellerUserId: inIds(sellerUserIds) }, { productId: inIds(productIds) }] }, session);
    const rfqIds = ids(rfqs); rfqs.forEach(row => targetIds.add(asKey(row._id)));
    const chats = await rowsFor(db, 'chats', { $or: [{ sellerId: inIds(sellerUserIds) }, { productId: inIds(productIds) }, { rfqId: inIds(rfqIds) }, { quotationId: inIds(quotationIds) }] }, session);
    const chatIds = ids(chats); chats.forEach(row => targetIds.add(asKey(row._id)));
    const subscriptions = await rowsFor(db, 'subscriptions', { userId: inIds(sellerUserIds) }, session);
    const subscriptionIds = ids(subscriptions); subscriptions.forEach(row => targetIds.add(asKey(row._id)));
    const payments = await rowsFor(db, 'payments', { $or: [{ userId: inIds(sellerUserIds) }, { orderId: inIds(orderIds) }, { subscriptionId: inIds(subscriptionIds) }, { entityId: { $in: [...orderIds, ...sellerIds] } }] }, session);
    const paymentIds = ids(payments); payments.forEach(row => targetIds.add(asKey(row._id)));

    const direct = [
      ['messages', { $or: [{ chatId: inIds(chatIds) }, { senderId: inIds(sellerUserIds) }, { receiverId: inIds(sellerUserIds) }, { 'productDetails.productId': inIds(productIds) }, { 'orderDetails.orderId': inIds(orderIds) }, { 'rfqDetails.rfqId': inIds(rfqIds) }, { 'quotationDetails.quotationId': inIds(quotationIds) }] }],
      ['chats', { _id: inIds(chatIds) }],
      ['shipments', { $or: [{ orderId: inIds(orderIds) }, { sellerId: inIds(sellerIds) }, { sellerUserId: inIds(sellerUserIds) }] }],
      ['invoices', { $or: [{ orderId: inIds(orderIds) }, { sellerId: inIds(sellerIds) }, { sellerUserId: inIds(sellerUserIds) }] }],
      ['escrowtransactions', { $or: [{ userId: inIds(sellerUserIds) }, { sellerId: inIds(sellerIds) }, { orderId: inIds(orderIds) }] }],
      ['tradeassurancecases', { $or: [{ orderId: inIds(orderIds) }, { sellerId: inIds(sellerUserIds) }] }],
      ['tradeassurances', { $or: [{ userId: inIds(sellerUserIds) }, { sellerId: inIds(sellerIds) }, { orderId: inIds(orderIds) }] }],
      ['reviews', { $or: [{ userId: inIds(sellerUserIds) }, { sellerId: inIds(sellerIds) }, { productId: inIds(productIds) }, { orderId: inIds(orderIds) }] }],
      ['saveditems', { $or: [{ userId: inIds(sellerUserIds) }, { sellerId: inIds(sellerIds) }, { productId: inIds(productIds) }] }],
      ['recentlyvieweds', { $or: [{ userId: inIds(sellerUserIds) }, { productId: inIds(productIds) }] }],
      ['couponredemptions', { $or: [{ userId: inIds(sellerUserIds) }, { sellerId: inIds(sellerIds) }, { orderId: inIds(orderIds) }] }],
      ['giftcardtransactions', { $or: [{ userId: inIds(sellerUserIds) }, { orderId: inIds(orderIds) }] }],
      ['wallettransactions', { $or: [{ userId: inIds(sellerUserIds) }, { orderId: inIds(orderIds) }, { paymentId: inIds(paymentIds) }] }],
      ['payments', { _id: inIds(paymentIds) }], ['subscriptions', { _id: inIds(subscriptionIds) }],
      ['quotations', { _id: inIds(quotationIds) }], ['rfqs', { _id: inIds(rfqIds) }], ['orders', { _id: inIds(orderIds) }],
      ['productcategorymappings', {}], ['bulkproductimports', {}], ['factoryprofiles', {}], ['certifications', {}],
      ['sellerverifications', {}], ['supplierverifications', {}], ['verificationaudits', {}],
      ['productdrafts', {}], ['products', {}],
      ['wallets', { $or: [{ userId: inIds(sellerUserIds) }, { sellerId: inIds(sellerIds) }] }],
      ['withdrawalrequests', { $or: [{ userId: inIds(sellerUserIds) }, { sellerId: inIds(sellerIds) }] }],
      ['adminactivities', { $or: [{ actorId: inIds(sellerUserIds) }, { resourceId: { $in: [...sellerUserIds, ...sellerIds, ...productIds, ...orderIds, ...quotationIds, ...rfqIds] } }] }],
    ];
    for (const [collection, filter] of direct) await deleteRows(db, report, collection, filter, session, targetIds, mediaCandidates);

    const userOwned = ['addresses','ai_chats','aichats','aiusages','consultingengagements','contactleads','customsclearances','documents','marketanalytics','notifications','passwordresets','paymentmethods','qualityinspections','saved_research_reports','savedresearchreports','servicebookings','serviceproviderquotes','servicequotes','servicerequests','shippingorders','supporttickets','taxcalculations','tradefinancings','userlocations','warehouseinventories','warehouseorders','warehouses','mobile_sessions'];
    for (const collection of userOwned) await deleteRows(db, report, collection, { userId: inIds(sellerUserIds) }, session, targetIds, mediaCandidates);

    await db.collection('coupons').updateMany({}, { $pull: { sellerIds: inIds(sellerIds), productIds: inIds(productIds) } }, { session });
    await deleteRows(db, report, 'coupons', { $or: [{ sellerId: inIds(sellerIds) }, { ownerType: 'seller' }] }, session, targetIds, mediaCandidates);
    await db.collection('rfqs').updateMany({}, { $pull: { specificSupplierIds: inIds(sellerIds), viewedBySellerIds: inIds(sellerUserIds), repliedBySellerIds: inIds(sellerUserIds) } }, { session });

    const sportsCategory = await db.collection('categories').findOne({ $or: [{ name: SPORTS_PATTERN }, { slug: /sports(?:wear)?-and-outdoor-apparel/i }] }, { session });
    if (!sportsCategory) throw new Error('Sports & Outdoor Apparel category was not found');
    const sportsSubcategories = await rowsFor(db, 'subcategories', { categoryId: sportsCategory._id }, session);
    const unrelated = sportsSubcategories.filter(item => !/(sport|outdoor|athletic|activewear|gym|fitness|hiking|camping|cycling|running|swim|jersey|tracksuit|sportswear)/i.test(`${item.name} ${item.slug}`));
    const categoryDeletion = await db.collection('subcategories').deleteMany({ _id: { $in: ids(unrelated) } }, { session });
    report.collections.subcategories = (report.collections.subcategories || 0) + categoryDeletion.deletedCount;
    report.category = { _id: sportsCategory._id, name: sportsCategory.name, removed: unrelated.map(item => item.name), kept: sportsSubcategories.filter(item => !unrelated.includes(item)).map(item => item.name) };

    await deleteRows(db, report, 'sellers', { _id: inIds(sellerIds) }, session, targetIds, mediaCandidates);
    await deleteRows(db, report, 'users', { _id: inIds(sellerUserIds) }, session, targetIds, mediaCandidates);

    let dangling = await findDangling(db, await db.listCollections().toArray(), targetIds, session);
    for (let pass = 0; dangling.length && pass < 5; pass += 1) {
      const byCollection = Map.groupBy(dangling, item => item.collection);
      for (const [collection, rows] of byCollection) {
        if (MASTER_COLLECTIONS.has(collection) || collection === 'users' || collection === 'categories' || collection === 'subcategories') {
          throw new Error(`Protected collection ${collection} still references deleted seller data`);
        }
        await deleteRows(db, report, collection, { _id: { $in: rows.map(row => row._id) } }, session, targetIds, mediaCandidates);
      }
      dangling = await findDangling(db, await db.listCollections().toArray(), targetIds, session);
    }
    if (dangling.length) throw new Error(`${dangling.length} dangling seller references remain after cascade`);

    report.integrity = {
      sellerUsersRemaining: await db.collection('users').countDocuments({ roles: 'seller' }, { session }),
      sellerProfilesRemaining: await db.collection('sellers').countDocuments({}, { session }),
      productsRemaining: await db.collection('products').countDocuments({}, { session }),
      sellerVerificationsRemaining: await db.collection('sellerverifications').countDocuments({}, { session }),
      supplierVerificationsRemaining: await db.collection('supplierverifications').countDocuments({}, { session }),
      sportsSubcategoriesRemaining: await db.collection('subcategories').countDocuments({ categoryId: sportsCategory._id }, { session }),
      danglingReferences: dangling.length,
    };
    if (Object.values(report.integrity).some(value => value !== 0)) throw new Error(`Integrity verification failed: ${JSON.stringify(report.integrity)}`);

    if (EXECUTE) { await session.commitTransaction(); committed = true; }
    else await session.abortTransaction();
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    report.error = { message: error.message, stack: error.stack };
    throw error;
  } finally {
    await session.endSession();
    report.storage.candidates = mediaCandidates.size;
    if (committed) {
      const remaining = await allRemainingStorageKeys(db);
      for (const storageKey of mediaCandidates) {
        if (remaining.has(storageKey)) { report.storage.stillReferenced.push(storageKey); continue; }
        try {
          await StorageService.readFile(storageKey);
          await StorageService.deleteImage(storageKey);
          report.storage.removed.push(storageKey);
        } catch (error) {
          if (error.code === 'ENOENT') report.storage.missingLocally.push(storageKey);
          else report.storage.errors.push({ storageKey, error: error.message });
        }
      }
    }
    report.duplicateIndexes = await indexAudit(db);
    report.finishedAt = new Date().toISOString();
    report.status = report.error ? 'failed' : EXECUTE ? 'completed' : 'dry-run-passed';
    await fs.mkdir(REPORT_DIR, { recursive: true });
    await fs.writeFile(path.join(REPORT_DIR, EXECUTE ? 'cleanup-report.json' : 'dry-run-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    await closeDatabase();
  }
}

await run();
