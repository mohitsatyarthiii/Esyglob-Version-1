import crypto from 'crypto';
import { connectToDatabase, closeDatabase } from '../src/config/database.js';
import { connectToAIKnowledgeDatabase, closeAIKnowledgeDatabase } from '../src/config/knowledge-database.js';
import MarketResearchService from '../src/services/market-research.service.js';
import MarketReportStorageService from '../src/services/market-report-storage.service.js';
import SavedResearchReport from '../src/models/SavedResearchReport.js';
import User from '../src/models/User.js';
import Subscription from '../src/models/Subscription.js';
import AIUsage from '../src/models/AIUsage.js';
import { getKnowledgeChunkModel } from '../src/models/KnowledgeChunk.js';
import { createToken } from '../src/lib/crypto.js';
import pdf from 'pdf-parse/lib/pdf-parse.js';

const API_ORIGIN = String(process.env.MARKET_INSIGHTS_VALIDATION_API_URL || 'http://127.0.0.1:5000/api').replace(/\/$/, '');
const samples = [
  {
    query: 'India Textile Industry Market Analysis',
    productName: 'Textiles',
    country: 'India',
    expectedSource: 'India Textile Industry Report 2025',
    evidenceMarker: '8.21',
  },
  {
    query: 'UAE Steel Market Opportunity Analysis',
    productName: 'Steel',
    country: 'United Arab Emirates',
    expectedSource: 'UAE Steel Market Report 2025',
    evidenceMarker: '3.7',
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, token, options = {}) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...options,
    headers: {
      Accept: options.accept || 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  return response;
}

async function verifyPdfResponse(response, disposition) {
  assert(response.ok, `PDF request failed with ${response.status}`);
  assert(String(response.headers.get('content-type')).includes('application/pdf'), 'PDF MIME type is incorrect');
  if (disposition) assert(String(response.headers.get('content-disposition')).startsWith(disposition), `Expected ${disposition} PDF disposition`);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert(buffer.length > 1000, 'PDF response is unexpectedly small');
  assert(buffer.subarray(0, 4).toString() === '%PDF', 'Response is not a valid PDF file');
  return buffer.length;
}

async function main() {
  await connectToDatabase();
  await connectToAIKnowledgeDatabase();
  const KnowledgeChunk = getKnowledgeChunkModel();
  const seededVectorChunks = await KnowledgeChunk.countDocuments({
    'metadata.folderPath': /^market-insights\//,
    embedding: { $exists: true, $ne: [] },
  });
  assert(seededVectorChunks >= 4, 'Seeded knowledge reports do not have persistent vector embeddings');
  const email = `market-insights-validation-${Date.now()}-${crypto.randomBytes(3).toString('hex')}@example.invalid`;
  const user = await User.create({
    email,
    passwordHash: 'validation-only-not-a-login-credential',
    firstName: 'Market',
    lastName: 'Validator',
    roles: ['buyer'],
    primaryRole: 'buyer',
    isActive: true,
  });
  const token = createToken(user._id);
  await Subscription.create({
    userId: user._id,
    userType: 'buyer',
    isActive: true,
    status: 'active',
    planKey: 'buyer_starter',
    buyerPlan: 'buyer_starter',
  });
  const generatedIds = [];
  const checks = [];

  try {
    for (const sample of samples) {
      const result = await MarketResearchService.run({
        userId: user._id,
        session: user.toObject(),
        query: sample.query,
        productName: sample.productName,
        country: sample.country,
        mode: 'product_rd',
        force: true,
      }, () => {});
      generatedIds.push(result.savedReportId);
      const row = await SavedResearchReport.findById(result.savedReportId).select('+storageKey').lean();
      assert(row, `${sample.query}: MongoDB metadata was not saved`);
      assert(row.pdfStatus === 'ready', `${sample.query}: PDF status is not ready`);
      assert(row.previewUrl && row.downloadUrl, `${sample.query}: delivery URLs are missing`);
      assert(row.storageProvider === 'filesystem' && row.storageKey, `${sample.query}: storage metadata is incomplete`);
      assert(row.fileSize > 1000, `${sample.query}: stored file size is invalid`);
      const knowledgeMetric = row.reportData?.keyMetrics?.find(metric => metric.label === 'Knowledge sources');
      assert(Number(knowledgeMetric?.value) > 0, `${sample.query}: AI Knowledge Database did not contribute evidence`);
      assert(row.reportData?.pdfValidation?.passed === true, `${sample.query}: PDF quality validation did not pass`);
      assert(row.reportData?.sources?.some(source => source.name === sample.expectedSource), `${sample.query}: expected folder-aware source was not cited`);
      const serializedReport = JSON.stringify(row.reportData);
      assert(serializedReport.includes(sample.evidenceMarker), `${sample.query}: seeded evidence did not influence the report`);
      assert(!serializedReport.includes('Leading import markets — macro trade context'), `${sample.query}: unrelated generic macro table was included`);
      assert(row.reportData?.sections?.some(section => section.tables?.some(table => table.source === sample.expectedSource)), `${sample.query}: dynamic source table was not generated`);
      assert(await MarketReportStorageService.exists(row.storageKey), `${sample.query}: physical PDF file does not exist`);
      const stored = await MarketReportStorageService.read(row.storageKey);
      assert(stored.subarray(0, 4).toString() === '%PDF', `${sample.query}: physical file is not a PDF`);
      const parsedPdf = await pdf(stored);
      assert(parsedPdf.text.includes(sample.evidenceMarker), `${sample.query}: seeded evidence is missing from the rendered PDF`);
      checks.push({ query: sample.query, id: result.savedReportId, bytes: stored.length, storageKey: row.storageKey });
    }

    const firstList = await api('/market-insights/reports?page=1&limit=12', token);
    assert(firstList.ok, `Report list failed with ${firstList.status}`);
    const firstPayload = await firstList.json();
    assert(firstPayload.reports?.length === 2, 'Both sample reports did not appear in report history');

    const refreshedList = await api('/market-insights/reports?page=1&limit=12', token);
    const refreshedPayload = await refreshedList.json();
    assert(refreshedPayload.reports?.length === 2, 'Reports did not survive a refreshed history request');

    for (const id of generatedIds) {
      await verifyPdfResponse(await api(`/market-insights/reports/${id}/pdf`, token, { accept: 'application/pdf' }), 'inline');
      await verifyPdfResponse(await api(`/market-insights/reports/${id}/pdf?download=1`, token, { accept: 'application/pdf' }), 'attachment');
      const shareResponse = await api(`/market-insights/reports/${id}/share`, token, { method: 'POST' });
      assert(shareResponse.ok, `Share link creation failed with ${shareResponse.status}`);
      const { shareUrl } = await shareResponse.json();
      const sharedPath = new URL(shareUrl).pathname.replace(/^\/api/, '');
      await verifyPdfResponse(await fetch(`${API_ORIGIN}${sharedPath}`, { headers: { Accept: 'application/pdf' } }), 'inline');
    }

    const regenerateResponse = await api(`/market-insights/reports/${generatedIds[0]}/regenerate`, token, { method: 'POST' });
    if (!regenerateResponse.ok) throw new Error(`Regenerate failed with ${regenerateResponse.status}: ${await regenerateResponse.text()}`);
    const regeneratedPayload = await regenerateResponse.json();
    const regeneratedId = regeneratedPayload.report?.savedReportId;
    assert(regeneratedId && regeneratedId !== generatedIds[0], 'Regenerate did not create a new persistent report');
    generatedIds.push(regeneratedId);
    const regeneratedRow = await SavedResearchReport.findById(regeneratedId).select('+storageKey').lean();
    assert(regeneratedRow?.pdfStatus === 'ready', 'Regenerated report metadata is not ready');
    assert(await MarketReportStorageService.exists(regeneratedRow.storageKey), 'Regenerated PDF file does not exist');

    for (const id of generatedIds) {
      const row = await SavedResearchReport.findById(id).select('+storageKey').lean();
      const deleteResponse = await api(`/market-insights/reports/${id}`, token, { method: 'DELETE' });
      assert(deleteResponse.ok, `Delete failed with ${deleteResponse.status}`);
      assert(!await SavedResearchReport.exists({ _id: id }), 'MongoDB report record still exists after deletion');
      assert(!await MarketReportStorageService.exists(row.storageKey), 'Physical PDF still exists after deletion');
    }

    const emptyList = await api('/market-insights/reports?page=1&limit=12', token);
    const emptyPayload = await emptyList.json();
    assert(emptyPayload.reports?.length === 0, 'Deleted reports still appear in report history');

    console.log(JSON.stringify({
      success: true,
      samples: checks,
      verified: ['generation', 'physical-storage', 'mongodb-metadata', 'history', 'refresh', 'preview', 'download', 'share', 'regenerate', 'delete'],
    }, null, 2));
  } finally {
    const leftovers = await SavedResearchReport.find({ userId: user._id }).select('+storageKey').lean();
    await Promise.all(leftovers.map(row => MarketReportStorageService.remove(row.storageKey)));
    await Promise.all([
      SavedResearchReport.deleteMany({ userId: user._id }),
      Subscription.deleteMany({ userId: user._id }),
      AIUsage.deleteMany({ userId: user._id }),
      User.deleteOne({ _id: user._id }),
    ]);
    await Promise.all([closeDatabase(), closeAIKnowledgeDatabase()]);
  }
}

main().catch(async error => {
  console.error(error);
  await Promise.all([closeDatabase().catch(() => undefined), closeAIKnowledgeDatabase().catch(() => undefined)]);
  process.exitCode = 1;
});
