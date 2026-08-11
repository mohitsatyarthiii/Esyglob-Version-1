import axios from 'axios';
import crypto from 'crypto';

const BASE_URL = 'https://digilocker.meripehchaan.gov.in/public';
const ALLOWED_INTERNAL_TYPES = new Set([
  'gst_certificate', 'pan_card', 'business_registration', 'incorporation_certificate',
  'import_export_code', 'msme_certificate', 'government_id', 'director_id', 'address_proof',
]);
const ALLOWED_MATCH_FIELDS = new Set(['companyName', 'panNumber', 'gstNumber', 'businessRegistrationNumber', 'importExportCode', 'authorizedPerson', 'address']);

export class DigiLockerProvider {
  constructor(http = axios) { this.http = http; }

  get clientId() { return String(process.env.DIGILOCKER_CLIENT_ID || '').trim(); }
  get clientSecret() { return String(process.env.DIGILOCKER_CLIENT_SECRET || '').trim(); }
  get redirectUri() { return String(process.env.DIGILOCKER_REDIRECT_URI || '').trim(); }
  get authorizedDocuments() { return parseAuthorizedDocuments(process.env.DIGILOCKER_AUTHORIZED_DOCUMENTS); }
  get configured() { return Boolean(this.clientId && this.clientSecret && this.redirectUri && this.authorizedDocuments.length); }

  capabilities() {
    return {
      provider: 'digilocker',
      configured: this.configured,
      documents: this.authorizedDocuments.map(({ doctype, type, label, category }) => ({ doctype, type, label, category })),
      reason: this.configured ? undefined : 'DigiLocker requester access is not configured for this environment.',
    };
  }

