import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';

const execute = process.argv.includes('--execute');
const overrides = new Map(Object.entries({
  '6a6dcfcf18ac8b745179a7e7': { weight: '0.8 kg', dimensions: '25 x 20 x 8 cm' },
  '6a6de2c518ac8b745179a921': { weight: '1 kg', dimensions: '30 x 20 x 10 cm' },
  '6a6e18e503795705208a0979': { weight: '35 kg', dimensions: '110 x 95 x 90 cm' },
  '6a6e1a7518ac8b745179a989': { weight: '30 kg', dimensions: '210 x 110 x 35 cm' },
  '6a6e228503795705208a0a24': { weight: '5 kg', dimensions: '40 x 30 x 15 cm' },
  '6a6e242418ac8b745179a9c2': { weight: '10 kg', dimensions: '55 x 35 x 30 cm' },
  '6a6e412d03795705208a0a34': { weight: '1 kg', dimensions: '25 x 18 x 8 cm' },
  '6a6e42c318ac8b745179a9ce': { weight: '0.5 kg', dimensions: '20 x 12 x 8 cm' },
  '6a6e477e03795705208a0a50': { weight: '8 kg', dimensions: '82 x 52 x 15 cm' },
  '6a6e491903795705208a0a5e': { weight: '15 kg', dimensions: '60 x 45 x 40 cm' },
  '6a6e4f4818ac8b745179aaac': { weight: '0.5 kg', dimensions: '20 x 15 x 8 cm' },
  '6a7d6ea6b7a1d881ae6be789': { weight: '1 kg', dimensions: '35 x 28 x 8 cm' },
}));
const hsnById = new Map(Object.entries({
  '6a6dc52197b8c0719687bd03': '8471', '6a6dc8b4bd9e385e1dd08b2d': '8471', '6a6dcaaf97b8c0719687bd37': '8471',
  '6a6dcc91bd9e385e1dd08b38': '8518', '6a6dcfcf18ac8b745179a7e7': '8544',
  '6a6dd59a03795705208a086f': '6110', '6a6dd9f118ac8b745179a86c': '6204', '6a6ddb6f03795705208a087c': '6203', '6a6ddcf003795705208a0889': '6404',
  '6a6de15618ac8b745179a914': '2202', '6a6de2c518ac8b745179a921': '2106', '6a6dff9a18ac8b745179a930': '2004', '6a6e044403795705208a0903': '1905',
  '6a6e175e03795705208a0970': '9401', '6a6e18e503795705208a0979': '9401', '6a6e1a7518ac8b745179a989': '9403', '6a6e1c4618ac8b745179a995': '9403',
  '6a6e228503795705208a0a24': '1201', '6a6e242418ac8b745179a9c2': '8413', '6a6e412d03795705208a0a34': '3101', '6a6e42c318ac8b745179a9ce': '3808',
  '6a6e477e03795705208a0a50': '8528', '6a6e491903795705208a0a5e': '8518', '6a6e4c9903795705208a0a79': '8517', '6a6e4dff03795705208a0aa5': '8509', '6a6e4f4818ac8b745179aaac': '8518',
  '6a7d6ea6b7a1d881ae6be789': '6109',
}));

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const [sellers, factories, setups, products, users] = await Promise.all([
  db.collection('sellers').find({ isActive: { $ne: false } }).toArray(),
  db.collection('factoryprofiles').find({}).toArray(),
  db.collection('sellershippingsetups').find({}).toArray(),
  db.collection('products').find({ status: { $in: ['published', 'active'] } }).toArray(),
  db.collection('users').find({}).project({ phone: 1, email: 1 }).toArray(),
]);
const backup = { createdAt: new Date().toISOString(), sellers, factories, setups, products };
const backupPath = path.resolve('backups', `catalog-sample-shipping-${new Date().toISOString().replaceAll(':', '-')}.json`);

const factoryBySeller = new Map(factories.map(item => [String(item.sellerId), item]));
const setupBySeller = new Map(setups.map(item => [String(item.sellerId), item]));
const userById = new Map(users.map(item => [String(item._id), item]));
const sellerUpdates = [];
let linkedUserPhonesPrepared = 0;
for (const seller of sellers) {
  const setup = setupBySeller.get(String(seller._id));
  const manual = setup?.manualPickupAddress;
  const factory = factoryBySeller.get(String(seller._id));
  const source = manual?.postalCode ? {
    street: [manual.line1, manual.line2].filter(Boolean).join(', '), city: manual.city, state: manual.state,
    country: manual.country || 'India', pincode: manual.postalCode,
  } : factory?.address?.pincode ? factory.address : seller.address;
  if (!source || !Object.values(source).some(Boolean)) continue;
  const user = userById.get(String(seller.userId));
  if (!manual?.phone && !seller.businessPhone && user?.phone) linkedUserPhonesPrepared += 1;
  sellerUpdates.push({ sellerId: seller._id, address: {
    street: String(source.street || '').trim(), city: String(source.city || '').trim(), state: String(source.state || '').trim(),
    country: String(source.country || 'India').trim(), pincode: String(source.pincode || source.postalCode || '').trim(),
  }, businessPhone: manual?.phone || seller.businessPhone || user?.phone,
  businessEmail: manual?.email || seller.businessEmail || user?.email });
}

const productUpdates = products.flatMap(product => {
  const override = overrides.get(String(product._id));
  if (!override) return [];
  return [{ productId: product._id, packaging: {
    ...(product.packaging || {}), ...override, unitsPerPackage: Number(product.packaging?.unitsPerPackage || 1),
    shippingDataSource: 'catalog_inferred_sample', shippingDataReviewedAt: new Date(),
  } }];
});
const hsnUpdates = products.flatMap(product => {
  if (product.hsCodes?.some(item => item?.code)) return [];
  const code = hsnById.get(String(product._id));
  return code ? [{ productId: product._id, hsCodes: [{ code, source: 'ai_recommended', isPrimary: true }] }] : [];
});

if (execute) {
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));
  if (sellerUpdates.length) await db.collection('sellers').bulkWrite(sellerUpdates.map(item => ({ updateOne: { filter: { _id: item.sellerId }, update: { $set: { address: item.address, businessPhone: item.businessPhone, businessEmail: item.businessEmail } } } })));
  if (productUpdates.length) await db.collection('products').bulkWrite(productUpdates.map(item => ({ updateOne: { filter: { _id: item.productId }, update: { $set: { packaging: item.packaging } } } })));
  if (hsnUpdates.length) await db.collection('products').bulkWrite(hsnUpdates.map(item => ({ updateOne: { filter: { _id: item.productId }, update: { $set: { hsCodes: item.hsCodes } } } })));
}

console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', backupPath: execute ? backupPath : null, sellersFound: sellers.length, sellerAddressesPrepared: sellerUpdates.length, linkedUserPhonesPrepared, productsFound: products.length, productPackagesPrepared: productUpdates.length, recommendedHsnPrepared: hsnUpdates.length }, null, 2));
await mongoose.disconnect();
