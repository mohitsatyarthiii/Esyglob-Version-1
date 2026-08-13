import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import FactoryProfile from '../src/models/FactoryProfile.js';
import Seller from '../src/models/Seller.js';
import SellerShippingSetup from '../src/models/SellerShippingSetup.js';
import User from '../src/models/User.js';
import { getServiceProvider } from '../src/lib/service-providers/index.js';
import { normalizePickupAddress, updateSellerShippingSetup, validatePickupAddress } from '../src/services/seller-shipping-setup.service.js';

test('seller shipping setup normalizes an Indian pickup address for both carriers', () => {
  const address = normalizePickupAddress({
    contactName: '  Urbanwoods Dispatch  ',
    phone: '+91 98765-43210',
    email: ' SHIPPING@URBANWOODS.IN ',
    line1: '  12 Industrial Estate  ',
    line2: ' Gate 2 ',
    city: ' Chennai ',
    state: ' Tamil Nadu ',
    postalCode: ' 600001 ',
  });

  assert.deepEqual(address, {
    contactName: 'Urbanwoods Dispatch',
    phone: '9876543210',
    email: 'shipping@urbanwoods.in',
    line1: '12 Industrial Estate',
    line2: 'Gate 2',
    city: 'Chennai',
    state: 'Tamil Nadu',
    postalCode: '600001',
    country: 'India',
    countryCode: 'IN',
  });
  assert.deepEqual(validatePickupAddress(address), {});
});

test('seller shipping setup returns field-level errors for incomplete pickup details', () => {
  const errors = validatePickupAddress(normalizePickupAddress({ city: 'X', postalCode: '123' }));
  assert.deepEqual(Object.keys(errors).sort(), ['city', 'contactName', 'email', 'line1', 'phone', 'postalCode', 'state']);
});

test('seller can save pickup details and synchronize Delhivery and Shiprocket without a live booking', async () => {
  const sellerId = new mongoose.Types.ObjectId();
  const setup = new SellerShippingSetup({ sellerId, providers: [] });
  setup.save = async () => setup;
  const originals = {
    sellerFindOne: Seller.findOne, sellerFindById: Seller.findById, sellerUpdateOne: Seller.updateOne,
    setupFindOne: SellerShippingSetup.findOne, setupUpdateOne: SellerShippingSetup.updateOne,
    factoryFindOne: FactoryProfile.findOne, userFindById: User.findById,
  };
  const adapters = ['delhivery', 'shiprocket'].map(getServiceProvider);
  const adapterOriginals = adapters.map(adapter => ({ adapter, find: adapter.findPickupLocation, register: adapter.registerPickup }));
  try {
    Seller.findOne = () => ({ select: () => ({ lean: async () => ({ _id: sellerId }) }) });
    Seller.findById = () => ({ lean: async () => ({ _id: sellerId, userId: new mongoose.Types.ObjectId(), companyName: 'Urbanwoods' }) });
    Seller.updateOne = async () => ({});
    SellerShippingSetup.updateOne = async (_filter, update) => { setup.manualPickupAddress = update.$set.manualPickupAddress; setup.pickupSource = 'manual'; };
    SellerShippingSetup.findOne = async () => setup;
    FactoryProfile.findOne = () => ({ select: () => ({ lean: async () => null }) });
    User.findById = () => ({ select: () => ({ lean: async () => null }) });
    for (const adapter of adapters) {
      adapter.findPickupLocation = async () => null;
      adapter.registerPickup = async ({ address }) => ({ locationName: `URBANWOODS_${adapter.key}_${address.postalCode}`, locationId: `${adapter.key}-1` });
    }

    const result = await updateSellerShippingSetup(new mongoose.Types.ObjectId(), { pickupAddress: {
      contactName: 'Urbanwoods Dispatch', phone: '+91 98765 43210', email: 'shipping@urbanwoods.in',
      line1: '12 Industrial Estate', city: 'Chennai', state: 'Tamil Nadu', postalCode: '600001', country: 'India',
    } });

    assert.equal(result.readiness, 'ready');
    assert.equal(result.pickupSource, 'manual');
    assert.equal(result.pickupAddress.phone, '9876543210');
    assert.deepEqual(result.providers.map(item => item.status), ['active', 'active']);
  } finally {
    Seller.findOne = originals.sellerFindOne; Seller.findById = originals.sellerFindById; Seller.updateOne = originals.sellerUpdateOne;
    SellerShippingSetup.findOne = originals.setupFindOne; SellerShippingSetup.updateOne = originals.setupUpdateOne;
    FactoryProfile.findOne = originals.factoryFindOne; User.findById = originals.userFindById;
    for (const { adapter, find, register } of adapterOriginals) { adapter.findPickupLocation = find; adapter.registerPickup = register; }
  }
});
