import mongoose from 'mongoose';
import Document from '../models/Document.js';
import Notification from '../models/Notification.js';
import Order from '../models/Order.js';
import Quotation from '../models/Quotation.js';
import RFQ from '../models/RFQ.js';
import Seller from '../models/Seller.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Product from '../models/Product.js';
import Review from '../models/Review.js';
import Shipment from '../models/Shipment.js';
import { lifecycleSnapshot } from './business-lifecycle.service.js';
import { getIO } from '../lib/socket.js';

const MODEL = { rfq: RFQ, quotation: Quotation, order: Order };
const NOTE_FIELD = { rfq: 'notes', quotation: 'structuredNotes', order: 'structuredNotes' };
const allowedDocumentTypes = new Set(['commercial_proposal','quotation','proforma_invoice','purchase_agreement','commercial_agreement','technical_specification','terms_document','drawing','certificate','invoice','packing_list','inspection_report','shipping_document','other']);
const id = value => String(value?._id || value || '');

async function loadContext(entityType, entityId, user) {
  const Model = MODEL[entityType];
  if (!Model || !mongoose.Types.ObjectId.isValid(entityId)) throw Object.assign(new Error('Trade record not found'), { statusCode: 404 });
  const entity = await Model.findById(entityId);
  if (!entity) throw Object.assign(new Error('Trade record not found'), { statusCode: 404 });
  const userId = id(user._id || user.id);
  const isAdmin = user.roles?.includes('admin');
  let buyerId = '', sellerUserId = '';
  if (entityType === 'rfq') {
    buyerId = id(entity.buyerId);
    sellerUserId = id(entity.sellerUserId);
    if (!sellerUserId) sellerUserId = id((await Quotation.findOne({ rfqId: entity._id, userId }).select('userId').lean())?.userId);
    if (!sellerUserId && user.roles?.includes('seller') && entity.visibility === 'public' && ['active','pending','viewed','quoted','negotiating'].includes(entity.status)) {
      const eligibleSeller = await Seller.findOne({ userId, isActive: true, isSuspended: { $ne: true } }).select('userId').lean();
      if (eligibleSeller) sellerUserId = userId;
    }
  } else if (entityType === 'quotation') {
    const rfq = await RFQ.findById(entity.rfqId).select('buyerId').lean();
    buyerId = id(rfq?.buyerId); sellerUserId = id(entity.userId);
  } else {
    buyerId = id(entity.buyerId || entity.userId);
    const seller = await Seller.findById(entity.sellerId).select('userId').lean(); sellerUserId = id(seller?.userId);
  }
  const actorRole = userId === buyerId ? 'buyer' : userId === sellerUserId ? 'seller' : isAdmin ? 'admin' : '';
  if (!actorRole) throw Object.assign(new Error('You are not a participant in this trade'), { statusCode: 403 });
  return { entity, actorRole, userId, buyerId, sellerUserId };
}

function visibleNotes(notes, userId, actorRole) {
  return (notes || []).filter(note => note.visibility !== 'private' || id(note.authorId) === userId || actorRole === 'admin');
}

async function notifyParticipant(context, title, description, notificationType = 'document_shared', extraData = {}) {
  const recipient = context.actorRole === 'buyer' ? context.sellerUserId : context.buyerId;
  if (!recipient) return;
  const entityType = context.entity.constructor.modelName.toLowerCase();
  const notification = await Notification.create({ userId: recipient, notificationType, title, description, data: { relatedId: context.entity._id, relatedModel: context.entity.constructor.modelName, actionUrl: `/${entityType}s/${context.entity._id}${context.actorRole === 'buyer' ? '?role=seller' : ''}`, ...extraData } }).catch(() => null);
  if (notification) getIO()?.to(`user_${recipient}`).emit('new_notification', notification);
}

