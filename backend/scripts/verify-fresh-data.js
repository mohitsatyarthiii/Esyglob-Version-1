import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectToDatabase, closeDatabase } from '../src/config/database.js';
import app from '../src/app.js';

const REPORT_DIR = path.resolve(new URL('../../qa-artifacts/data-cleanup/', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, value => value.slice(1)));

async function referenceAudit() {
  const issues = [];
  for (const model of Object.values(mongoose.models)) {
    for (const [schemaPath, schemaType] of Object.entries(model.schema.paths)) {
      const ref = schemaType.options?.ref || schemaType.caster?.options?.ref || schemaType.$embeddedSchemaType?.options?.ref;
      if (!ref || typeof ref !== 'string' || !mongoose.models[ref]) continue;
      const values = (await model.distinct(schemaPath)).filter(value => value && mongoose.isObjectIdOrHexString(value));
      if (!values.length) continue;
      const existing = new Set((await mongoose.models[ref].find({ _id: { $in: values } }).select('_id').lean()).map(row => String(row._id)));
      const missing = values.map(String).filter(value => !existing.has(value));
      if (missing.length) issues.push({ model: model.modelName, collection: model.collection.name, path: schemaPath, ref, missing });
    }
  }
  return issues;
}

await connectToDatabase();
const db = mongoose.connection.db;
let server;
try {
  const category = await db.collection('categories').findOne({ $or: [{ name: /sports(?:wear)?\s*(?:&|and)?\s*outdoor\s*apparel/i }, { slug: /sports(?:wear)?-and-outdoor-apparel/i }] });
  const counts = {
    sellerUsers: await db.collection('users').countDocuments({ roles: 'seller' }),
    adminUsers: await db.collection('users').countDocuments({ roles: 'admin' }),
    buyerUsers: await db.collection('users').countDocuments({ roles: 'buyer' }),
    sellers: await db.collection('sellers').countDocuments(), products: await db.collection('products').countDocuments(),
    sellerVerifications: await db.collection('sellerverifications').countDocuments(), supplierVerifications: await db.collection('supplierverifications').countDocuments(),
    categories: await db.collection('categories').countDocuments(), subcategories: await db.collection('subcategories').countDocuments(),
    sportsSubcategories: category ? await db.collection('subcategories').countDocuments({ categoryId: category._id }) : null,
  };
  const foreignKeyIssues = await referenceAudit();
  const duplicateIndexes = [];
  for (const { name } of await db.listCollections().toArray()) {
    const indexes = await db.collection(name).listIndexes().toArray().catch(() => []);
    const seen = new Map();
    for (const index of indexes) {
      const signature = JSON.stringify({ key: index.key, unique: Boolean(index.unique), sparse: Boolean(index.sparse), partialFilterExpression: index.partialFilterExpression || null });
      if (seen.has(signature)) duplicateIndexes.push({ collection: name, indexes: [seen.get(signature), index.name] });
      else seen.set(signature, index.name);
    }
  }
  const searchIndexes = await db.collection('products').listSearchIndexes().toArray().catch(error => [{ unavailable: error.message }]);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const port = server.address().port;
  const requests = [
    ['/api/health', 200], ['/api/categories?includeCounts=true&activeOnly=false', 200],
    [`/api/categories/${category.slug}`, 200], ['/api/products?limit=12', 200], ['/api/suppliers?limit=12', 200],
    ['/api/search?q=sports', 200], ['/api/marketplace/statistics', 200], ['/api/admin/overview', 401],
  ];
  const endpoints = [];
  for (const [url, expected] of requests) {
    const response = await fetch(`http://127.0.0.1:${port}${url}`, { headers: { 'cache-control': 'no-cache' } });
    let body; try { body = await response.json(); } catch { body = null; }
    endpoints.push({ url, status: response.status, expected, passed: response.status === expected, responseKeys: body && typeof body === 'object' ? Object.keys(body) : [] });
  }
  const report = {
    status: counts.sellerUsers === 0 && counts.sellers === 0 && counts.products === 0 && counts.sellerVerifications === 0 && counts.supplierVerifications === 0 && counts.sportsSubcategories === 0 && !foreignKeyIssues.length && !duplicateIndexes.length && endpoints.every(item => item.passed) ? 'passed' : 'failed',
    verifiedAt: new Date().toISOString(), database: db.databaseName, counts, category: category && { _id: category._id, name: category.name, slug: category.slug },
    foreignKeyIssues, duplicateIndexes, searchIndexes, endpoints,
  };
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORT_DIR, 'verification-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'passed') process.exitCode = 1;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await closeDatabase();
}
