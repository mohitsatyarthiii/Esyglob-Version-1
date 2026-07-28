import { ServiceProviderAdapter, dimensions, futurePickupDate, normalizeTracking } from './adapter.js';

let tokenCache;
export class FedexAdapter extends ServiceProviderAdapter {
  constructor() { super('fedex', 'FedEx'); this.baseURL = process.env.FEDEX_API_BASE_URL || 'https://apis.fedex.com'; }
  get configured() { return Boolean(process.env.FEDEX_CLIENT_ID && process.env.FEDEX_CLIENT_SECRET && process.env.FEDEX_ACCOUNT_NUMBER); }
  get capabilities() {
    return {
      services: ['international_shipping', 'express_shipping'],
      operations: ['rates', 'booking', 'pickup', 'tracking', 'insurance', 'customs_documents', 'regulatory_documents'],
      limitations: ['No public warehousing-booking operation', 'Customs brokerage price is not returned as a standalone quote'],
    };
  }
  async token() {
    if (tokenCache?.expiresAt > Date.now() + 60000) return tokenCache.value;
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.FEDEX_CLIENT_ID, client_secret: process.env.FEDEX_CLIENT_SECRET });
    const { data } = await this.client({ baseURL: this.baseURL }).post('/oauth/token', body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    tokenCache = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
    return tokenCache.value;
  }
  async api() { return this.client({ baseURL: this.baseURL, headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json', 'X-locale': 'en_US' } }); }
  async search(input) {
    try {
      const { pickup, destination, shipment } = input;
      const api = await this.api();
      const { data } = await api.post('/rate/v1/rates/quotes', {
        accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
        rateRequestControlParameters: { returnTransitTimes: true },
        requestedShipment: {
          shipDateStamp: futurePickupDate(input),
          pickupType: 'CONTACT_FEDEX_TO_SCHEDULE',
          packagingType: 'YOUR_PACKAGING',
          shipper: { address: fedexAddress(pickup) },
          recipient: { address: fedexAddress(destination) },
          requestedPackageLineItems: [{
            weight: { units: 'KG', value: shipment.weightKg },
            dimensions: { units: 'CM', ...dimensions(shipment) },
            ...(shipment.insuranceRequested ? { declaredValue: { amount: shipment.declaredValue, currency: shipment.currency } } : {}),
          }],
        },
      });
      return (data.output?.rateReplyDetails || []).map(rate => {
        const detail = rate.ratedShipmentDetails?.find(item => item.totalNetCharge) || rate.ratedShipmentDetails?.[0];
        return {
          providerKey: this.key, providerName: this.name,
          serviceCode: rate.serviceType,
          serviceName: rate.serviceName || rate.serviceType?.replaceAll('_', ' '),
          currency: detail?.currency || detail?.totalNetCharge?.currency || detail?.totalNetFedExCharge?.currency || shipment.currency,
          amount: moneyValue(detail?.totalNetCharge ?? detail?.totalNetFedExCharge),
          estimatedDeliveryAt: rate.operationalDetail?.deliveryDate || null,
          estimatedDeliveryText: rate.commit?.dateDetail?.dayFormat || rate.transitTime || '',
          trackingAvailable: true, insuranceAvailable: true, pickupAvailable: true,
          features: ['Shipment tracking', 'Courier pickup', 'Declared-value coverage', shipment.contents !== 'documents' && 'Customs documentation'].filter(Boolean),
          providerPayload: { serviceType: rate.serviceType, packagingType: rate.packagingType },
        };
      }).filter(item => item.serviceCode && item.amount > 0);
    } catch (error) { throw this.providerError(error, 'rate search'); }
  }
  async book({ quote, booking }) {
    try {
      const { pickup, destination, shipment } = quote.requestSnapshot;
      const api = await this.api();
      const { data } = await api.post('/ship/v1/shipments', {
        labelResponseOptions: 'URL_ONLY',
        accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
        requestedShipment: {
          shipDatestamp: futurePickupDate(quote.requestSnapshot),
          serviceType: quote.serviceCode,
          packagingType: 'YOUR_PACKAGING',
          pickupType: 'CONTACT_FEDEX_TO_SCHEDULE',
          shipper: fedexParty(pickup),
          recipients: [fedexParty(destination)],
          shippingChargesPayment: { paymentType: 'SENDER' },
          labelSpecification: { imageType: 'PDF', labelStockType: 'PAPER_4X6' },
          requestedPackageLineItems: [{
            weight: { units: 'KG', value: shipment.weightKg },
            dimensions: { units: 'CM', ...dimensions(shipment) },
            ...(shipment.insuranceRequested ? { declaredValue: { amount: shipment.declaredValue, currency: shipment.currency } } : {}),
            customerReferences: [{ customerReferenceType: 'CUSTOMER_REFERENCE', value: booking.bookingNumber }],
          }],
          ...(shipment.contents !== 'documents' ? {
            customsClearanceDetail: fedexCustoms(shipment),
          } : {}),
        },
      });
      const piece = data.output?.transactionShipments?.[0]?.pieceResponses?.[0] || {};
      return { providerReference: data.transactionId, trackingNumber: piece.trackingNumber, trackingUrl: piece.trackingUrl, labelUrl: piece.packageDocuments?.[0]?.url, status: 'confirmed', providerPayload: data };
    } catch (error) { throw this.providerError(error, 'booking'); }
  }
  async track(trackingNumber) {
    try {
      const api = await this.api();
      const { data } = await api.post('/track/v1/trackingnumbers', { includeDetailedScans: true, trackingInfo: [{ trackingNumberInfo: { trackingNumber } }] });
      const result = data.output?.completeTrackResults?.[0]?.trackResults?.[0] || {};
      return { status: normalizeTracking(result.latestStatusDetail?.code || result.latestStatusDetail?.description), eta: result.estimatedDeliveryTimeWindow?.window?.ends || null, events: (result.scanEvents || []).map(event => ({ status: normalizeTracking(event.eventType || event.eventDescription), message: event.eventDescription, location: event.scanLocation?.city, occurredAt: event.date })), providerPayload: data };
    } catch (error) { throw this.providerError(error, 'tracking'); }
  }
}
function fedexAddress(address) { return { streetLines: [address.line1, address.line2].filter(Boolean), city: address.city, stateOrProvinceCode: address.state, postalCode: address.postalCode, countryCode: address.countryCode, residential: false }; }
function fedexParty(address) { return { contact: { personName: address.contactName, phoneNumber: address.phone, emailAddress: address.email }, address: fedexAddress(address) }; }
function moneyValue(value) { return Number(value?.amount ?? value?.value ?? value ?? 0); }
function fedexCustoms(shipment) {
  return {
    dutiesPayment: { paymentType: 'SENDER' },
    commodities: [{
      description: shipment.description,
      countryOfManufacture: shipment.countryOfOrigin,
      quantity: shipment.quantity,
      quantityUnits: 'PCS',
      weight: { units: 'KG', value: shipment.weightKg },
      unitPrice: { amount: Math.max(0.01, shipment.declaredValue / shipment.quantity), currency: shipment.currency },
      customsValue: { amount: shipment.declaredValue, currency: shipment.currency },
      ...(shipment.hsCode ? { harmonizedCode: shipment.hsCode } : {}),
    }],
    totalCustomsValue: { amount: shipment.declaredValue, currency: shipment.currency },
    commercialInvoice: { shipmentPurpose: 'SOLD' },
  };
}
