import crypto from 'node:crypto';
import FactoryProfile from '../models/FactoryProfile.js';
import Seller from '../models/Seller.js';
import SellerShippingSetup from '../models/SellerShippingSetup.js';
import User from '../models/User.js';
import { getServiceProvider } from '../lib/service-providers/index.js';

const PROVIDERS = ['delhivery', 'shiprocket'];

function clean(value) { return String(value || '').trim(); }
function normalizeIndianPhone(value) {
  const digits = clean(value).replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}
export function normalizePickupAddress(address = {}) {
  const latitude = Number(address.latitude);
  const longitude = Number(address.longitude);
  return {
    contactName: clean(address.contactName),
    phone: normalizeIndianPhone(address.phone),
    email: clean(address.email).toLowerCase(),
    line1: clean(address.line1),
    line2: clean(address.line2),
    city: clean(address.city),
    state: clean(address.state),
    postalCode: clean(address.postalCode),
    country: clean(address.country || 'India'),
    countryCode: 'IN',
    formattedAddress: clean(address.formattedAddress || address.formatted),
    district: clean(address.district),
    placeId: clean(address.placeId),
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    locationSource: ['autocomplete', 'gps', 'manual'].includes(address.locationSource) ? address.locationSource : 'manual',
  };
}
function validAddress(address) {
  return clean(address.contactName).length >= 2 && clean(address.line1).length >= 5 && clean(address.city).length >= 2
    && clean(address.state).length >= 2 && /^\d{6}$/.test(clean(address.postalCode))
    && clean(address.phone).replace(/\D/g, '').length === 10 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(address.email));
}
export function validatePickupAddress(address) {
  const errors = {};
  if (clean(address.contactName).length < 2) errors.contactName = 'Enter the pickup contact name.';
  if (clean(address.line1).length < 5) errors.line1 = 'Enter the complete street address.';
  if (clean(address.city).length < 2) errors.city = 'Enter the city.';
  if (clean(address.state).length < 2) errors.state = 'Enter the state.';
  if (!/^\d{6}$/.test(clean(address.postalCode))) errors.postalCode = 'Enter a valid 6-digit Indian pincode.';
  if (clean(address.phone).replace(/\D/g, '').length !== 10) errors.phone = 'Enter a valid 10-digit Indian phone number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(address.email))) errors.email = 'Enter a valid email address.';
  return errors;
}
function hashAddress(address) {
  return crypto.createHash('sha256').update(JSON.stringify([
    clean(address.contactName).toLowerCase(), clean(address.phone), clean(address.email).toLowerCase(),
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

export async function sellerPickup(sellerId, existingSetup = undefined) {
  const savedSetup = existingSetup === undefined
    ? await SellerShippingSetup.findOne({ sellerId }).select('manualPickupAddress').lean()
    : existingSetup;
  const seller = await Seller.findById(sellerId).lean();
  if (!seller) throw Object.assign(new Error('Seller not found'), { statusCode: 404 });
  const [factory, user] = await Promise.all([
    FactoryProfile.findOne({ sellerId }).select('name address').lean(),
    User.findById(seller.userId).select('fullName phone email').lean(),
  ]);
  const manualAddress = savedSetup?.manualPickupAddress;
  if (manualAddress && Object.keys(manualAddress).length) {
    return { seller, pickupSource: 'manual', address: normalizePickupAddress(manualAddress) };
  }
  const sellerAddress = seller.address || {};
  const factoryAddress = factory?.address || {};
  const useFactory = Boolean(factoryAddress.street && factoryAddress.city && factoryAddress.state && factoryAddress.pincode);
  const source = useFactory ? factoryAddress : sellerAddress;
  return {
    seller,
    pickupSource: useFactory ? 'factory' : source?.city ? 'seller' : 'none',
    address: normalizePickupAddress({
      contactName: clean(factory?.name || seller.companyName || user?.fullName || 'EsyGlob seller'),
      phone: clean(seller.businessPhone || user?.phone),
      email: clean(seller.businessEmail || user?.email),
      line1: clean(source.street || source.line1 || source.address),
      line2: clean(source.line2), city: clean(source.city), state: clean(source.state),
      postalCode: clean(source.pincode || source.postalCode), country: clean(source.country || 'India'),
    }),
  };
}

export async function synchronizeSellerShippingSetup(sellerId, { register = false, providerKeys = PROVIDERS } = {}) {
  let setup = await SellerShippingSetup.findOne({ sellerId });
  const { pickupSource, address } = await sellerPickup(sellerId, setup);
  const addressValid = validAddress(address);
  const addressHash = hashAddress(address);
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
  return (await sellerShippingCheckoutContext(sellerId)).providerMappings;
}

export async function sellerShippingCheckoutContext(sellerId) {
  let setup = await SellerShippingSetup.findOne({ sellerId });
  if (!setup) setup = await synchronizeSellerShippingSetup(sellerId, { register: false });
  const providerMappings = Object.fromEntries(setup.providers
    .filter(item => item.status === 'active' && item.addressHash === setup.addressHash && item.locationName)
    .map(item => [item.providerKey, { id: item.locationId, name: item.locationName, mappingId: String(setup._id), addressHash: item.addressHash }]));
  return {
    pickupAddress: validAddress(setup.pickupAddress || {}) ? normalizePickupAddress(setup.pickupAddress) : null,
    providerMappings,
    readiness: setup.readiness,
  };
}

export async function getSellerShippingSetup(userId) {
  const seller = await Seller.findOne({ userId }).select('_id').lean();
  if (!seller) throw Object.assign(new Error('Seller profile not found'), { statusCode: 404 });
  return synchronizeSellerShippingSetup(seller._id, { register: false });
}

export async function updateSellerShippingSetup(userId, input = {}) {
  const seller = await Seller.findOne({ userId }).select('_id').lean();
  if (!seller) throw Object.assign(new Error('Seller profile not found'), { statusCode: 404 });
  const address = normalizePickupAddress(input.pickupAddress || input);
  const fieldErrors = validatePickupAddress(address);
  if (Object.keys(fieldErrors).length) {
    throw Object.assign(new Error('Please complete all required pickup details.'), {
      statusCode: 422,
      code: 'INVALID_PICKUP_ADDRESS',
      fieldErrors,
    });
  }
  await SellerShippingSetup.updateOne(
    { sellerId: seller._id },
    { $set: { manualPickupAddress: address, pickupSource: 'manual' }, $setOnInsert: { providers: PROVIDERS.map(providerKey => ({ providerKey })) } },
    { upsert: true },
  );
  return synchronizeSellerShippingSetup(seller._id, { register: input.register !== false });
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
