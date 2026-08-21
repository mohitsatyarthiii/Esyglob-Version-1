import test from 'node:test';
import assert from 'node:assert/strict';
import Shipment from '../src/models/Shipment.js';
import { normalizeTracking } from '../src/lib/service-providers/adapter.js';
import { DelhiveryAdapter } from '../src/lib/service-providers/delhivery.adapter.js';
import { ShiprocketAdapter } from '../src/lib/service-providers/shiprocket.adapter.js';

test('normalizes carrier milestones without treating unknown provider text as in transit', () => {
  assert.equal(normalizeTracking('Out For Delivery'), 'out_for_delivery');
  assert.equal(normalizeTracking('RTO In Transit'), 'rto_in_transit');
  assert.equal(normalizeTracking('Consignee unavailable - delivery attempted'), 'delivery_attempted');
  assert.equal(normalizeTracking('AWB Assigned'), 'label_created');
  assert.equal(normalizeTracking('Unrecognized provider code 901'), 'pending');
});

test('Delhivery tracking preserves provider status, location, timestamp, and raw event details', async () => {
  const adapter = new DelhiveryAdapter();
  adapter.api = () => ({ get: async () => ({ data: { ShipmentData: [{ Shipment: {
    Status: { Status: 'In Transit', StatusLocation: 'Delhi Hub' },
    ExpectedDeliveryDate: '2026-08-26T00:00:00.000Z',
    Scans: [{ ScanDetail: { Scan: 'Picked Up', Instructions: 'Collected from seller', ScannedLocation: 'Chennai', ScanDateTime: '2026-08-22T05:34:00.000Z' } }],
  } }] } }) });
  const result = await adapter.track('TEST-AWB');
  assert.equal(result.status, 'in_transit');
  assert.equal(result.providerStatus, 'In Transit');
  assert.equal(result.currentLocation, 'Delhi Hub');
  assert.deepEqual(result.events[0], {
    status: 'picked_up',
    providerStatus: 'Picked Up',
    message: 'Collected from seller',
    location: 'Chennai',
    occurredAt: '2026-08-22T05:34:00.000Z',
    providerPayload: {
      Scan: 'Picked Up',
      Instructions: 'Collected from seller',
      ScannedLocation: 'Chennai',
      ScanDateTime: '2026-08-22T05:34:00.000Z',
    },
  });
});

test('Shiprocket tracking maps its activity feed into the shared EsyGlob contract', async () => {
  const adapter = new ShiprocketAdapter();
  adapter.api = async () => ({ get: async () => ({ data: { tracking_data: {
    shipment_status: 'Out for Delivery',
    current_location: 'Bengaluru',
    etd: '2026-08-25',
    shipment_track_activities: [{ 'sr-status-label': 'IN TRANSIT', activity: 'Reached destination hub', location: 'Bengaluru', date: '2026-08-24T18:20:00.000Z' }],
  } } }) });
  const result = await adapter.track('TEST-AWB');
  assert.equal(result.status, 'out_for_delivery');
  assert.equal(result.events[0].status, 'in_transit');
  assert.equal(result.events[0].location, 'Bengaluru');
  assert.equal(result.events[0].providerStatus, 'IN TRANSIT');
});

test('shipment schema stores durable normalized event metadata and tracking refresh state', () => {
  const paths = Shipment.schema.path('events').schema.paths;
  for (const key of ['eventKey', 'status', 'description', 'location', 'occurredAt', 'provider', 'providerStatus', 'source', 'providerPayload']) {
    assert.ok(paths[key], `missing tracking event field: ${key}`);
  }
  assert.ok(Shipment.schema.path('trackingUrl'));
  assert.ok(Shipment.schema.path('currentLocation'));
  assert.ok(Shipment.schema.path('lastProviderRefreshAt'));
  assert.ok(Shipment.schema.path('status').enumValues.includes('delivery_attempted'));
  assert.ok(Shipment.schema.path('status').enumValues.includes('rto_delivered'));
});
