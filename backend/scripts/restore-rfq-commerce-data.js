import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import 'dotenv/config';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function main() {
  const backupDir = argument('--backup');
  const targetDatabase = argument('--target-db');
  const execute = process.argv.includes('--execute');
  if (!backupDir) throw new Error('--backup <directory> is required');

  const resolved = path.resolve(backupDir);
  const manifestBody = await fs.readFile(path.join(resolved, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestBody);
  if (manifest.format !== 'esyglob-rfq-commerce-backup-v1') throw new Error('Unsupported backup format');

  const payloads = {};
  for (const [collection, metadata] of Object.entries(manifest.files)) {
    const body = await fs.readFile(path.join(resolved, metadata.file), 'utf8');
    if (sha256(body) !== metadata.sha256) throw new Error(`Checksum failed for ${metadata.file}`);
    const lines = body.split(/\r?\n/).filter(Boolean);
    if (lines.length !== metadata.count) throw new Error(`Document count failed for ${metadata.file}`);
    payloads[collection] = lines.map((line) => EJSON.parse(line, { relaxed: false }));
  }

  const summary = Object.fromEntries(Object.entries(payloads).map(([name, documents]) => [name, documents.length]));
  if (!execute) {
    console.log(JSON.stringify({ verified: true, mode: 'verification-only', sourceDatabase: manifest.sourceDatabase, collections: summary }, null, 2));
    return;
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  if (!targetDatabase) throw new Error('--target-db <new-database-name> is required with --execute');
  if (targetDatabase === manifest.sourceDatabase) throw new Error('Refusing to restore into the source database');

  await mongoose.connect(process.env.MONGODB_URI, { dbName: targetDatabase, serverSelectionTimeoutMS: 20_000 });
  const db = mongoose.connection.db;
  const nonEmpty = [];
  for (const name of Object.keys(payloads)) {
    if (await db.collection(name).estimatedDocumentCount()) nonEmpty.push(name);
  }
  if (nonEmpty.length) throw new Error(`Target collections are not empty: ${nonEmpty.join(', ')}`);

  for (const [name, documents] of Object.entries(payloads)) {
    if (documents.length) await db.collection(name).insertMany(documents, { ordered: true });
  }
  console.log(JSON.stringify({ restored: true, targetDatabase, collections: summary }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
