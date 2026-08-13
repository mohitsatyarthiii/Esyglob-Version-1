import crypto from 'node:crypto';
import FactoryProfile from '../models/FactoryProfile.js';
import Seller from '../models/Seller.js';
import SellerShippingSetup from '../models/SellerShippingSetup.js';
import User from '../models/User.js';
import { getServiceProvider } from '../lib/service-providers/index.js';

const PROVIDERS = ['delhivery', 'shiprocket'];

function clean(value) { return String(value || '').trim(); }
function validAddress(address) {
  return clean(address.line1).length >= 5 && clean(address.city).length >= 2
    && clean(address.state).length >= 2 && /^\d{6}$/.test(clean(address.postalCode))
    && clean(address.phone).replace(/\D/g, '').length >= 10 && /@/.test(clean(address.email));
}
function hashAddress(address) {
  return crypto.createHash('sha256').update(JSON.stringify([
    clean(address.line1).toLowerCase(), clean(address.line2).toLowerCase(), clean(address.city).toLowerCase(),
    clean(address.state).toLowerCase(), clean(address.postalCode), clean(address.countryCode).toUpperCase(),
  ])).digest('hex');
}
function publicError(error) {
  return { code: error.code || 'PROVIDER_PICKUP_SETUP_FAILED', message: error.publicMessage || 'Provider pickup registration failed', occurredAt: new Date() };
}
function readiness(providers, addressValid) {
  if (!addressValid) return 'invalid';
  const active = providers.filter(item => item.status === 'active').length;
  if (active === PROVIDERS.length) return 'ready';
  if (active) return 'partial';
  if (providers.some(item => item.status === 'failed')) return 'failed';
  return 'pending';
}
async function publishReadiness(setup) {
  await Seller.updateOne({ _id: setup.sellerId }, { $set: {
    shippingReadiness: setup.readiness,
    shippingReady: ['partial', 'ready'].includes(setup.readiness),
    shippingSetupUpdatedAt: new Date(),
  } });
}

export async function sellerPickup(sellerId) {
  const seller = await Seller.findById(sellerId).lean();
  if (!seller) throw Object.assign(new Error('Seller not found'), { statusCode: 404 });
  const [factory, user] = await Promise.all([
    FactoryProfile.findOne({ sellerId }).select('name address').lean(),
    User.findById(seller.userId).select('fullName phone email').lean(),
  ]);
  const sellerAddress = seller.address || {};
  const factoryAddress = factory?.address || {};
  const useFactory = Boolean(factoryAddress.street && factoryAddress.city && factoryAddress.state && factoryAddress.pincode);
  const source = useFactory ? factoryAddress : sellerAddress;
  return {
    seller,
    pickupSource: useFactory ? 'factory' : source?.city ? 'seller' : 'none',
    address: {
      contactName: clean(factory?.name || seller.companyName || user?.fullName || 'EsyGlob seller'),
      phone: clean(seller.businessPhone || user?.phone),
      email: clean(seller.businessEmail || user?.email),
      line1: clean(source.street || source.line1 || source.address),
      line2: clean(source.line2), city: clean(source.city), state: clean(source.state),
      postalCode: clean(source.pincode || source.postalCode), country: clean(source.country || 'India'), countryCode: 'IN',
    },
  };
}

