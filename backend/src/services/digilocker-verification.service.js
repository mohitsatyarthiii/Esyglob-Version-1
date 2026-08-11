import crypto from 'crypto';
import { config } from '../config/env.js';
import { digiLockerProvider } from '../lib/verification-providers/digilocker.provider.js';
import VerificationProviderSession from '../models/VerificationProviderSession.js';
import * as supplierRepository from '../repositories/supplier.repository.js';

const SESSION_TTL_MS = 10 * 60 * 1000;

export function capabilities() { return digiLockerProvider.capabilities(); }

export async function selectManual(user) {
  const seller = await supplierRepository.findExistingSeller(user.id);
  if (!seller) throw error('Complete your business profile before starting verification.', 'SELLER_PROFILE_REQUIRED', 409);
  const existing = await supplierRepository.findExistingVerification(seller._id);
  const verification = await supplierRepository.upsertVerificationRecord(seller._id, user.id, {
    sellerId: seller._id, userId: user.id, verificationMethod: 'manual',
  });
  if (existing?.verificationMethod !== 'manual') await supplierRepository.createAuditLog({
    verificationId: verification._id, sellerId: seller._id, actorId: user.id,
    action: 'verification_method_selected', fromStatus: existing?.status || 'pending', toStatus: verification.status,
    metadata: { method: 'manual' },
  });
  return verification;
}

export async function start(user) {
  const seller = await supplierRepository.findExistingSeller(user.id);
  if (!seller) throw error('Complete your business profile before starting DigiLocker verification.', 'SELLER_PROFILE_REQUIRED', 409);
  digiLockerProvider.assertConfigured();
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  await VerificationProviderSession.create({
    userId: user.id, sellerId: seller._id, provider: 'digilocker',
    stateHash: hash(state), codeVerifierEncrypted: encrypt(verifier), expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return { authorizationUrl: digiLockerProvider.authorizationUrl({ state, codeChallenge: challenge }) };
}

export async function complete(user, query) {
  const stateHash = hash(String(query.state || ''));
  const session = await VerificationProviderSession.findOne({ userId: user.id, stateHash, provider: 'digilocker' });
  if (!session || session.expiresAt <= new Date() || session.status !== 'initiated') throw error('DigiLocker session has expired. Please try again.', 'DIGILOCKER_SESSION_EXPIRED', 410);
  if (query.error) {
    session.status = 'cancelled'; session.completedAt = new Date(); await session.save();
    throw error('DigiLocker consent was cancelled. You can continue with manual verification.', 'DIGILOCKER_CONSENT_CANCELLED', 400);
  }
  if (!query.code) throw error('DigiLocker returned an invalid response.', 'DIGILOCKER_INVALID_RESPONSE', 400);
  session.status = 'processing'; await session.save();
  let accessToken;
  try {
    accessToken = await digiLockerProvider.exchangeCode(String(query.code), decrypt(session.codeVerifierEncrypted));
    const documents = await digiLockerProvider.fetchAuthorizedDocuments(accessToken);
    const seller = await supplierRepository.findExistingSeller(user.id);
    const existing = await supplierRepository.findExistingVerification(session.sellerId);
    const matches = buildMatches({ ...seller, authorizedPerson: existing?.stepData?.identity?.authorizedPerson }, documents);
    const alreadyApproved = ['approved', 'verified'].includes(String(existing?.status || seller?.verificationStatus || '').toLowerCase()) || seller?.isVerified === true;
    const status = alreadyApproved ? 'approved' : documents.length ? 'under_review' : (existing?.status || 'pending');
    const verification = await supplierRepository.upsertVerificationRecord(session.sellerId, user.id, {
      sellerId: session.sellerId, userId: user.id, status, verificationMethod: 'digilocker',
      digilocker: {
        status: documents.length ? 'processed' : 'document_unavailable', provider: 'digilocker',
        verifiedAt: new Date(), consentedAt: new Date(),
        documents: documents.map(publicDocument), matches,
      },
    });
    await supplierRepository.updateSellerById(session.sellerId, { verificationStatus: status, isVerified: alreadyApproved, verificationBadge: alreadyApproved ? 'active' : 'inactive' });
    await supplierRepository.createAuditLog({
      verificationId: verification._id, sellerId: session.sellerId, actorId: user.id,
      action: 'digilocker_processed', fromStatus: existing?.status || 'pending', toStatus: status,
      metadata: { documentTypes: documents.map(item => item.type), matchSummary: summarizeMatches(matches) },
    });
    const Notification = (await import('../models/Notification.js')).default;
    await Notification.create({
      userId: user.id,
      notificationType: documents.length ? 'verification_under_review' : 'system_alert',
      title: documents.length ? 'DigiLocker documents processed' : 'No authorized DigiLocker documents found',
      description: documents.length
        ? `${documents.length} authorized document${documents.length === 1 ? '' : 's'} were added to your existing verification for admin review.`
        : 'No authorized documents were available. You can continue with manual verification.',
      data: { verificationId: verification._id, method: 'digilocker', documentCount: documents.length },
    });
    session.status = 'completed'; session.completedAt = new Date(); await session.save();
    return { verification, documents: documents.length, matches };
  } catch (next) {
    session.status = 'failed'; session.completedAt = new Date(); await session.save();
    throw safeProviderError(next);
  } finally {
    if (accessToken) await digiLockerProvider.revoke(accessToken);
  }
}

function buildMatches(seller, documents) {
  const matches = [];
  for (const document of documents) for (const [field, providerValue] of Object.entries(document.fields || {})) {
    const profileValue = field === 'authorizedPerson' ? document.fields.authorizedPerson : field === 'address' ? formatAddress(seller?.address) : seller?.[field];
    matches.push(match(field, profileValue, providerValue, document.type));
  }
  return matches;
}
function match(field, profileValue, providerValue, documentType) {
  const left = normalize(profileValue); const right = normalize(providerValue);
  const exact = Boolean(left && right && left === right);
  const partial = Boolean(!exact && left && right && (left.includes(right) || right.includes(left)));
  return { field, documentType, status: exact ? 'matched' : partial ? 'partial' : right ? 'mismatch' : 'unavailable', checkedAt: new Date() };
}
function publicDocument(document) { return { doctype: document.doctype, type: document.type, label: document.label, category: document.category, issuer: document.issuer, issuedAt: document.issuedAt, providerReferenceHash: document.providerReferenceHash, status: document.status, verifiedAt: document.verifiedAt }; }
function summarizeMatches(matches) { return { matched: matches.filter(item => item.status === 'matched').length, partial: matches.filter(item => item.status === 'partial').length, mismatch: matches.filter(item => item.status === 'mismatch').length, unavailable: matches.filter(item => item.status === 'unavailable').length }; }
function normalize(value) { return String(value || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function formatAddress(value = {}) { return [value.street, value.city, value.state, value.pincode, value.country].filter(Boolean).join(', '); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function key() { return crypto.createHash('sha256').update(config.authSecret).digest(); }
function encrypt(value) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`; }
function decrypt(value) { const [iv, tag, encrypted] = String(value).split('.'); const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url')); return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8'); }
function safeProviderError(next) { if (next.code?.startsWith('DIGILOCKER_')) return next; return error('DigiLocker verification is temporarily unavailable. You can continue with manual verification.', 'DIGILOCKER_PROVIDER_UNAVAILABLE', 502); }
function error(message, code, statusCode) { return Object.assign(new Error(message), { code, statusCode }); }
