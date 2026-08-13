import assert from 'node:assert/strict';
import test from 'node:test';
import { DelhiveryAdapter } from '../src/lib/service-providers/delhivery.adapter.js';
import { ShiprocketAdapter } from '../src/lib/service-providers/shiprocket.adapter.js';

const input = {
  pickup: { postalCode: '110001' },
  destination: { postalCode: '400001' },
  shipment: { weightKg: 2, lengthCm: 20, widthCm: 15, heightCm: 10, declaredValue: 1200 },
};

test('Shiprocket sends complete package dimensions and preserves every priced courier returned as available', async () => {
  const adapter = new ShiprocketAdapter();
  let params;
  adapter.api = async () => ({
    get: async (_path, options) => {
      params = options.params;
      return { data: { data: { available_courier_companies: [
        { courier_company_id: 10, courier_name: 'Courier Air', rate: 125, pickup_availability: '1', mode: 'Air', etd: 'not-a-date' },
        { courier_company_id: 43, courier_name: 'Courier Surface', freight_charge: 90, pickup_availability: '1', mode: 'Surface' },
        { courier_company_id: 99, courier_name: 'Unavailable Courier', rate: 50, pickup_availability: 0, mode: 'Surface' },
      ] } } };
    },
  });

  const rates = await adapter.search(input);
  assert.deepEqual({ length: params.length, breadth: params.breadth, height: params.height }, { length: 20, breadth: 15, height: 10 });
  assert.equal(rates.length, 3);
  assert.deepEqual(rates.map(rate => rate.serviceCode), ['10', '43', '99']);
  assert.deepEqual(rates.map(rate => rate.amount), [125, 90, 50]);
  assert.equal(rates[0].estimatedDeliveryAt, null);
});

test('Shiprocket maps booking only to a registered pickup with the seller origin pincode', async () => {
  const adapter = new ShiprocketAdapter();
  adapter.api = async () => ({
    get: async path => path.includes('/settings/company/pickup')
      ? { data: { data: { shipping_address: [{ pickup_location: 'Tamil Warehouse', pin_code: '602105' }] } } }
      : { data: { data: { available_courier_companies: [{ courier_company_id: 10, courier_name: 'Courier Air', rate: 125, pickup_availability: '0' }] } } },
  });

  const rates = await adapter.search({ ...input, pickup: { postalCode: '602105' } });
  assert.equal(rates.length, 1);
  assert.equal(rates[0].pickupAvailable, true);
  assert.equal(rates[0].pickupLocation, 'Tamil Warehouse');
  assert.equal(rates[0].providerPayload.pickupLocation, 'Tamil Warehouse');
});

test('Delhivery isolates Express and Surface rate responses into selectable services', async () => {
  const adapter = new DelhiveryAdapter();
  adapter.api = () => ({
    get: async (path, options) => {
      if (path.includes('pin-codes')) return { data: { delivery_codes: [{ postal_code: { pickup: 'Y', pre_paid: 'Y', estimated_delivery_days: 3 } }] } };
      return { data: [{ total_amount: options.params.md === 'E' ? 180 : 110 }] };
    },
  });

  const rates = await adapter.search(input);
  assert.deepEqual(rates.map(rate => rate.serviceCode), ['DELHIVERY_EXPRESS', 'DELHIVERY_SURFACE']);
  assert.deepEqual(rates.map(rate => rate.amount), [180, 110]);
});

test('Delhivery rates use seller dimensions to send the higher volumetric chargeable weight', async () => {
  const adapter = new DelhiveryAdapter();
  const rateWeights = [];
  adapter.api = () => ({
    get: async (path, options) => {
      if (path.includes('pin-codes')) return { data: { delivery_codes: [{ postal_code: { pickup: 'Y', pre_paid: 'Y' } }] } };
      rateWeights.push(options.params.cgm);
      return { data: [{ total_amount: 250 }] };
    },
  });

  await adapter.search({
    pickup: input.pickup,
    destination: input.destination,
    shipment: { ...input.shipment, weightKg: 1, lengthCm: 60, widthCm: 25, heightCm: 40, packageCount: 1 },
  });
  assert.deepEqual(rateWeights, [12000, 12000]);
});

test('provider failures expose a safe public message and a provider-specific code', () => {
  const adapter = new DelhiveryAdapter();
  const wrapped = adapter.providerError({ response: { status: 401, data: { message: 'sensitive upstream detail' } } }, 'rate search');
  assert.equal(wrapped.code, 'PROVIDER_AUTHENTICATION_FAILED');
  assert.equal(wrapped.publicMessage, 'Delhivery is currently unavailable');
});

test('rate lookup credentials do not require pickup mappings used only for booking', () => {
  const previous = {
    shiprocketEmail: process.env.SHIPROCKET_EMAIL,
    shiprocketPassword: process.env.SHIPROCKET_PASSWORD,
    shiprocketPickup: process.env.SHIPROCKET_PICKUP_LOCATION,
    delhiveryToken: process.env.DELHIVERY_API_TOKEN,
    delhiveryPickup: process.env.DELHIVERY_PICKUP_NAME,
  };

  try {
    process.env.SHIPROCKET_EMAIL = 'rates@example.com';
    process.env.SHIPROCKET_PASSWORD = 'rates-password';
    delete process.env.SHIPROCKET_PICKUP_LOCATION;
    process.env.DELHIVERY_API_TOKEN = 'rates-token';
    delete process.env.DELHIVERY_PICKUP_NAME;

    const shiprocket = new ShiprocketAdapter();
    const delhivery = new DelhiveryAdapter();

    assert.equal(shiprocket.configured, true);
    assert.equal(shiprocket.bookingConfigured, false);
    assert.equal(delhivery.configured, true);
    assert.equal(delhivery.bookingConfigured, false);
  } finally {
    for (const [key, value] of Object.entries({
      SHIPROCKET_EMAIL: previous.shiprocketEmail,
      SHIPROCKET_PASSWORD: previous.shiprocketPassword,
      SHIPROCKET_PICKUP_LOCATION: previous.shiprocketPickup,
      DELHIVERY_API_TOKEN: previous.delhiveryToken,
      DELHIVERY_PICKUP_NAME: previous.delhiveryPickup,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