async function publishAgreementEvent(context, document, content, { attachPdf = false } = {}) {
  if (context.entity.constructor.modelName !== 'Quotation') return;
  const chat = await Chat.findOne({ buyerId: context.buyerId, sellerId: context.sellerUserId, $or: [{ quotationId: context.entity._id }, { rfqId: context.entity.rfqId }] }).sort({ updatedAt: -1 });
  if (!chat) return;
  const receiverId = context.actorRole === 'buyer' ? context.sellerUserId : context.buyerId;
  const pdfUrl = `${document.previewUrl}?format=pdf`;
  const message = await Message.create({ chatId: chat._id, senderId: context.userId, receiverId, content, messageType: 'system', attachments: attachPdf ? [{ url: pdfUrl, name: document.filename || 'Signed Agreement.pdf', type: 'application/pdf', mimeType: 'application/pdf' }] : [], quotationDetails: { quotationId: context.entity._id, rfqId: context.entity.rfqId, status: context.entity.status, actionUrl: `/quotations/${context.entity._id}` }, isRead: false });
  await Chat.updateOne({ _id: chat._id }, { $set: { lastMessage: content, lastMessageAt: new Date() }, $inc: context.actorRole === 'buyer' ? { sellerUnreadCount: 1 } : { buyerUnreadCount: 1 } });
  const io = getIO();
  if (io) { io.to(`chat_${chat._id}`).emit('new_message', message); io.to(`user_${receiverId}`).emit('quotation_updated', { quotationId: context.entity._id, status: context.entity.status, documentStatus: document.status }); io.to(`user_${context.userId}`).emit('quotation_updated', { quotationId: context.entity._id, status: context.entity.status, documentStatus: document.status }); }
}

export async function getWorkspace(entityType, entityId, user) {
  const context = await loadContext(entityType, entityId, user);
  return { notes: visibleNotes(context.entity[NOTE_FIELD[entityType]], context.userId, context.actorRole), documents: context.entity.tradeDocuments || [], actorRole: context.actorRole };
}

export async function getUnifiedWorkspace(entityType, entityId, user) {
  const context = await loadContext(entityType, entityId, user);
  let rfq = null, order = null, activeQuotation = null;
  if (entityType === 'rfq') rfq = context.entity;
  if (entityType === 'quotation') { activeQuotation = context.entity; rfq = await RFQ.findById(activeQuotation.rfqId); }
  if (entityType === 'order') {
    order = context.entity;
    [rfq, activeQuotation] = await Promise.all([order.rfqId ? RFQ.findById(order.rfqId) : null, order.quotationId ? Quotation.findById(order.quotationId) : null]);
  }
  if (!order) order = await Order.findOne(activeQuotation ? { quotationId: activeQuotation._id } : { rfqId: rfq?._id }).sort({ createdAt: -1 });
  const quotationQuery = rfq ? { rfqId: rfq._id } : activeQuotation ? { _id: activeQuotation._id } : null;
  if (quotationQuery && context.actorRole === 'seller') quotationQuery.userId = context.userId;
  const quotations = quotationQuery ? await Quotation.find(quotationQuery).sort({ revisionNumber: -1, updatedAt: -1 }).lean() : [];
  if (!activeQuotation && quotations.length) activeQuotation = await Quotation.findById(quotations.find(item => ['buyer_accepted','final_quotation_pending','final_quotation_signed','agreement_pending','agreement_signed','won'].includes(item.status))?._id || quotations[0]._id);
  const productId = order?.productId || activeQuotation?.productId || rfq?.productId;
  const relatedIds = [rfq?._id, activeQuotation?._id, order?._id].filter(Boolean);
  const [product, chats, payment, shipment, invoice, reviews, notifications] = await Promise.all([
    productId ? Product.findById(productId).populate('sellerId', 'companyName companyLogo isVerified verificationLevel userId').lean() : null,
    Chat.find({ $and: [{ $or: [{ buyerId: context.userId }, { sellerId: context.userId }] }, { $or: [{ rfqId: rfq?._id }, { quotationId: activeQuotation?._id }] }] }).select('chatType rfqId quotationId buyerId sellerId lastMessage lastMessageAt buyerUnreadCount sellerUnreadCount').sort({ lastMessageAt: -1 }).lean(),
    order ? Payment.findOne({ $or: [{ _id: order.paymentId }, { orderId: order._id }] }).sort({ createdAt: -1 }).lean() : null,
    order ? Shipment.findOne({ orderId: order._id }).sort({ createdAt: -1 }).lean() : null,
    order ? Invoice.findOne({ orderId: order._id }).sort({ createdAt: -1 }).lean() : null,
    order ? Review.find({ orderId: order._id, status: 'published' }).sort({ createdAt: -1 }).lean() : [],
    relatedIds.length ? Notification.find({ userId: context.userId, 'data.relatedId': { $in: relatedIds } }).sort({ createdAt: -1 }).limit(50).lean() : [],
  ]);
  const entities = [rfq, ...quotations, order].filter(Boolean);
  const documents = entities.flatMap(entity => (entity.tradeDocuments || []).map(document => ({ ...(document.toObject?.() || document), entityType: entity === rfq ? 'rfq' : entity === order ? 'order' : 'quotation', entityId: entity._id })));
  const notes = entities.flatMap(entity => visibleNotes(entity[entity === rfq ? 'notes' : 'structuredNotes'], context.userId, context.actorRole).map(note => ({ ...(note.toObject?.() || note), entityType: entity === rfq ? 'rfq' : entity === order ? 'order' : 'quotation', entityId: entity._id })));
  const timeline = entities.flatMap(entity => (entity.activityTimeline || entity.timeline || []).map(event => ({ ...(event.toObject?.() || event), entityType: entity === rfq ? 'rfq' : entity === order ? 'order' : 'quotation', entityId: entity._id }))).sort((a,b) => new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0));
  const currentEntity = order || activeQuotation || rfq;
  const lifecycleType = order ? 'order' : activeQuotation ? 'quotation' : 'rfq';
  return {
    tradeId: order?.orderNumber || activeQuotation?.finalQuotation?.finalQuotationNumber || activeQuotation?.agreement?.agreementNumber || rfq?.rfqNumber || String(currentEntity?._id),
    actorRole: context.actorRole,
    currentEntity: { type: lifecycleType, id: currentEntity?._id },
    lifecycle: lifecycleSnapshot(lifecycleType, currentEntity, context.actorRole),
    product,
    rfq: rfq?.toObject?.() || rfq,
    quotations,
    activeQuotation: activeQuotation?.toObject?.() || activeQuotation,
    order: order?.toObject?.() || order,
    agreement: activeQuotation?.agreement?.status !== 'not_required' ? activeQuotation?.agreement : order?.agreement,
    finalQuotation: activeQuotation?.finalQuotation,
    chats,
    notes: notes.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)),
    documents: documents.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)),
    payment,
    shipment,
    invoice,
    reviews,
    notifications,
    timeline,
  };
}

