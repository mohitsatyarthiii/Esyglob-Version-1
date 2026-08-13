import ServiceEngineService from '../services/service-engine.service.js';

const COUNTRY_CODES = { india: 'IN', bharat: 'IN' };

function countryCode(value, explicit) {
  const code = String(explicit || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return code;
  return COUNTRY_CODES[String(value || '').trim().toLowerCase()] || '';
}

function address(input = {}, fallback = {}) {
  const country = input.country || fallback.country || 'India';
  return {
    contactName: input.contactName || input.fullName || input.name || fallback.contactName || fallback.companyName || 'EsyGlob seller',
    phone: input.phone || fallback.phone || fallback.businessPhone || '',
    email: input.email || fallback.email || fallback.businessEmail || '',
    line1: input.line1 || input.address || input.street || fallback.line1 || fallback.address || fallback.street || '',
    line2: input.line2 || fallback.line2 || '',
    city: input.city || fallback.city || '',
    state: input.state || fallback.state || '',
    postalCode: input.postalCode || input.pincode || input.zipCode || fallback.postalCode || fallback.pincode || fallback.zipCode || '',
    country,
    countryCode: countryCode(country, input.countryCode || fallback.countryCode),
  };
}

export async function getLiveCheckoutShipping({ userId, seller = {}, destination = {}, shipment = {}, requestId = '' }) {
  const pickupSource = seller.address || seller.shippingAddress || {};
  const pickup = address(pickupSource, seller);
  const delivery = address(destination);
  const input = {
    pickup,
    destination: delivery,
    shipment: {
      description: shipment.description,
      quantity: shipment.quantity,
      weightKg: shipment.weightKg,
      lengthCm: shipment.lengthCm,
      widthCm: shipment.widthCm,
      heightCm: shipment.heightCm,
      declaredValue: shipment.declaredValue,
      currency: shipment.currency || 'INR',
      contents: shipment.contents || 'non_documents',
      dangerousGoods: shipment.dangerousGoods === true,
      insuranceRequested: shipment.insuranceRequested === true,
      incoterm: shipment.incoterm || 'DAP',
      hsCode: shipment.hsCode || undefined,
      countryOfOrigin: countryCode(shipment.countryOfOrigin, shipment.countryOfOriginCode) || undefined,
    },
  };
  const result = await ServiceEngineService.searchProviders(userId, 'shipping', input, requestId);
  return {
    ...result,
    options: (result.providers || []).map(rate => ({
      key: `${rate.providerKey}:${rate.serviceCode}`,
      quoteId: rate.quoteId || rate.id || rate._id,
      label: rate.serviceName || rate.providerName,
      providerKey: rate.providerKey,
      providerLabel: rate.providerName,
      serviceCode: rate.serviceCode,
      serviceName: rate.serviceName,
      mode: rate.serviceType || rate.deliveryType || 'shipping',
      eta: rate.estimatedDeliveryText || (rate.estimatedDeliveryAt ? new Date(rate.estimatedDeliveryAt).toISOString() : ''),
      estimatedDelivery: rate.estimatedDeliveryText,
      amount: Number(rate.amount ?? rate.price),
      price: Number(rate.amount ?? rate.price),
      currency: rate.currency || 'INR',
      trackingAvailable: rate.trackingAvailable !== false,
      insuranceAvailable: rate.insuranceAvailable === true,
      pickupAvailable: rate.pickupAvailable === true,
      features: rate.features || [],
      recommended: rate.recommended === true,
      fastest: rate.fastest === true,
      bestPrice: rate.bestPrice === true,
      incoterm: shipment.incoterm || 'DAP',
    })),
  };
}
