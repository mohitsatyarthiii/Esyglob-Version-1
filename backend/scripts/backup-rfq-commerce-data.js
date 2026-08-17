import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import 'dotenv/config';

const DIRECT_COLLECTIONS = new Set([
  'rfqs',
  'quotations',
  'rfqmessages',
  'negotiations',
  'negotiationevents',
  'quotationrevisions',
  'counteroffers',
  'rfqparticipants',
  'rfqrecipients',
  'rfqresponses',
  'quotationsignatures',
  'rfqevents',
  'rfqaudits',
]);

const RFQ_NOTIFICATION_TYPES = [
  'rfq_created',
  'quotation_received',
  'quotation_accepted',
  'quotation_rejected',
  'quotation_counter_offer',
  'quotation_revised',
  'rfq_converted_to_order',
  'quotation_revision_requested',
];

function timestamp() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function ids(documents) {
  return documents.map((document) => document._id).filter(Boolean);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function collectionFileName(name) {
  return `${name}.ejsonl`;
}

async function readCollection(db, name, filter = {}) {
  if (!(await db.listCollections({ name }, { nameOnly: true }).hasNext())) return [];
  return db.collection(name).find(filter).sort({ _id: 1 }).toArray();
}

function objectIdSet(documents) {
  return new Set(ids(documents).map(String));
}

function relationDiagnostics(payloads) {
  const rfqIds = objectIdSet(payloads.rfqs || []);
  const quotationIds = objectIdSet(payloads.quotations || []);
  const chatIds = objectIdSet(payloads.chats || []);
  const missing = { quotationRfqs: [], chatRfqs: [], chatQuotations: [], messageChats: [], orderRfqs: [], orderQuotations: [] };

  for (const quotation of payloads.quotations || []) {
    if (quotation.rfqId && !rfqIds.has(String(quotation.rfqId))) missing.quotationRfqs.push(String(quotation._id));
  }
  for (const chat of payloads.chats || []) {
    if (chat.rfqId && !rfqIds.has(String(chat.rfqId))) missing.chatRfqs.push(String(chat._id));
    if (chat.quotationId && !quotationIds.has(String(chat.quotationId))) missing.chatQuotations.push(String(chat._id));
  }
  for (const message of payloads.messages || []) {
    if (message.chatId && !chatIds.has(String(message.chatId))) missing.messageChats.push(String(message._id));
  }
  for (const order of payloads.orders || []) {
    if (order.rfqId && !rfqIds.has(String(order.rfqId))) missing.orderRfqs.push(String(order._id));
    if (order.quotationId && !quotationIds.has(String(order.quotationId))) missing.orderQuotations.push(String(order._id));
  }

  return {
    missing,
    orphanCount: Object.values(missing).reduce((total, values) => total + values.length, 0),
  };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const outputIndex = process.argv.indexOf('--output');
  const outputDir = path.resolve(outputIndex >= 0 && process.argv[outputIndex + 1]
    ? process.argv[outputIndex + 1]
    : path.join('backups', 'rfq-commerce', timestamp()));

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20_000 });
  const db = mongoose.connection.db;
  const collectionNames = (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name);
  const payloads = {};

  for (const name of collectionNames) {
    if (DIRECT_COLLECTIONS.has(name) || /^(rfq|quotation|negotiation|counteroffer)/i.test(name)) {
      payloads[name] = await readCollection(db, name);
    }
  }

  const rfqDocuments = payloads.rfqs || [];
  const quotationDocuments = payloads.quotations || [];
  const rfqIds = ids(rfqDocuments);
  const quotationIds = ids(quotationDocuments);
  const relatedIds = [...rfqIds, ...quotationIds];

  payloads.chats = await readCollection(db, 'chats', {
    $or: [{ rfqId: { $in: rfqIds } }, { quotationId: { $in: quotationIds } }],
  });
  const chatIds = ids(payloads.chats);
  payloads.messages = await readCollection(db, 'messages', {
    $or: [
      { chatId: { $in: chatIds } },
      { 'rfqDetails.rfqId': { $in: rfqIds } },
      { 'quotationDetails.rfqId': { $in: rfqIds } },
      { 'quotationDetails.quotationId': { $in: quotationIds } },
    ],
  });
  payloads.notifications = await readCollection(db, 'notifications', {
    $or: [
      { 'data.relatedId': { $in: [...relatedIds, ...chatIds, ...ids(payloads.messages)] } },
      { notificationType: { $in: RFQ_NOTIFICATION_TYPES } },
      { eventKey: /^(rfq|public-rfq|quotation|counter-offer|final-quotation)/i },
      { 'data.actionUrl': /\/(rfqs?|quotations?)\//i },
    ],
  });
  payloads.orders = await readCollection(db, 'orders', {
    $or: [{ rfqId: { $in: rfqIds } }, { quotationId: { $in: quotationIds } }],
  });
  payloads.aichats = await readCollection(db, 'aichats', {
    $or: [{ 'metadata.rfqId': { $in: rfqIds } }, { 'metadata.quotationId': { $in: quotationIds } }],
  });
  payloads.ai_chats = await readCollection(db, 'ai_chats', {
    $or: [{ 'metadata.rfqId': { $in: rfqIds } }, { 'metadata.quotationId': { $in: quotationIds } }],
  });
  payloads.documents = await readCollection(db, 'documents', {
    $or: [
      { type: 'quotation' },
      { orderId: { $in: ids(payloads.orders) } },
      { 'content.rfqId': { $in: rfqIds } },
      { 'content.quotationId': { $in: quotationIds } },
    ],
  });

  await fs.mkdir(outputDir, { recursive: true });
  const files = {};
  for (const [name, documents] of Object.entries(payloads).sort(([left], [right]) => left.localeCompare(right))) {
    const body = documents.map((document) => EJSON.stringify(document, { relaxed: false })).join('\n') + (documents.length ? '\n' : '');
    const file = collectionFileName(name);
    await fs.writeFile(path.join(outputDir, file), body, { encoding: 'utf8', flag: 'wx' });
    files[name] = { file, count: documents.length, bytes: Buffer.byteLength(body), sha256: sha256(body) };
  }

  const diagnostics = relationDiagnostics(payloads);
  const manifest = {
    format: 'esyglob-rfq-commerce-backup-v1',
    createdAt: new Date().toISOString(),
    sourceDatabase: db.databaseName,
    restorableWith: 'scripts/restore-rfq-commerce-data.js',
    files,
    diagnostics,
  };
  const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.writeFile(path.join(outputDir, 'manifest.json'), manifestBody, { encoding: 'utf8', flag: 'wx' });
  await fs.writeFile(path.join(outputDir, 'manifest.sha256'), `${sha256(manifestBody)}  manifest.json\n`, { encoding: 'utf8', flag: 'wx' });

  console.log(JSON.stringify({ outputDir, files, diagnostics, verified: true }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
