import 'dotenv/config';
import mongoose from 'mongoose';
import RFQ from '../src/models/RFQ.js';
import Quotation from '../src/models/Quotation.js';
import Chat from '../src/models/Chat.js';
import Message from '../src/models/Message.js';
import Notification from '../src/models/Notification.js';

const privateRfqId = process.env.ESYGLOB_AUDIT_PRIVATE_RFQ_ID;
const privateQuotationId = process.env.ESYGLOB_AUDIT_QUOTATION_ID;
const publicRfqId = process.env.ESYGLOB_AUDIT_PUBLIC_RFQ_ID;
const publicQuotationId = process.env.ESYGLOB_AUDIT_PUBLIC_QUOTATION_ID;
if (![privateRfqId, privateQuotationId, publicRfqId, publicQuotationId, process.env.MONGODB_URI].every(Boolean)) throw new Error('Audit IDs and MONGODB_URI are required');

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
try {
  const [privateRfq, privateQuotation, publicRfq, publicQuotation] = await Promise.all([
    RFQ.findById(privateRfqId).lean(), Quotation.findById(privateQuotationId).lean(),
    RFQ.findById(publicRfqId).lean(), Quotation.findById(publicQuotationId).lean(),
  ]);
  if (![privateRfq, privateQuotation, publicRfq, publicQuotation].every(Boolean)) throw new Error('One or more production audit records are missing');
  const relatedIds = [privateRfq._id, privateQuotation._id, publicRfq._id, publicQuotation._id];
  const [privateChat, messages, notifications] = await Promise.all([
    Chat.findById(privateRfq.conversationId).lean(),
    Message.find({ $or: [{ 'rfqDetails.rfqId': { $in: [privateRfq._id, publicRfq._id] } }, { 'quotationDetails.quotationId': { $in: [privateQuotation._id, publicQuotation._id] } }] }).lean(),
    Notification.find({ 'data.relatedId': { $in: relatedIds } }).lean(),
  ]);
  const privatePrices = privateQuotation.negotiationHistory.map(item => Number(item.unitPrice)).filter(Number.isFinite);
  const publicPrices = publicQuotation.negotiationHistory.map(item => Number(item.unitPrice)).filter(Number.isFinite);
  const finalDocument = privateQuotation.tradeDocuments.find(item => String(item._id) === String(privateQuotation.finalQuotation?.documentId));
  const checks = {
    privateReferences: String(privateQuotation.rfqId) === String(privateRfq._id) && String(privateQuotation.productId) === String(privateRfq.productId),
    privateParticipants: String(privateRfq.sellerUserId) === String(privateQuotation.userId) && Boolean(privateChat),
    privateHistory: [100, 90, 95, 92, 93].every(price => privatePrices.includes(price)),
    privateFinalSigned: privateQuotation.status === 'final_quotation_signed' && finalDocument?.status === 'completed' && finalDocument.signatures?.some(item => item.signerRole === 'buyer') && finalDocument.signatures?.some(item => item.signerRole === 'seller'),
    publicReferences: String(publicQuotation.rfqId) === String(publicRfq._id) && publicRfq.visibility === 'public',
    publicHistory: [110, 105, 107].every(price => publicPrices.includes(price)),
    noOrphanMessages: messages.every(item => item.chatId && item.senderId && item.receiverId),
    noOrphanNotifications: notifications.every(item => item.userId && item.data?.relatedId),
  };
  if (!Object.values(checks).every(Boolean)) throw new Error(`Database integrity check failed: ${JSON.stringify(checks)}`);
  console.log(JSON.stringify({ database: mongoose.connection.name, checks, counts: { messages: messages.length, notifications: notifications.length, privateHistory: privateQuotation.negotiationHistory.length, publicHistory: publicQuotation.negotiationHistory.length }, statuses: { privateRfq: privateRfq.status, privateQuotation: privateQuotation.status, publicRfq: publicRfq.status, publicQuotation: publicQuotation.status } }, null, 2));
} finally {
  await mongoose.disconnect();
}
