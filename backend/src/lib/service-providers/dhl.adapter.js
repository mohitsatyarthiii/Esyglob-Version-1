import { ServiceProviderAdapter, dimensions, futurePickupDate, normalizeTracking } from './adapter.js';

export class DhlAdapter extends ServiceProviderAdapter {
  constructor() {
    super('dhl', 'DHL Express');
    this.baseURL = process.env.DHL_API_BASE_URL || 'https://express.api.dhl.com/mydhlapi';
  }
  get configured() {
    return Boolean(process.env.DHL_API_USERNAME && process.env.DHL_API_PASSWORD && process.env.DHL_ACCOUNT_NUMBER);
  }
  get capabilities() {
    return {
      services: ['international_shipping', 'express_shipping'],
      operations: ['rates', 'serviceability', 'booking', 'pickup', 'tracking', 'insurance', 'customs_documents', 'landed_cost'],
      limitations: ['No public warehousing-booking operation', 'Landed cost requires commodity and customs data'],
    };
  }
  api() {
    return this.client({
      baseURL: this.baseURL,
      auth: { username: process.env.DHL_API_USERNAME, password: process.env.DHL_API_PASSWORD },
      headers: { Accept: 'application/json' },
    });
  }
  async search(input) {
    try {
      const { pickup, destination, shipment } = input;
      const { data } = await this.api().get('/rates', { params: {
        accountNumber: process.env.DHL_ACCOUNT_NUMBER,
        originCountryCode: pickup.countryCode,
        originPostalCode: pickup.postalCode,
        originCityName: pickup.city,
        destinationCountryCode: destination.countryCode,
        destinationPostalCode: destination.postalCode,
        destinationCityName: destination.city,
        weight: shipment.weightKg,
        length: dimensions(shipment).length,
        width: dimensions(shipment).width,
        height: dimensions(shipment).height,
        plannedShippingDate: futurePickupDate(input),
        isCustomsDeclarable: shipment.contents !== 'documents',
        unitOfMeasurement: 'metric',
        nextBusinessDay: true,
      } });
      return (data.products || []).map(product => {
        const insuranceService = (product.valueAddedServices || []).find(item => /insurance|shipment value protection/i.test(item.serviceName || item.serviceCode));
        return ({
        providerKey: this.key, providerName: this.name,
        serviceCode: product.productCode || product.localProductCode,
        serviceName: product.productName || product.localProductName || 'DHL Express',
        currency: product.totalPrice?.[0]?.priceCurrency || shipment.currency,
        amount: Number(product.totalPrice?.[0]?.price || product.totalPrice?.[0]?.priceBreakdown?.[0]?.price || 0),
        estimatedDeliveryAt: product.deliveryCapabilities?.estimatedDeliveryDateAndTime || null,
        estimatedDeliveryText: product.deliveryCapabilities?.estimatedDeliveryDateAndTime || product.deliveryCapabilities?.totalTransitDays && `${product.deliveryCapabilities.totalTransitDays} business days`,
        trackingAvailable: true,
        insuranceAvailable: Boolean(insuranceService),
        pickupAvailable: product.pickupCapabilities?.localCutoffDateAndTime !== undefined,
        features: [
          'Shipment tracking',
          product.pickupCapabilities?.localCutoffDateAndTime !== undefined && 'Courier pickup',
          insuranceService && 'Shipment value protection',
          shipment.contents !== 'documents' && 'Customs documentation',
        ].filter(Boolean),
        providerPayload: {
          productCode: product.productCode,
          localProductCode: product.localProductCode,
          insuranceServiceCode: insuranceService?.serviceCode,
        },
      });
      }).filter(item => item.serviceCode && item.amount > 0 && (!shipment.insuranceRequested || item.insuranceAvailable));
    } catch (error) { throw this.providerError(error, 'rate search'); }
  }
  async book({ quote, request, booking }) {
    try {
      const snapshot = quote.requestSnapshot;
      const { pickup, destination, shipment } = snapshot;
      const { data } = await this.api().post('/shipments', {
        plannedShippingDateAndTime: `${futurePickupDate(snapshot)}T10:00:00 GMT+05:30`,
        pickup: { isRequested: true },
        productCode: quote.serviceCode,
        accounts: [{ typeCode: 'shipper', number: process.env.DHL_ACCOUNT_NUMBER }],
        ...(shipment.insuranceRequested && quote.providerPayload?.insuranceServiceCode ? {
          valueAddedServices: [{ serviceCode: quote.providerPayload.insuranceServiceCode }],
        } : {}),
        customerDetails: {
          shipperDetails: party(pickup),
          receiverDetails: party(destination),
        },
        content: {
          packages: [{ weight: shipment.weightKg, dimensions: dimensions(shipment), description: shipment.description }],
          isCustomsDeclarable: shipment.contents !== 'documents',
          declaredValue: shipment.declaredValue,
          declaredValueCurrency: shipment.currency,
          description: shipment.description,
          unitOfMeasurement: 'metric',
          incoterm: shipment.incoterm || 'DAP',
          ...(shipment.contents !== 'documents' ? {
            exportDeclaration: dhlExportDeclaration(shipment, booking),
          } : {}),
        },
        customerReferences: [{ value: booking.bookingNumber, typeCode: 'CU' }],
      });
      return {
        providerReference: data.shipmentTrackingNumber || data.dispatchConfirmationNumber,
        trackingNumber: data.shipmentTrackingNumber,
        trackingUrl: data.trackingUrl,
        labelUrl: data.documents?.find(item => item.typeCode === 'label')?.url,
        status: 'confirmed',
        providerPayload: data,
      };
    } catch (error) { throw this.providerError(error, 'booking'); }
  }
  async track(trackingNumber) {
    try {
      const { data } = await this.api().get(`/shipments/${encodeURIComponent(trackingNumber)}/tracking`);
      const shipment = data.shipments?.[0] || data;
      return {
        status: normalizeTracking(shipment.status?.statusCode || shipment.status?.description),
        eta: shipment.estimatedTimeOfDelivery || null,
        events: (shipment.events || []).map(event => ({ status: normalizeTracking(event.typeCode || event.description), message: event.description, location: event.serviceArea?.description, occurredAt: event.date && `${event.date}T${event.time || '00:00:00'}` })),
        providerPayload: data,
      };
    } catch (error) { throw this.providerError(error, 'tracking'); }
  }
}

function party(address) {
  return {
    postalAddress: { postalCode: address.postalCode, cityName: address.city, countryCode: address.countryCode, addressLine1: address.line1, addressLine2: address.line2, provinceCode: address.state },
    contactInformation: { email: address.email, phone: address.phone, companyName: address.contactName, fullName: address.contactName },
  };
}

function dhlExportDeclaration(shipment, booking) {
  return {
    lineItems: [{
      number: 1,
      description: shipment.description,
      price: Math.max(0.01, shipment.declaredValue / shipment.quantity),
      quantity: { value: shipment.quantity, unitOfMeasurement: 'PCS' },
      manufacturerCountry: shipment.countryOfOrigin,
      weight: { netValue: shipment.weightKg, grossValue: shipment.weightKg },
      ...(shipment.hsCode ? { commodityCodes: [{ typeCode: 'outbound', value: shipment.hsCode }] } : {}),
    }],
    invoice: {
      number: booking.bookingNumber,
      date: new Date().toISOString().slice(0, 10),
      signatureName: 'EsyGlob account holder',
      signatureTitle: 'Authorized shipper',
    },
    placeOfIncoterm: shipment.incoterm || 'DAP',
    exportReason: 'Permanent export',
    exportReasonType: 'permanent',
  };
}
