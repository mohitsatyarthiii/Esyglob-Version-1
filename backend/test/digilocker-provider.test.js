import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { DigiLockerProvider, parseAuthorizedDocuments } from '../src/lib/verification-providers/digilocker.provider.js';

const original = {
  id: process.env.DIGILOCKER_CLIENT_ID,
  secret: process.env.DIGILOCKER_CLIENT_SECRET,
  redirect: process.env.DIGILOCKER_REDIRECT_URI,
  documents: process.env.DIGILOCKER_AUTHORIZED_DOCUMENTS,
};

function configure() {
  process.env.DIGILOCKER_CLIENT_ID = 'requester-id';
  process.env.DIGILOCKER_CLIENT_SECRET = 'requester-secret';
  process.env.DIGILOCKER_REDIRECT_URI = 'https://example.test/api/suppliers/verification/digilocker/callback';
  process.env.DIGILOCKER_AUTHORIZED_DOCUMENTS = JSON.stringify([
    { doctype: 'PANCR', type: 'pan_card', label: 'PAN record', category: 'business', matchFields: ['panNumber', 'companyName'] },
  ]);
}

test.after(() => {
  const values = {
    DIGILOCKER_CLIENT_ID: original.id, DIGILOCKER_CLIENT_SECRET: original.secret,
    DIGILOCKER_REDIRECT_URI: original.redirect, DIGILOCKER_AUTHORIZED_DOCUMENTS: original.documents,
  };
  for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value;
});

test('authorized document configuration rejects unsupported or malformed document declarations', () => {
  const parsed = parseAuthorizedDocuments(JSON.stringify([
    { doctype: 'PANCR', type: 'pan_card', matchFields: ['panNumber', 'unknown'] },
    { doctype: 'TOO-LONG', type: 'pan_card' },
    { doctype: 'GSTCR', type: 'invented_document' },
  ]));
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].matchFields, ['panNumber']);
});

test('authorization uses official OAuth code flow with PKCE and never exposes the client secret', () => {
  configure();
  const provider = new DigiLockerProvider();
  const value = provider.authorizationUrl({ state: 'csrf-state', codeChallenge: 'pkce-challenge' });
  const url = new URL(value);
  assert.equal(url.origin, 'https://digilocker.meripehchaan.gov.in');
  assert.equal(url.pathname, '/public/oauth2/1/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.has('client_secret'), false);
});

test('issued-document processing filters by account authorization and verifies XML integrity', async () => {
  configure();
  const xml = '<Certificate name="PAN Card" type="PANCR" number="ABCDE1234F"><IssuedTo><Organization name="Acme Exports"><Address line1="1 Trade Road" vtc="Mumbai" state="Maharashtra" pin="400001" country="IN" /></Organization></IssuedTo><CertificateData><PAN num="ABCDE1234F" /></CertificateData></Certificate>';
  const http = { get: async url => {
    if (url.endsWith('/files/issued')) return { data: { items: [
      { doctype: 'PANCR', uri: 'issuer-PANCR-sensitive', issuer: 'Income Tax Department', mime: ['application/pdf', 'application/xml'] },
      { doctype: 'HSCER', uri: 'issuer-HSCER-sensitive', issuer: 'School Board', mime: ['application/xml'] },
    ] } };
    return { data: xml, headers: { hmac: crypto.createHmac('sha256', 'requester-secret').update(xml).digest('base64') } };
  } };
  const provider = new DigiLockerProvider(http);
  const documents = await provider.fetchAuthorizedDocuments('transient-access-token');
  assert.equal(documents.length, 1);
  assert.equal(documents[0].type, 'pan_card');
  assert.equal(documents[0].fields.panNumber, 'ABCDE1234F');
  assert.equal(documents[0].fields.companyName, 'Acme Exports');
  assert.equal(documents[0].providerReferenceHash.length, 64);
  assert.equal(JSON.stringify(documents).includes('issuer-PANCR-sensitive'), false);
});
