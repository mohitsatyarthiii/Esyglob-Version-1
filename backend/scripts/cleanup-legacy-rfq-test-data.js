import process from 'node:process';
import mongoose from 'mongoose';
import 'dotenv/config';

const TEST_EMAILS = ['mohit11@gmail.com', 'urbanwood@gmail.com'];
const CONFIRMATION = 'DELETE_LEGACY_RFQ_TEST_DATA';

function hasExecuteConfirmation() {
  return process.argv.includes('--execute') && process.argv.includes(`--confirm=${CONFIRMATION}`);
}

function idStrings(values) {
  return new Set(values.map(String));
}

async function buildScope(db) {
  const users = await db.collection('users').find(
    { email: { $in: TEST_EMAILS } },
    { projection: { email: 1, fullName: 1, roles: 1 } },
  ).toArray();
  const testUserIds = users.map(({ _id }) => _id);
  const sellers = await db.collection('sellers').find(
    { userId: { $in: testUserIds } },
    { projection: { userId: 1, companyName: 1 } },
  ).toArray();
  const testSellerIds = sellers.map(({ _id }) => _id);

  const rfqs = await db.collection('rfqs').find({
    $or: [
      { buyerId: { $in: testUserIds } },
      { sellerUserId: { $in: testUserIds } },
      { sellerId: { $in: testSellerIds } },
      { specificSupplierIds: { $in: testSellerIds } },
    ],
  }).toArray();
  const rfqIds = rfqs.map(({ _id }) => _id);
  const quotations = await db.collection('quotations').find({
    $or: [{ rfqId: { $in: rfqIds } }, { userId: { $in: testUserIds } }, { sellerId: { $in: testSellerIds } }],
  }).toArray();
  const quotationIds = quotations.map(({ _id }) => _id);
  const chats = await db.collection('chats').find({
    $or: [{ rfqId: { $in: rfqIds } }, { quotationId: { $in: quotationIds } }],
  }).toArray();
  const chatIds = chats.map(({ _id }) => _id);
  const idPattern = [...rfqIds, ...quotationIds].map(String).join('|');

  const messageFilter = {
    $or: [
      { 'rfqDetails.rfqId': { $in: rfqIds } },
      { 'quotationDetails.rfqId': { $in: rfqIds } },
      { 'quotationDetails.quotationId': { $in: quotationIds } },
      { deliveryKey: /^(rfq|public-rfq|quotation|counter-offer|final-quotation)/i },
      { chatId: { $in: chatIds }, messageType: { $in: ['rfq', 'quotation'] } },
    ],
  };
  const notificationFilter = {
    $or: [
      { 'data.relatedId': { $in: [...rfqIds, ...quotationIds] } },
      ...(idPattern ? [{ eventKey: new RegExp(idPattern, 'i') }, { 'data.actionUrl': new RegExp(idPattern, 'i') }] : []),
    ],
  };
  const orderFilter = { $or: [{ rfqId: { $in: rfqIds } }, { quotationId: { $in: quotationIds } }] };
  const documentFilter = { userId: { $in: testUserIds }, type: 'quotation' };

  return {
    users,
    sellers,
    rfqs,
    quotations,
    chats,
    ids: { testUserIds, testSellerIds, rfqIds, quotationIds, chatIds },
    filters: { messageFilter, notificationFilter, orderFilter, documentFilter },
  };
}

