import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectToDatabase, closeDatabase } from '../src/config/database.js';

const REPORT_DIR = path.resolve(new URL('../../qa-artifacts/data-cleanup/', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, value => value.slice(1)));

await connectToDatabase();
const db = mongoose.connection.db;
const session = await mongoose.startSession();
const report = { startedAt: new Date().toISOString(), database: db.databaseName, repairs: {} };
try {
  await session.withTransaction(async () => {
    const categoryIds = await db.collection('categories').distinct('_id', {}, { session });
    const orphanSubcategories = await db.collection('subcategories').find({ categoryId: { $nin: categoryIds } }, { session }).toArray();
    const subcategoryResult = await db.collection('subcategories').deleteMany({ _id: { $in: orphanSubcategories.map(row => row._id) } }, { session });
    report.repairs.orphanSubcategoriesDeleted = subcategoryResult.deletedCount;
    report.repairs.orphanSubcategoryNames = orphanSubcategories.map(row => row.name);

    const userIds = await db.collection('users').distinct('_id', {}, { session });
    const orphanSubscriptions = await db.collection('subscriptions').find({ userId: { $nin: userIds } }, { session }).toArray();
    const subscriptionResult = await db.collection('subscriptions').deleteMany({ _id: { $in: orphanSubscriptions.map(row => row._id) } }, { session });
    report.repairs.orphanSubscriptionsDeleted = subscriptionResult.deletedCount;

    const paymentIds = await db.collection('payments').distinct('_id', {}, { session });
    const stalePaymentResult = await db.collection('subscriptions').updateMany({ lastPaymentId: { $exists: true, $nin: paymentIds } }, { $unset: { lastPaymentId: '' } }, { session });
    report.repairs.staleSubscriptionPaymentReferencesUnset = stalePaymentResult.modifiedCount;

    const aiChatIds = [...await db.collection('aichats').distinct('_id', {}, { session }), ...await db.collection('ai_chats').distinct('_id', {}, { session })];
    const staleChatResult = await db.collection('supporttickets').updateMany({ aiChatId: { $exists: true, $nin: aiChatIds } }, { $unset: { aiChatId: '' } }, { session });
    report.repairs.staleSupportTicketChatReferencesUnset = staleChatResult.modifiedCount;
  });
  report.status = 'completed';
} catch (error) {
  report.status = 'failed';
  report.error = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await session.endSession();
  report.finishedAt = new Date().toISOString();
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORT_DIR, 'orphan-repair-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await closeDatabase();
}