export async function synchronizeSellerShippingSetup(sellerId, { register = false, providerKeys = PROVIDERS } = {}) {
  const { pickupSource, address } = await sellerPickup(sellerId);
  const addressValid = validAddress(address);
  const addressHash = hashAddress(address);
  let setup = await SellerShippingSetup.findOne({ sellerId });
  if (!setup) setup = new SellerShippingSetup({ sellerId, providers: PROVIDERS.map(providerKey => ({ providerKey })) });
  if (setup.addressHash && setup.addressHash !== addressHash) {
    setup.providers = PROVIDERS.map(providerKey => ({ providerKey, status: 'pending', addressHash }));
  }
  setup.pickupSource = pickupSource;
  setup.pickupAddress = address;
  setup.addressHash = addressHash;
  for (const providerKey of PROVIDERS) {
    if (!setup.providers.some(item => item.providerKey === providerKey)) setup.providers.push({ providerKey, status: 'pending' });
  }

  if (!addressValid) {
    setup.providers.forEach(item => { if (item.status !== 'disabled') item.status = 'pending'; item.addressHash = addressHash; });
    setup.readiness = 'invalid';
    setup.lastSynchronizedAt = new Date();
    await setup.save();
    await publishReadiness(setup);
    return setup;
  }

  for (const mapping of setup.providers) {
    if (!providerKeys.includes(mapping.providerKey) || mapping.status === 'disabled') continue;
    if (mapping.status === 'active' && mapping.addressHash === addressHash && mapping.locationName) continue;
    const adapter = getServiceProvider(mapping.providerKey);
    mapping.lastAttemptAt = new Date();
    mapping.retryCount = Number(mapping.retryCount || 0) + 1;
    mapping.addressHash = addressHash;
    try {
      const existing = await adapter.findPickupLocation?.(address, mapping);
      const resolved = existing || (register ? await adapter.registerPickup?.({ sellerId, address, mapping }) : null);
      if (resolved?.locationName) {
        mapping.status = 'active'; mapping.locationName = resolved.locationName; mapping.locationId = resolved.locationId;
        mapping.lastVerifiedAt = new Date(); mapping.error = undefined; mapping.metadata = resolved.metadata;
      } else {
        mapping.status = 'pending'; mapping.error = undefined;
      }
    } catch (error) {
      mapping.status = 'failed'; mapping.error = publicError(error);
    }
  }
  setup.readiness = readiness(setup.providers, addressValid);
  setup.lastSynchronizedAt = new Date();
  await setup.save();
  await publishReadiness(setup);
  return setup;
}

export async function activeProviderMappings(sellerId) {
  let setup = await SellerShippingSetup.findOne({ sellerId });
  if (!setup) setup = await synchronizeSellerShippingSetup(sellerId, { register: false });
  return Object.fromEntries(setup.providers
    .filter(item => item.status === 'active' && item.addressHash === setup.addressHash && item.locationName)
    .map(item => [item.providerKey, { id: item.locationId, name: item.locationName, mappingId: String(setup._id), addressHash: item.addressHash }]));
}

export async function getSellerShippingSetup(userId) {
  const seller = await Seller.findOne({ userId }).select('_id').lean();
  if (!seller) throw Object.assign(new Error('Seller profile not found'), { statusCode: 404 });
  return synchronizeSellerShippingSetup(seller._id, { register: false });
}

export async function listSellerShippingSetups(query = {}) {
  const filter = query.status && query.status !== 'all' ? { readiness: query.status } : {};
  return SellerShippingSetup.find(filter).populate('sellerId', 'companyName businessEmail businessPhone address').sort({ updatedAt: -1 }).limit(Math.min(Number(query.limit) || 100, 500)).lean();
}

export async function setProviderMapping(sellerId, providerKey, data = {}) {
  if (!PROVIDERS.includes(providerKey)) throw Object.assign(new Error('Unsupported shipping provider'), { statusCode: 422 });
  if (data.status && !['pending', 'active', 'failed', 'disabled'].includes(data.status)) throw Object.assign(new Error('Invalid provider mapping status'), { statusCode: 422 });
  const setup = await synchronizeSellerShippingSetup(sellerId, { register: false, providerKeys: [] });
  const mapping = setup.providers.find(item => item.providerKey === providerKey);
  mapping.status = data.status || mapping.status;
  mapping.locationName = clean(data.locationName || mapping.locationName);
  mapping.locationId = clean(data.locationId || mapping.locationId);
  if (mapping.status === 'active' && !mapping.locationName) throw Object.assign(new Error('An exact provider pickup location name is required before activation'), { statusCode: 422 });
  mapping.addressHash = setup.addressHash;
  mapping.lastVerifiedAt = mapping.status === 'active' ? new Date() : mapping.lastVerifiedAt;
  mapping.error = mapping.status === 'active' ? undefined : mapping.error;
  setup.readiness = readiness(setup.providers, validAddress(setup.pickupAddress || {}));
  await setup.save();
  await publishReadiness(setup);
  return setup;
}