async function countScope(db, scope) {
  const existingRfqIds = idStrings(scope.rfqs.map(({ _id }) => _id));
  const orphanQuotationIds = scope.quotations
    .filter(({ rfqId }) => rfqId && !existingRfqIds.has(String(rfqId)))
    .map(({ _id }) => String(_id));
  return {
    users: scope.users.map(({ _id, email, fullName, roles }) => ({ _id, email, fullName, roles })),
    sellers: scope.sellers,
    rfqs: scope.rfqs.length,
    quotations: scope.quotations.length,
    orphanQuotationIds,
    linkedChatsPreserved: scope.chats.length,
    messages: await db.collection('messages').countDocuments(scope.filters.messageFilter),
    notifications: await db.collection('notifications').countDocuments(scope.filters.notificationFilter),
    linkedOrders: await db.collection('orders').countDocuments(scope.filters.orderFilter),
    legacyQuotationDocuments: await db.collection('documents').countDocuments(scope.filters.documentFilter),
    rfqSummary: scope.rfqs.map(({ _id, title, status, visibility, buyerId, sellerUserId, createdAt }) => ({ _id, title, status, visibility, buyerId, sellerUserId, createdAt })),
    quotationSummary: scope.quotations.map(({ _id, rfqId, userId, status, createdAt, negotiationHistory }) => ({ _id, rfqId, userId, status, createdAt, negotiationEvents: negotiationHistory?.length || 0 })),
  };
}

async function executeCleanup(db, scope) {
  const session = mongoose.connection.client.startSession();
  const results = {};
  await session.withTransaction(async () => {
    results.messages = (await db.collection('messages').deleteMany(scope.filters.messageFilter, { session })).deletedCount;
    results.notifications = (await db.collection('notifications').deleteMany(scope.filters.notificationFilter, { session })).deletedCount;
    results.documents = (await db.collection('documents').deleteMany(scope.filters.documentFilter, { session })).deletedCount;
    results.orders = (await db.collection('orders').deleteMany(scope.filters.orderFilter, { session })).deletedCount;
    results.quotations = (await db.collection('quotations').deleteMany({ _id: { $in: scope.ids.quotationIds } }, { session })).deletedCount;
    results.rfqs = (await db.collection('rfqs').deleteMany({ _id: { $in: scope.ids.rfqIds } }, { session })).deletedCount;

    results.chatsUpdated = (await db.collection('chats').updateMany(
      { _id: { $in: scope.ids.chatIds } },
      { $unset: { rfqId: '', quotationId: '' }, $set: { chatType: 'general' } },
      { session },
    )).modifiedCount;
    for (const chatId of scope.ids.chatIds) {
      const latest = await db.collection('messages').find({ chatId }, { session }).sort({ createdAt: -1 }).limit(1).next();
      await db.collection('chats').updateOne(
        { _id: chatId },
        { $set: { lastMessage: latest?.content || null, lastMessageAt: latest?.createdAt || null, buyerUnreadCount: 0, sellerUnreadCount: 0 } },
        { session },
      );
    }
  });
  await session.endSession();
  return results;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
  const db = mongoose.connection.db;
  const scope = await buildScope(db);
  const before = await countScope(db, scope);
  const execute = hasExecuteConfirmation();

  if (!execute) {
    console.log(JSON.stringify({ mode: 'dry-run', database: db.databaseName, confirmationRequired: `--execute --confirm=${CONFIRMATION}`, before }, null, 2));
    await mongoose.disconnect();
    return;
  }

  const deleted = await executeCleanup(db, scope);
  const remaining = {
    rfqs: await db.collection('rfqs').countDocuments({ _id: { $in: scope.ids.rfqIds } }),
    quotations: await db.collection('quotations').countDocuments({ _id: { $in: scope.ids.quotationIds } }),
    messages: await db.collection('messages').countDocuments(scope.filters.messageFilter),
    notifications: await db.collection('notifications').countDocuments(scope.filters.notificationFilter),
    linkedOrders: await db.collection('orders').countDocuments(scope.filters.orderFilter),
    usersPreserved: await db.collection('users').countDocuments({ _id: { $in: scope.ids.testUserIds } }),
    sellersPreserved: await db.collection('sellers').countDocuments({ _id: { $in: scope.ids.testSellerIds } }),
  };
  console.log(JSON.stringify({ mode: 'executed', database: db.databaseName, before, deleted, remaining }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
