import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const runId = `media-integrity-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, value => value.slice(1)));
const artifactRoot = path.join(projectRoot, 'qa-artifacts', 'media-integrity');
const runtimeRoot = path.join(artifactRoot, runId);
process.env.VPS_STORAGE_ROOT = runtimeRoot;
process.env.STORAGE_PUBLIC_BASE_URL = 'http://127.0.0.1/storage';

const evidence = { runId, startedAt: new Date().toISOString(), checks: [], entities: {} };
let server;
let databaseConnected = false;
const created = {};
const uploads = {};

function check(name, details = {}) {
  evidence.checks.push({ name, passed: true, at: new Date().toISOString(), ...details });
}

async function fileHash(filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}

try {
  const [
    { connectToDatabase, closeDatabase },
    { default: StorageService },
    { default: Category },
    { default: Subcategory },
    { default: Product },
    { default: User },
    { default: Seller },
    { default: FactoryProfile },
    { default: ProfileService },
    supplierRepository,
    { factorySchema },
    { updateResource },
    { default: ProductService },
    { invalidateMemoryCache },
    { getCategories },
    { default: app },
  ] = await Promise.all([
    import('../src/config/database.js'),
    import('../src/services/storage.service.js'),
    import('../src/models/Category.js'),
    import('../src/models/Subcategory.js'),
    import('../src/models/Product.js'),
    import('../src/models/User.js'),
    import('../src/models/Seller.js'),
    import('../src/models/FactoryProfile.js'),
    import('../src/services/profile.service.js'),
    import('../src/repositories/supplier.repository.js'),
    import('../src/validators/supplier.validator.js'),
    import('../src/repositories/admin.repository.js'),
    import('../src/services/product.service.js'),
    import('../src/lib/cache.js'),
    import('../src/services/category.service.js'),
    import('../src/app.js'),
  ]);

  await fs.mkdir(artifactRoot, { recursive: true });
  await StorageService.ensureFoldersExist();
  await connectToDatabase();
  databaseConnected = true;

  const colors = { category: '#1d4ed8', product: '#ea580c', profile: '#059669', seller: '#7c3aed', factory: '#be123c' };
  const folders = { category: 'categories', product: 'products', profile: 'profiles', seller: 'seller-logos', factory: 'manufacturers' };
  for (const [entity, color] of Object.entries(colors)) {
    const source = await sharp({ create: { width: 720, height: 480, channels: 3, background: color } }).png().toBuffer();
    const folder = folders[entity];
    uploads[entity] = await StorageService.uploadImage({ buffer: source, mimeType: 'image/png', folder: `${folder}/${runId}`, originalName: `${entity}.png` });
  }
  assert.equal(new Set(Object.values(uploads).map(item => item.storageKey)).size, 5);
  check('five unique uploads created with optimized variants');

  created.user = await User.create({
    email: `${runId}@example.invalid`, passwordHash: 'integrity-test-not-a-login', fullName: 'Media Integrity Profile',
    roles: ['buyer', 'seller'], primaryRole: 'seller', avatarUrl: uploads.profile.url,
  });
  created.seller = await Seller.create({
    userId: created.user._id, companyName: `Integrity Seller ${runId}`, companyType: 'manufacturer',
    companyLogo: uploads.seller.url, logoUrl: uploads.seller.url,
    certifications: [{ name: 'Integrity Certificate', documentUrl: uploads.factory.url }],
  });
  created.category = await Category.create({ name: `Integrity Category ${runId}`, slug: runId, description: 'initial', image: uploads.category.url });
  created.subcategory = await Subcategory.create({ categoryId: created.category._id, name: `Integrity Subcategory ${runId}`, slug: runId, image: uploads.category.url });
  created.product = await Product.create({
    userId: created.user._id, sellerId: created.seller._id, categoryId: created.category._id, subcategoryId: created.subcategory._id,
    name: `Integrity Product ${runId}`, category: created.category.name, subcategory: created.subcategory.name,
    price: 100, minimumOrderQuantity: 1, images: [uploads.product.url], status: 'draft',
  });
  created.factory = await FactoryProfile.create({ sellerId: created.seller._id, name: 'Integrity Factory', images: [uploads.factory.url] });

  const expected = {
    category: uploads.category.url,
    subcategory: uploads.category.url,
    product: uploads.product.url,
    profile: uploads.profile.url,
    seller: uploads.seller.url,
    factory: uploads.factory.url,
    certificate: uploads.factory.url,
  };
  const initialHashes = {};
  for (const [entity, upload] of Object.entries(uploads)) {
    initialHashes[entity] = {};
    for (const [variantName, variant] of Object.entries(upload.variants)) {
      const absolute = path.join(runtimeRoot, ...variant.storageKey.split('/'));
      initialHashes[entity][variantName] = await fileHash(absolute);
      assert.equal(initialHashes[entity][variantName], variant.checksum);
    }
  }

  async function verify(stage) {
    const [category, subcategory, product, user, seller, factory] = await Promise.all([
      Category.findById(created.category._id).lean(), Subcategory.findById(created.subcategory._id).lean(),
      Product.findById(created.product._id).lean(), User.findById(created.user._id).lean(),
      Seller.findById(created.seller._id).lean(), FactoryProfile.findById(created.factory._id).lean(),
    ]);
    assert.equal(category.image, expected.category);
    assert.equal(subcategory.image, expected.subcategory);
    assert.deepEqual(product.images, [expected.product]);
    assert.equal(user.avatarUrl, expected.profile);
    assert.equal(seller.companyLogo, expected.seller);
    assert.equal(seller.logoUrl, expected.seller);
    assert.equal(seller.certifications[0].documentUrl, expected.certificate);
    assert.deepEqual(factory.images, [expected.factory]);
    for (const [entity, upload] of Object.entries(uploads)) {
      for (const [variantName, variant] of Object.entries(upload.variants)) {
        const absolute = path.join(runtimeRoot, ...variant.storageKey.split('/'));
        assert.equal(await fileHash(absolute), initialHashes[entity][variantName]);
      }
    }
    check(stage, { databaseReferences: 8, physicalVariants: 15 });
  }

  await verify('create');
  await updateResource('categories', created.category._id, { name: `Renamed ${runId}` });
  await ProductService.updateProduct(created.user._id, created.product._id, { description: 'description edit' });
  await ProfileService.updateProfile(created.user._id, ['buyer', 'seller'], {
    fullName: 'Media Integrity Renamed', email: created.user.email, phone: '0000000000', companyName: created.seller.companyName,
  });
  await supplierRepository.upsertSellerOnboarding(created.user._id, { companyDescription: 'unrelated seller edit' }, 'pending');
  await supplierRepository.upsertFactoryDraft(created.seller._id, factorySchema.parse({ description: 'unrelated factory edit' }), 'draft');
  await verify('edit name and description without media payloads');

  await Promise.all([
    Category.findByIdAndUpdate(created.category._id, { $set: { isActive: false } }),
    Subcategory.findByIdAndUpdate(created.subcategory._id, { $set: { isActive: false } }),
    Seller.findByIdAndUpdate(created.seller._id, { $set: { isActive: false } }),
  ]);
  await verify('deactivate');
  await Promise.all([
    Category.findByIdAndUpdate(created.category._id, { $set: { isActive: true } }),
    Subcategory.findByIdAndUpdate(created.subcategory._id, { $set: { isActive: true } }),
    Seller.findByIdAndUpdate(created.seller._id, { $set: { isActive: true } }),
  ]);
  await verify('activate');

  await Category.findByIdAndUpdate(created.category._id, { $set: { image: null, description: 'null media guard' } });
  await Seller.findByIdAndUpdate(created.seller._id, { $set: { companyLogo: undefined, companyDescription: 'undefined media guard' } });
  await verify('null and undefined media assignments are ignored');

  await Product.findByIdAndUpdate(created.product._id, { $unset: { warranty: 1 } });
  await Category.findByIdAndUpdate(created.category._id, { $unset: { description: 1 } });
  await verify('delete unrelated fields');

  for (let index = 0; index < 5; index += 1) {
    await Promise.all([
      Category.findByIdAndUpdate(created.category._id, { $set: { description: `edit-${index}` } }),
      Product.findByIdAndUpdate(created.product._id, { $set: { description: `edit-${index}` } }),
      User.findByIdAndUpdate(created.user._id, { $set: { phone: `000000000${index}` } }),
      Seller.findByIdAndUpdate(created.seller._id, { $set: { businessPhone: `000000000${index}` } }),
    ]);
  }
  await Promise.all([
    Category.bulkWrite([{ updateOne: { filter: { _id: created.category._id }, update: { $set: { description: 'bulk edit' } } } }]),
    Product.bulkWrite([{ updateOne: { filter: { _id: created.product._id }, update: { $set: { description: 'bulk edit' } } } }]),
    User.bulkWrite([{ updateOne: { filter: { _id: created.user._id }, update: { $set: { phone: '1111111111' } } } }]),
    Seller.bulkWrite([{ updateOne: { filter: { _id: created.seller._id }, update: { $set: { businessPhone: '1111111111' } } } }]),
  ]);
  await verify('multiple consecutive and bulk updates');

  await getCategories({ activeOnly: false });
  invalidateMemoryCache('categories:');
  invalidateMemoryCache('category:');
  await getCategories({ activeOnly: false });
  await verify('cache clear and refetch');

  await closeDatabase();
  databaseConnected = false;
  await connectToDatabase();
  databaseConnected = true;
  await verify('backend database reconnect');

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const port = server.address().port;
  for (const userAgent of ['IntegrityBrowser-A', 'IntegrityBrowser-B']) {
    for (const upload of Object.values(uploads)) {
      const response = await fetch(`http://127.0.0.1:${port}/storage/${upload.storageKey}`, { headers: { 'user-agent': userAgent, 'cache-control': 'no-cache' } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/webp');
    }
  }
  check('two independent HTTP sessions render every original image', { requests: 10 });

  const allFiles = await fs.readdir(runtimeRoot, { recursive: true, withFileTypes: true });
  assert.equal(allFiles.filter(item => item.isFile()).length, 15);
  check('no missing, duplicate, or orphan variants before explicit cleanup', { expectedFiles: 15, actualFiles: 15 });

  evidence.entities = Object.fromEntries(Object.entries(uploads).map(([key, value]) => [key, {
    storageKey: value.storageKey, checksum: value.checksum, variants: Object.keys(value.variants),
  }]));
  evidence.status = 'passed';
} catch (error) {
  evidence.status = 'failed';
  evidence.error = { message: error.message, stack: error.stack };
  throw error;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  try {
    const [{ default: Category }, { default: Subcategory }, { default: Product }, { default: User }, { default: Seller }, { default: FactoryProfile }] = await Promise.all([
      import('../src/models/Category.js'), import('../src/models/Subcategory.js'), import('../src/models/Product.js'),
      import('../src/models/User.js'), import('../src/models/Seller.js'), import('../src/models/FactoryProfile.js'),
    ]);
    if (databaseConnected) {
      await Promise.all([
        created.product?._id && Product.deleteOne({ _id: created.product._id }),
        created.factory?._id && FactoryProfile.deleteOne({ _id: created.factory._id }),
        created.subcategory?._id && Subcategory.deleteOne({ _id: created.subcategory._id }),
        created.category?._id && Category.deleteOne({ _id: created.category._id }),
        created.seller?._id && Seller.deleteOne({ _id: created.seller._id }),
        created.user?._id && User.deleteOne({ _id: created.user._id }),
      ].filter(Boolean));
      const { closeDatabase } = await import('../src/config/database.js');
      await closeDatabase();
    }
  } finally {
    await fs.rm(runtimeRoot, { recursive: true, force: true });
    evidence.finishedAt = new Date().toISOString();
    evidence.testArtifactsRemoved = true;
    await fs.mkdir(artifactRoot, { recursive: true });
    await fs.writeFile(path.join(artifactRoot, 'latest-report.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence, null, 2));
  }
}