export async function addNote(entityType, entityId, user, input) {
  const context = await loadContext(entityType, entityId, user);
  const text = String(input.text || '').trim();
  if (!text) throw Object.assign(new Error('Note text is required'), { statusCode: 422 });
  const noteType = ['internal','shared','negotiation','commercial','technical'].includes(input.noteType) ? input.noteType : 'shared';
  const field = NOTE_FIELD[entityType];
  context.entity[field].push({ noteType, text, visibility: noteType === 'internal' ? 'private' : 'participants', authorId: context.userId, authorRole: context.actorRole, attachments: Array.isArray(input.attachments) ? input.attachments : [], documentId: input.documentId });
  if (context.entity.activityTimeline) context.entity.activityTimeline.push({ action: 'note_added', message: `${noteType} note added`, actorId: context.userId, actorRole: context.actorRole });
  if (context.entity.timeline) context.entity.timeline.push({ status: 'note_added', note: `${noteType} note added`, updatedBy: context.userId, timestamp: new Date() });
  await context.entity.save();
  if (noteType !== 'internal') await notifyParticipant(context, 'Trade note added', text.slice(0, 180), 'message_received');
  return getWorkspace(entityType, entityId, user);
}

export async function createTradeDocument(entityType, entityId, user, input) {
  const context = await loadContext(entityType, entityId, user);
  const documentType = allowedDocumentTypes.has(input.documentType) ? input.documentType : 'other';
  const isAgreement = ['purchase_agreement','commercial_agreement'].includes(documentType);
  if (entityType === 'quotation' && documentType === 'quotation' && !input.metadata?.isFinalQuotation) throw Object.assign(new Error('Final Quotations are generated only from Seller preparation.'), { statusCode: 409 });
  if (entityType === 'quotation' && isAgreement) {
    throw Object.assign(new Error('Separate Agreement documents are retired. Use the signed Final Quotation.'), { statusCode: 409 });
  }
  const title = String(input.title || documentType.replaceAll('_', ' ')).trim();
  const requiresBuyerSignature = Boolean(input.requiresBuyerSignature);
  const requiresSellerSignature = Boolean(input.requiresSellerSignature);
  const initialStatus = requiresSellerSignature ? 'awaiting_seller_signature' : requiresBuyerSignature ? 'awaiting_buyer_signature' : 'completed';
  const previousVersion = [...(context.entity.tradeDocuments || [])].reverse().find(document => document.documentType === documentType && document.title === title);
  const version = Number(previousVersion?.version || 0) + 1;
  const globalDocument = await Document.create({ userId: context.userId, name: title, type: documentType, category: 'other', orderId: entityType === 'order' ? context.entity._id : undefined, content: input.content || {}, fileUrl: input.url, fileType: input.fileType, status: input.url ? 'shared' : 'generated', data: { currency: input.currency, terms: input.terms, notes: input.notes } });
  context.entity.tradeDocuments.push({ documentType, title, url: input.url, filename: input.filename || `${title}.pdf`, source: input.url ? 'uploaded' : 'generated', status: initialStatus, version, requiresBuyerSignature, requiresSellerSignature, createdBy: context.userId, metadata: { ...(input.metadata || {}), globalDocumentId: globalDocument._id, previousDocumentId: previousVersion?._id, changedFields: input.changedFields || [], notes: input.notes, content: input.content || {} }, completedAt: initialStatus === 'completed' ? new Date() : undefined });
  const embedded = context.entity.tradeDocuments.at(-1);
  embedded.previewUrl = `/api/trade-workspace/${entityType}/${entityId}/documents/${embedded._id}/preview`;
  if (entityType === 'order' && ['purchase_agreement','commercial_agreement','terms_document'].includes(documentType) && (requiresBuyerSignature || requiresSellerSignature)) context.entity.agreement = { required: true, documentId: embedded._id, status: initialStatus };
  if (entityType === 'quotation' && ['purchase_agreement','commercial_agreement'].includes(documentType) && (requiresBuyerSignature || requiresSellerSignature)) context.entity.agreement = { ...(context.entity.agreement?.toObject?.() || context.entity.agreement || {}), documentId: embedded._id, status: initialStatus };
  if (entityType === 'quotation' && input.metadata?.isFinalQuotation) context.entity.finalQuotation = { ...(context.entity.finalQuotation?.toObject?.() || context.entity.finalQuotation || {}), documentId: embedded._id, status: initialStatus, version, preparedAt: new Date() };
  if (context.entity.activityTimeline) context.entity.activityTimeline.push({ action: 'document_created', message: title, actorId: context.userId, actorRole: context.actorRole, metadata: { documentId: embedded._id } });
  if (context.entity.timeline) context.entity.timeline.push({ status: 'document_created', note: title, updatedBy: context.userId, timestamp: new Date() });
  await context.entity.save();
  await notifyParticipant(context, 'Trade document available', `${title} was added to the trade workspace.`, 'document_generated');
  if (entityType === 'quotation' && isAgreement) await publishAgreementEvent(context, embedded, context.entity.status === 'buyer_accepted' ? 'A live Agreement was generated automatically from the accepted quotation. Seller review and signature are required.' : 'Seller completed the Agreement. It is awaiting the Seller signature.');
  return { document: embedded, workspace: await getWorkspace(entityType, entityId, user) };
}

