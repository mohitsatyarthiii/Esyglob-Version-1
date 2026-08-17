import process from 'node:process';
import mongoose from 'mongoose';
import 'dotenv/config';

const CONFIRMATION = 'DELETE_ORPHAN_RFQ_RECORDS';
const execute = process.argv.includes('--execute') && process.argv.includes(`--confirm=${CONFIRMATION}`);

function invalidReference(value, valid) {
  return value && !valid.has(String(value));
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
  const db = mongoose.connection.db;
  const [rfqs, quotations, chats, messages, notifications, orders] = await Promise.all([
    db.collection('rfqs').find({}, { projection: { _id: 1 } }).toArray(),
    db.collection('quotations').find({}, { projection: { _id: 1, rfqId: 1 } }).toArray(),
    db.collection('chats').find({}, { projection: { _id: 1, rfqId: 1, quotationId: 1 } }).toArray(),
    db.collection('messages').find({}, { projection: { _id: 1, chatId: 1, rfqDetails: 1, quotationDetails: 1 } }).toArray(),
    db.collection('notifications').find({ 'data.relatedModel': { $in: ['RFQ', 'Quotation'] } }, { projection: { _id: 1, data: 1 } }).toArray(),
    db.collection('orders').find({ $or: [{ rfqId: { $exists: true } }, { quotationId: { $exists: true } }] }, { projection: { _id: 1, rfqId: 1, quotationId: 1 } }).toArray(),
  ]);
  const rfqIds = new Set(rfqs.map(({ _id }) => String(_id)));
  const quotationIds = new Set(quotations.map(({ _id }) => String(_id)));
  const chatIds = new Set(chats.map(({ _id }) => String(_id)));
  const orphanQuotationIds = quotations.filter(({ rfqId }) => invalidReference(rfqId, rfqIds)).map(({ _id }) => _id);
  const orphanQuotationSet = new Set(orphanQuotationIds.map(String));
  const orphanMessageIds = messages.filter((message) =>
    invalidReference(message.chatId, chatIds) ||
    invalidReference(message.rfqDetails?.rfqId, rfqIds) ||
    invalidReference(message.quotationDetails?.rfqId, rfqIds) ||
    invalidReference(message.quotationDetails?.quotationId, quotationIds) ||
    orphanQuotationSet.has(String(message.quotationDetails?.quotationId || ''))
  ).map(({ _id }) => _id);
  const orphanNotificationIds = notifications.filter((notification) => {
    const model = notification.data?.relatedModel;
    return model === 'RFQ' ? invalidReference(notification.data?.relatedId, rfqIds) : invalidReference(notification.data?.relatedId, quotationIds);
  }).map(({ _id }) => _id);
  const orphanOrderIds = orders.filter((order) => invalidReference(order.rfqId, rfqIds) || invalidReference(order.quotationId, quotationIds) || orphanQuotationSet.has(String(order.quotationId || ''))).map(({ _id }) => _id);
  const invalidChats = chats.filter((chat) => invalidReference(chat.rfqId, rfqIds) || invalidReference(chat.quotationId, quotationIds));
  const report = {
    orphanQuotationIds: orphanQuotationIds.map(String),
    orphanMessageIds: orphanMessageIds.map(String),
    orphanNotificationIds: orphanNotificationIds.map(String),
    orphanOrderIds: orphanOrderIds.map(String),
    invalidChatIds: invalidChats.map(({ _id }) => String(_id)),
  };

  if (!execute) {
    console.log(JSON.stringify({ mode: 'dry-run', database: db.databaseName, confirmationRequired: `--execute --confirm=${CONFIRMATION}`, report }, null, 2));
    await mongoose.disconnect();
    return;
  }

  const session = mongoose.connection.client.startSession();
  const deleted = {};
  await session.withTransaction(async () => {
    deleted.messages = (await db.collection('messages').deleteMany({ _id: { $in: orphanMessageIds } }, { session })).deletedCount;
    deleted.notifications = (await db.collection('notifications').deleteMany({ _id: { $in: orphanNotificationIds } }, { session })).deletedCount;
    deleted.orders = (await db.collection('orders').deleteMany({ _id: { $in: orphanOrderIds } }, { session })).deletedCount;
    deleted.quotations = (await db.collection('quotations').deleteMany({ _id: { $in: orphanQuotationIds } }, { session })).deletedCount;
    deleted.chatsUpdated = 0;
    for (const chat of invalidChats) {
      const unset = {};
      if (invalidReference(chat.rfqId, rfqIds)) unset.rfqId = '';
      if (invalidReference(chat.quotationId, quotationIds) || orphanQuotationSet.has(String(chat.quotationId || ''))) unset.quotationId = '';
      if (Object.keys(unset).length) deleted.chatsUpdated += (await db.collection('chats').updateOne({ _id: chat._id }, { $unset: unset }, { session })).modifiedCount;
    }
  });
  await session.endSession();
  console.log(JSON.stringify({ mode: 'executed', database: db.databaseName, report, deleted }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