  authorizationUrl({ state, codeChallenge }) {
    this.assertConfigured();
    const url = new URL(`${BASE_URL}/oauth2/1/authorize`);
    url.search = new URLSearchParams({
      response_type: 'code', client_id: this.clientId, redirect_uri: this.redirectUri,
      state, code_challenge: codeChallenge, code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  async exchangeCode(code, codeVerifier) {
    this.assertConfigured();
    const body = new URLSearchParams({
      code, grant_type: 'authorization_code', client_id: this.clientId,
      client_secret: this.clientSecret, redirect_uri: this.redirectUri, code_verifier: codeVerifier,
    });
    const { data } = await this.http.post(`${BASE_URL}/oauth2/1/token`, body, {
      timeout: 15000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!data?.access_token) throw providerError('DigiLocker returned an invalid authentication response', 'DIGILOCKER_INVALID_RESPONSE');
    return data.access_token;
  }

  async fetchAuthorizedDocuments(accessToken) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const { data } = await this.http.get(`${BASE_URL}/oauth2/2/files/issued`, { timeout: 15000, headers });
    const issued = Array.isArray(data?.items) ? data.items : [];
    const allowed = new Map(this.authorizedDocuments.map(item => [item.doctype, item]));
    const selected = issued.filter(item => allowed.has(String(item.doctype || '').toUpperCase()));
    const normalized = [];
    for (const item of selected) {
      const policy = allowed.get(String(item.doctype).toUpperCase());
      let certificate = {};
      if (hasXml(item.mime)) {
        try { certificate = await this.fetchCertificateXml(accessToken, item.uri); }
        catch (error) { if (error.code === 'DIGILOCKER_INTEGRITY_FAILED') throw error; }
      }
      normalized.push(normalizeDocument(item, policy, certificate));
    }
    return normalized;
  }

  async fetchCertificateXml(accessToken, uri) {
    if (!uri) return {};
    const response = await this.http.get(`${BASE_URL}/oauth2/1/xml/${encodeURIComponent(uri)}`, {
      timeout: 15000, responseType: 'text', headers: { Authorization: `Bearer ${accessToken}` },
    });
    const raw = typeof response.data === 'string' ? response.data : String(response.data || '');
    const expected = String(response.headers?.hmac || '').trim();
    if (!expected || !verifyHmac(raw, expected, this.clientSecret)) throw providerError('DigiLocker document integrity validation failed', 'DIGILOCKER_INTEGRITY_FAILED');
    return parseCertificate(raw);
  }

  async revoke(accessToken) {
    if (!accessToken) return;
    const body = new URLSearchParams({ token: accessToken, token_type_hint: 'access_token' });
    await this.http.post(`${BASE_URL}/oauth2/1/revoke`, body, {
      timeout: 8000, auth: { username: this.clientId, password: this.clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => undefined);
  }

  assertConfigured() {
    if (!this.configured) throw providerError('DigiLocker verification is not configured', 'DIGILOCKER_NOT_CONFIGURED', 503);
  }
}

export function parseAuthorizedDocuments(raw) {
  if (!raw) return [];
  try {
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values.flatMap(item => {
      const doctype = String(item?.doctype || '').trim().toUpperCase();
      const type = String(item?.type || '').trim();
      if (!/^[A-Z0-9]{5}$/.test(doctype) || !ALLOWED_INTERNAL_TYPES.has(type)) return [];
      return [{
        doctype, type, label: String(item.label || type.replaceAll('_', ' ')).slice(0, 100),
        category: item.category === 'identity' ? 'identity' : 'business',
        matchFields: Array.isArray(item.matchFields) ? item.matchFields.filter(field => ALLOWED_MATCH_FIELDS.has(field)) : [],
      }];
    });
  } catch { return []; }
}

function normalizeDocument(item, policy, certificate) {
  const fields = {};
  for (const field of policy.matchFields) {
    if (field === 'companyName') fields[field] = certificate.organizationName || certificate.subjectName;
    else if (field === 'authorizedPerson') fields[field] = certificate.subjectName;
    else if (field === 'address') fields[field] = certificate.address;
    else fields[field] = certificate.number;
  }
  return {
    doctype: policy.doctype, type: policy.type, label: policy.label, category: policy.category,
    issuer: String(item.issuer || '').slice(0, 160), issuedAt: validDate(item.date),
    providerReferenceHash: crypto.createHash('sha256').update(String(item.uri || '')).digest('hex'),
    fields, verifiedAt: new Date(), status: 'verified',
  };
}

function parseCertificate(xml) {
  const certificate = attributes(firstTag(xml, 'Certificate'));
  const issuedTo = firstBlock(xml, 'IssuedTo');
  const person = attributes(firstTag(issuedTo, 'Person'));
  const organization = attributes(firstTag(issuedTo, 'Organization'));
  const address = attributes(firstTag(issuedTo, 'Address'));
  const pan = attributes(firstTag(xml, 'PAN'));
  return {
    number: pan.num || certificate.number || '', subjectName: person.name || organization.name || '',
    organizationName: organization.name || '',
    address: [address.house, address.line1, address.line2, address.locality, address.vtc, address.district, address.state, address.pin, address.country].filter(Boolean).join(', '),
  };
}
function firstTag(xml, name) { return String(xml).match(new RegExp(`<${name}\\b[^>]*>`, 'i'))?.[0] || ''; }
function firstBlock(xml, name) { return String(xml).match(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, 'i'))?.[0] || ''; }
function attributes(tag) { return Object.fromEntries([...String(tag).matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1], decodeXml(match[3])])); }
function decodeXml(value) { return String(value).replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>'); }
function hasXml(mime) { return (Array.isArray(mime) ? mime : [mime]).some(value => String(value).toLowerCase().includes('xml')); }
function validDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : undefined; }
function verifyHmac(body, expected, secret) {
  const actual = crypto.createHmac('sha256', secret).update(body).digest('base64');
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function providerError(message, code, statusCode = 502) { return Object.assign(new Error(message), { code, statusCode }); }

export const digiLockerProvider = new DigiLockerProvider();
