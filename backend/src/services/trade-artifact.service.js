import mongoose from 'mongoose';
import Document from '../models/Document.js';
import Notification from '../models/Notification.js';
import Order from '../models/Order.js';
import Quotation from '../models/Quotation.js';
import RFQ from '../models/RFQ.js';
import Seller from '../models/Seller.js';

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

async function notifyParticipant(context, title, description, notificationType = 'document_shared') {
  const recipient = context.actorRole === 'buyer' ? context.sellerUserId : context.buyerId;
  if (!recipient) return;
  await Notification.create({ userId: recipient, notificationType, title, description, data: { relatedId: context.entity._id, relatedModel: context.entity.constructor.modelName } }).catch(() => {});
}

export async function getWorkspace(entityType, entityId, user) {
  const context = await loadContext(entityType, entityId, user);
  return { notes: visibleNotes(context.entity[NOTE_FIELD[entityType]], context.userId, context.actorRole), documents: context.entity.tradeDocuments || [], actorRole: context.actorRole };
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
  const title = String(input.title || documentType.replaceAll('_', ' ')).trim();
  const requiresBuyerSignature = Boolean(input.requiresBuyerSignature);
  const requiresSellerSignature = Boolean(input.requiresSellerSignature);
  const initialStatus = requiresSellerSignature ? 'awaiting_seller_signature' : requiresBuyerSignature ? 'awaiting_buyer_signature' : 'completed';
  const globalDocument = await Document.create({ userId: context.userId, name: title, type: documentType, category: 'other', orderId: entityType === 'order' ? context.entity._id : undefined, content: input.content || {}, fileUrl: input.url, fileType: input.fileType, status: input.url ? 'shared' : 'generated', data: { currency: input.currency, terms: input.terms, notes: input.notes } });
  context.entity.tradeDocuments.push({ documentType, title, url: input.url, filename: input.filename || `${title}.pdf`, source: input.url ? 'uploaded' : 'generated', status: initialStatus, requiresBuyerSignature, requiresSellerSignature, createdBy: context.userId, metadata: { globalDocumentId: globalDocument._id, content: input.content || {} }, completedAt: initialStatus === 'completed' ? new Date() : undefined });
  const embedded = context.entity.tradeDocuments.at(-1);
  embedded.previewUrl = `/api/trade-workspace/${entityType}/${entityId}/documents/${embedded._id}/preview`;
  if (entityType === 'order' && ['purchase_agreement','commercial_agreement','terms_document'].includes(documentType) && (requiresBuyerSignature || requiresSellerSignature)) context.entity.agreement = { required: true, documentId: embedded._id, status: initialStatus };
  if (entityType === 'quotation' && ['purchase_agreement','commercial_agreement'].includes(documentType) && (requiresBuyerSignature || requiresSellerSignature)) context.entity.agreement = { ...(context.entity.agreement?.toObject?.() || context.entity.agreement || {}), documentId: embedded._id, status: initialStatus };
  if (context.entity.activityTimeline) context.entity.activityTimeline.push({ action: 'document_created', message: title, actorId: context.userId, actorRole: context.actorRole, metadata: { documentId: embedded._id } });
  if (context.entity.timeline) context.entity.timeline.push({ status: 'document_created', note: title, updatedBy: context.userId, timestamp: new Date() });
  await context.entity.save();
  await notifyParticipant(context, 'Trade document available', `${title} was added to the trade workspace.`, 'document_generated');
  return { document: embedded, workspace: await getWorkspace(entityType, entityId, user) };
}

export async function signTradeDocument(entityType, entityId, documentId, user, input, requestMeta = {}) {
  const context = await loadContext(entityType, entityId, user);
  const document = context.entity.tradeDocuments.id(documentId);
  if (!document || !['buyer','seller'].includes(context.actorRole)) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  const required = context.actorRole === 'buyer' ? document.requiresBuyerSignature : document.requiresSellerSignature;
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
    if (document.status === 'completed') {
      const previousStatus = context.entity.status;
      context.entity.agreement.completedAt = new Date();
      context.entity.previousStatus = previousStatus;
      context.entity.status = 'agreement_signed';
      context.entity.approvalHistory.push({ action: 'agreement_completed', previousStatus, newStatus: 'agreement_signed', actorId: context.userId, actorRole: context.actorRole, notes: 'Both parties signed the agreement' });
      context.entity.activityTimeline.push({ action: 'agreement_completed', status: 'agreement_signed', message: 'Agreement is active and the buyer can start the order', actorId: context.userId, actorRole: context.actorRole, metadata: { documentId: document._id } });
    }
  }
  if (context.entity.activityTimeline) context.entity.activityTimeline.push({ action: 'document_signed', message: `${context.actorRole} signed ${document.title}`, actorId: context.userId, actorRole: context.actorRole });
  if (context.entity.timeline) context.entity.timeline.push({ status: 'agreement_signed', note: `${context.actorRole} signed ${document.title}`, updatedBy: context.userId, timestamp: new Date() });
  await context.entity.save();
  await notifyParticipant(context, 'Document signed', `${context.actorRole} signed ${document.title}.`, 'document_signed');
  return { document, workspace: await getWorkspace(entityType, entityId, user) };
}

export async function getTradeDocument(entityType, entityId, documentId, user) {
  const context = await loadContext(entityType, entityId, user);
  const document = context.entity.tradeDocuments.id(documentId);
  if (!document) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  return { document, entityNumber: context.entity.orderNumber || context.entity.quotationNumber || context.entity.title || String(context.entity._id) };
}