export async function signTradeDocument(entityType, entityId, documentId, user, input, requestMeta = {}) {
  const context = await loadContext(entityType, entityId, user);
  const document = context.entity.tradeDocuments.id(documentId);
  if (!document || !['buyer','seller'].includes(context.actorRole)) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  const required = context.actorRole === 'buyer' ? document.requiresBuyerSignature : document.requiresSellerSignature;
  const isAgreement = ['purchase_agreement','commercial_agreement'].includes(document.documentType);
  const isFinalQuotation = entityType === 'quotation' && document.documentType === 'quotation' && document.metadata?.isFinalQuotation;
  if (isFinalQuotation && context.entity.status !== 'final_quotation_pending') throw Object.assign(new Error('This Final Quotation is not open for signatures'), { statusCode: 409 });
  if (isFinalQuotation && context.actorRole === 'seller' && document.status !== 'awaiting_seller_signature') throw Object.assign(new Error('This Final Quotation is not awaiting the Seller signature'), { statusCode: 409 });
  if (isFinalQuotation && context.actorRole === 'buyer' && document.status !== 'awaiting_buyer_signature') throw Object.assign(new Error('This Final Quotation is not awaiting the Buyer signature'), { statusCode: 409 });
  if (entityType === 'quotation' && isAgreement && context.entity.status !== 'agreement_pending') throw Object.assign(new Error('This quotation is not awaiting agreement signatures'), { statusCode: 409 });
  if (isAgreement && context.actorRole === 'seller' && document.status !== 'awaiting_seller_signature') throw Object.assign(new Error('The agreement is not awaiting the seller signature'), { statusCode: 409 });
  if (isAgreement && context.actorRole === 'buyer' && document.status !== 'awaiting_buyer_signature') throw Object.assign(new Error('The agreement is not awaiting the buyer signature'), { statusCode: 409 });
  if (!required) throw Object.assign(new Error(`${context.actorRole} signature is not required`), { statusCode: 409 });
  if (context.actorRole === 'buyer' && document.requiresSellerSignature && !document.signatures.some(signature => signature.signerRole === 'seller')) throw Object.assign(new Error('The seller must sign before the buyer'), { statusCode: 409 });
  if (document.signatures.some(signature => signature.signerRole === context.actorRole)) throw Object.assign(new Error('Document is already signed by this party'), { statusCode: 409 });
  if (!String(input.signatureValue || '').trim() || !String(input.signerName || '').trim()) throw Object.assign(new Error('Signer name and signature are required'), { statusCode: 422 });
  document.signatures.push({ signerId: context.userId, signerRole: context.actorRole, signerName: String(input.signerName).trim(), signatureType: input.signatureType || 'typed', signatureValue: String(input.signatureValue), ipAddress: requestMeta.ipAddress, userAgent: requestMeta.userAgent });
  const sellerSigned = !document.requiresSellerSignature || document.signatures.some(signature => signature.signerRole === 'seller');
  const buyerSigned = !document.requiresBuyerSignature || document.signatures.some(signature => signature.signerRole === 'buyer');
  document.status = sellerSigned && buyerSigned ? 'completed' : sellerSigned ? 'awaiting_buyer_signature' : 'awaiting_seller_signature';
  if (document.status === 'completed') document.completedAt = new Date();
  if (entityType === 'order' && id(context.entity.agreement?.documentId) === id(document._id)) { context.entity.agreement.status = document.status; if (document.status === 'completed') context.entity.agreement.completedAt = new Date(); }
  if (entityType === 'quotation' && id(context.entity.agreement?.documentId) === id(document._id)) {
    context.entity.agreement.status = document.status;
    if (context.actorRole === 'seller') context.entity.agreement.sellerSignedAt = new Date();
    if (context.actorRole === 'buyer') context.entity.agreement.buyerSignedAt = new Date();
    if (document.status === 'completed') {
      const previousStatus = context.entity.status;
      context.entity.agreement.completedAt = new Date();
      context.entity.previousStatus = previousStatus;
      context.entity.status = 'agreement_signed';
      context.entity.approvalHistory.push({ action: 'agreement_completed', previousStatus, newStatus: 'agreement_signed', actorId: context.userId, actorRole: context.actorRole, notes: 'Both parties signed the agreement' });
      context.entity.activityTimeline.push({ action: 'agreement_completed', status: 'agreement_signed', message: 'Agreement is active and the buyer can start the order', actorId: context.userId, actorRole: context.actorRole, metadata: { documentId: document._id } });
      context.entity.activityTimeline.push({ action: 'order_enabled', status: 'agreement_signed', message: 'Order configuration is now enabled', actorId: context.userId, actorRole: context.actorRole, metadata: { documentId: document._id, orderEnabled: true } });
    }
  }
  if (isFinalQuotation && id(context.entity.finalQuotation?.documentId) === id(document._id) && document.status === 'completed') {
    const previousStatus = context.entity.status;
    context.entity.finalQuotation.status = 'signed';
    context.entity.finalQuotation.sellerSignedAt ||= document.signatures.find(signature => signature.signerRole === 'seller')?.signedAt || new Date();
    context.entity.finalQuotation.buyerSignedAt = new Date();
    context.entity.finalQuotation.lockedAt = new Date();
    context.entity.previousStatus = previousStatus;
    context.entity.status = 'final_quotation_signed';
    context.entity.approvalHistory.push({ action: 'final_quotation_signed', previousStatus, newStatus: 'final_quotation_signed', actorId: context.userId, actorRole: 'buyer', notes: `Buyer signed Final Quotation version ${document.version}` });
    context.entity.activityTimeline.push({ action: 'final_quotation_signed', status: 'final_quotation_signed', message: 'Buyer signed the Final Quotation; commercial terms are locked', actorId: context.userId, actorRole: 'buyer', metadata: { documentId: document._id, version: document.version } });
    context.entity.activityTimeline.push({ action: 'order_enabled', status: 'final_quotation_signed', message: 'Start Order is now enabled', actorId: context.userId, actorRole: 'buyer', metadata: { documentId: document._id, orderEnabled: true } });
  }
  if (isFinalQuotation && id(context.entity.finalQuotation?.documentId) === id(document._id) && context.actorRole === 'seller') {
    context.entity.finalQuotation.status = 'awaiting_buyer_signature';
    context.entity.finalQuotation.sellerSignedAt = new Date();
    context.entity.approvalHistory.push({ action: 'seller_signed_final_quotation', previousStatus: context.entity.status, newStatus: context.entity.status, actorId: context.userId, actorRole: 'seller', notes: `Seller signed Final Quotation version ${document.version}` });
    context.entity.activityTimeline.push({ action: 'seller_signed_final_quotation', status: document.status, message: 'Seller signed the Final Quotation; Buyer review is now open', actorId: context.userId, actorRole: 'seller', metadata: { documentId: document._id, version: document.version } });
  }
  if (context.entity.activityTimeline) {
    context.entity.activityTimeline.push({ action: isFinalQuotation ? `${context.actorRole}_signed_final_quotation` : isAgreement ? `${context.actorRole}_signed_agreement` : 'document_signed', status: document.status, message: `${context.actorRole} signed ${document.title}`, actorId: context.userId, actorRole: context.actorRole, metadata: { documentId: document._id } });
    if (isAgreement && context.actorRole === 'seller') context.entity.activityTimeline.push({ action: 'buyer_notified', status: document.status, message: 'Buyer notified that their agreement signature is required', actorId: context.userId, actorRole: context.actorRole, metadata: { documentId: document._id } });
  }
  if (context.entity.timeline) context.entity.timeline.push({ status: isFinalQuotation ? 'final_quotation_signed' : 'agreement_signed', note: `${context.actorRole} signed ${document.title}`, updatedBy: context.userId, timestamp: new Date() });
  await context.entity.save();
  const notificationTitle = isFinalQuotation ? context.actorRole === 'seller' ? 'Seller signed the Final Quotation — your signature is required' : 'Buyer signed the Final Quotation' : isAgreement && context.actorRole === 'seller' ? 'Seller signed the Agreement — your signature is required' : isAgreement ? 'Agreement fully signed and active' : 'Document signed';
  const notificationDescription = isFinalQuotation ? context.actorRole === 'seller' ? 'Review the Seller-signed document and add the Buyer signature to enable Start Order.' : 'The official commercial document is fully signed and Start Order is now enabled.' : isAgreement && context.actorRole === 'seller' ? 'The Seller has signed the Agreement. Your signature is required to proceed with the order.' : isAgreement ? 'Both parties signed the Agreement. Order configuration is now enabled.' : `${context.actorRole} signed ${document.title}.`;
  const signedPdfUrl = `${document.previewUrl}?format=pdf`;
  await notifyParticipant(context, notificationTitle, notificationDescription, 'document_signed', isFinalQuotation ? { documentUrl: signedPdfUrl } : {});
  if (isFinalQuotation) {
    const fullySigned = document.status === 'completed';
    const confirmation = await Notification.create({ userId: context.userId, notificationType: 'document_signed', title: 'Final Quotation signed successfully', description: fullySigned ? 'Both signatures are recorded. The trade is ready for Order execution.' : 'Your Seller signature was recorded and the Buyer was notified.', data: { relatedId: context.entity._id, relatedModel: 'Quotation', actionUrl: `/quotations/${context.entity._id}`, documentUrl: signedPdfUrl }, priority: 'high' }).catch(() => null);
    if (confirmation) getIO()?.to(`user_${context.userId}`).emit('new_notification', confirmation);
    await publishAgreementEvent(context, document, context.actorRole === 'seller' ? 'Seller signed the Final Quotation. Buyer signature is now required.' : 'Buyer signed the Final Quotation. Order is now enabled for this product.', { attachPdf: fullySigned }).catch(() => {});
  }
  if (isAgreement) await publishAgreementEvent(context, document, context.actorRole === 'seller' ? 'The Seller has completed and signed the Agreement. Please review and sign to continue.' : 'Buyer signed the Agreement. The Agreement is fully executed and the Order is now enabled.', { attachPdf: true });
  return { document, workspace: await getWorkspace(entityType, entityId, user) };
}

export async function getTradeDocument(entityType, entityId, documentId, user) {
  const context = await loadContext(entityType, entityId, user);
  const document = context.entity.tradeDocuments.id(documentId);
  if (!document) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  return { document, entityNumber: context.entity.orderNumber || context.entity.quotationNumber || context.entity.title || String(context.entity._id) };
}
