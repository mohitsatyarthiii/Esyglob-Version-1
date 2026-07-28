import ServiceBooking from '../models/ServiceBooking.js';
import ServiceProviderQuote from '../models/ServiceProviderQuote.js';
import ServiceRequest from '../models/ServiceRequest.js';
import mongoose from 'mongoose';
import { getServiceProvider, providersForRoute, serviceProviderCapabilities } from '../lib/service-providers/index.js';
import { parseProviderSearch } from '../validators/service-booking.validator.js';

const QUOTE_TTL_MS = Math.max(5, Number(process.env.SERVICE_QUOTE_TTL_MINUTES || 20)) * 60 * 1000;

export function determineRouteType(pickup, destination) {
  const origin = String(pickup?.countryCode || '').toUpperCase();
  const target = String(destination?.countryCode || '').toUpperCase();
  if (!origin || !target) throw invalid('Pickup and destination country codes are required');
  if (origin === 'IN' && target === 'IN') return 'domestic';
  if (origin !== target) return 'international';
  throw invalid('Provider booking currently supports domestic routes within India or international routes between different countries');
}

export function applyQuoteBadges(options) {
  if (!options.length) return options;
  const lowest = Math.min(...options.map(item => item.amount));
  const etaValues = options.map(item => item.estimatedDeliveryAt ? new Date(item.estimatedDeliveryAt).getTime() : Number.POSITIVE_INFINITY);
  const fastest = Math.min(...etaValues);
  const scored = options.map((item, index) => ({
    ...item,
    bestPrice: item.amount === lowest,
    fastest: Number.isFinite(fastest) && etaValues[index] === fastest,
  }));
  const recommendedIndex = scored.findIndex(item => item.bestPrice && item.trackingAvailable && item.pickupAvailable);
  scored[Math.max(0, recommendedIndex)].recommended = true;
  return scored;
}

class ServiceEngineService {
  static capabilities() { return serviceProviderCapabilities(); }

  static async searchProviders(userId, serviceKey, body) {
    if (serviceKey !== 'shipping') throw invalid('Live provider routing is currently available for Shipping & Logistics');
    const input = parseProviderSearch(body);
    const routeType = determineRouteType(input.pickup, input.destination);
    const providers = providersForRoute(routeType);
    if (!providers.length) {
      const error = new Error(`No ${routeType} providers are configured`);
      error.statusCode = 503;
      error.code = 'NO_PROVIDERS_CONFIGURED';
      throw error;
    }

    const settled = await Promise.allSettled(providers.map(adapter => adapter.search(input)));
    const rawOptions = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    const options = applyQuoteBadges(rawOptions.filter(option => option.amount > 0 && option.pickupAvailable));
    if (!options.length) {
      const error = new Error('No providers currently service this route and shipment');
      error.statusCode = 404;
      error.code = 'NO_SERVICEABLE_PROVIDERS';
      error.providerErrors = settled.filter(result => result.status === 'rejected').map(result => result.reason?.message);
      throw error;
    }

    const expiresAt = new Date(Date.now() + QUOTE_TTL_MS);
    const stored = await ServiceProviderQuote.insertMany(options.map(option => ({
      ...option,
      userId,
      serviceKey,
      routeType,
      requestSnapshot: input,
      expiresAt,
    })));
    return {
      routeType,
      expiresAt,
      providers: stored.map(quoteResponse),
    };
  }

  static async consumeQuote(userId, quoteId, serviceKey = 'shipping') {
    if (!mongoose.Types.ObjectId.isValid(quoteId)) {
      const error = new Error('Select a valid provider quote before booking');
      error.statusCode = 422;
      error.code = 'INVALID_PROVIDER_QUOTE';
      throw error;
    }
    const quote = await ServiceProviderQuote.findOneAndUpdate({
      _id: quoteId,
      userId,
      serviceKey,
      expiresAt: { $gt: new Date() },
      consumedAt: null,
    }, { $set: { consumedAt: new Date() } }, { new: true });
    if (!quote) {
      const error = new Error('The selected provider quote expired or is no longer available. Search again.');
      error.statusCode = 409;
      error.code = 'PROVIDER_QUOTE_EXPIRED';
      throw error;
    }
    return quote;
  }

  static pricingFromQuote(quote) {
    const baseCost = money(quote.amount);
    const platformFee = money(baseCost * 0.02);
    const gstRate = quote.currency === 'INR' ? 18 : 0;
    const gstAmount = money((baseCost + platformFee) * gstRate / 100);
    return {
      currency: quote.currency,
      baseCost,
      additionalCharges: 0,
      taxAmount: 0,
      gstRate,
      gstAmount,
      discount: 0,
      platformFee,
      totalPayable: money(baseCost + platformFee + gstAmount),
      providerQuoteId: quote._id,
    };
  }

  static async ensureBooking(request, quote) {
    return ServiceBooking.findOneAndUpdate(
      { serviceRequestId: request._id },
      {
        $setOnInsert: {
          bookingNumber: bookingNumber(),
          userId: request.userId,
          providerKey: quote.providerKey,
          providerName: quote.providerName,
          serviceCode: quote.serviceCode,
          serviceName: quote.serviceName,
          routeType: quote.routeType,
          pricing: request.pricing,
          pickup: quote.requestSnapshot.pickup,
          destination: quote.requestSnapshot.destination,
          shipment: quote.requestSnapshot.shipment,
          providerPayload: quote.providerPayload,
          eta: quote.estimatedDeliveryAt,
          status: 'payment_pending',
          timeline: [{ status: 'quote_selected', message: `${quote.providerName} ${quote.serviceName} selected` }],
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  }

  static async bookPaidRequest(request) {
    const existingBooking = await ServiceBooking.findOne({ serviceRequestId: request._id });
    if (!existingBooking) throw invalid('Provider booking record is missing');
    if (existingBooking.providerReference && existingBooking.trackingNumber) return existingBooking;
    const booking = await ServiceBooking.findOneAndUpdate(
      {
        _id: existingBooking._id,
        $or: [
          { bookingLockUntil: { $exists: false } },
          { bookingLockUntil: null },
          { bookingLockUntil: { $lte: new Date() } },
        ],
      },
      {
        $set: {
          status: 'booking_pending',
          bookingLockUntil: new Date(Date.now() + 2 * 60 * 1000),
        },
        $push: {
          timeline: { status: 'booking_pending', message: 'Payment verified; provider booking started' },
        },
      },
      { new: true },
    );
    if (!booking) return ServiceBooking.findById(existingBooking._id);
    const storedQuote = await ServiceProviderQuote.findById(request.providerQuoteId);
    const quote = storedQuote || {
      providerKey: booking.providerKey,
      providerName: booking.providerName,
      serviceCode: booking.serviceCode,
      serviceName: booking.serviceName,
      routeType: booking.routeType,
      requestSnapshot: { pickup: booking.pickup, destination: booking.destination, shipment: booking.shipment },
      providerPayload: booking.providerPayload,
    };
    const adapter = getServiceProvider(booking.providerKey);
    try {
      const result = await adapter.book({ quote, request, booking });
      Object.assign(booking, result, { bookingLockUntil: null, lastProviderSyncAt: new Date(), lastProviderError: '' });
      booking.timeline.push({ status: result.status || 'confirmed', message: `${booking.providerName} confirmed the booking` });
      await booking.save();
      return booking;
    } catch (error) {
      booking.status = 'booking_pending';
      booking.bookingLockUntil = null;
      booking.lastProviderError = error.message;
      booking.timeline.push({ status: 'booking_pending', message: 'Provider confirmation is pending and will be retried' });
      await booking.save();
      return booking;
    }
  }

  static async syncTracking(userId, serviceRequestId) {
    const booking = await ServiceBooking.findOne({ serviceRequestId, userId });
    if (!booking) throw Object.assign(new Error('Service booking not found'), { statusCode: 404 });
    if (!booking.trackingNumber) return { booking };
    const tracking = await getServiceProvider(booking.providerKey).track(booking.trackingNumber);
    booking.status = tracking.status || booking.status;
    booking.eta = tracking.eta || booking.eta;
    booking.providerPayload = tracking.providerPayload;
    booking.lastProviderSyncAt = new Date();
    booking.lastProviderError = '';
    if (tracking.events?.length) booking.timeline = mergeTimeline(booking.timeline, tracking.events);
    await booking.save();
    const requestStatus = booking.status === 'delivered' ? 'completed' : booking.status;
    await ServiceRequest.updateOne(
      { _id: serviceRequestId, userId },
      {
        $set: {
          status: requestStatus,
          progress: booking.status === 'delivered' ? 100 : booking.status === 'out_for_delivery' ? 90 : booking.status === 'in_transit' ? 70 : 40,
          'provider.trackingNumber': booking.trackingNumber,
          'provider.trackingUrl': booking.trackingUrl,
          'provider.eta': booking.eta,
        },
      },
    );
    return { booking };
  }

  static async retryBooking(userId, serviceRequestId) {
    const request = await ServiceRequest.findOne({ _id: serviceRequestId, userId });
    if (!request) throw Object.assign(new Error('Service request not found'), { statusCode: 404 });
    if (request.paymentStatus !== 'paid') throw Object.assign(new Error('Provider booking starts only after verified payment'), { statusCode: 409 });
    const booking = await this.bookPaidRequest(request);
    request.bookingId = booking._id;
    request.status = booking.status === 'confirmed' ? 'confirmed' : 'booking_pending';
    request.provider.referenceNumber = booking.providerReference;
    request.provider.trackingNumber = booking.trackingNumber;
    request.provider.trackingUrl = booking.trackingUrl;
    request.provider.eta = booking.eta;
    await request.save();
    return { request, booking };
  }

  static async getBooking(userId, serviceRequestId) {
    const booking = await ServiceBooking.findOne({ serviceRequestId, userId }).lean();
    if (!booking) throw Object.assign(new Error('Service booking not found'), { statusCode: 404 });
    return { booking };
  }
}

function quoteResponse(quote) {
  return {
    quoteId: String(quote._id),
    providerKey: quote.providerKey,
    providerName: quote.providerName,
    serviceCode: quote.serviceCode,
    serviceName: quote.serviceName,
    currency: quote.currency,
    price: quote.amount,
    estimatedDeliveryAt: quote.estimatedDeliveryAt,
    estimatedDeliveryText: quote.estimatedDeliveryText,
    trackingAvailable: quote.trackingAvailable,
    insuranceAvailable: quote.insuranceAvailable,
    pickupAvailable: quote.pickupAvailable,
    features: quote.features || [],
    recommended: quote.recommended,
    fastest: quote.fastest,
    bestPrice: quote.bestPrice,
    pricing: ServiceEngineService.pricingFromQuote(quote),
  };
}
function invalid(message) { return Object.assign(new Error(message), { statusCode: 422 }); }
function money(value) { return Math.round(Number(value || 0) * 100) / 100; }
function bookingNumber() { return `ESY-SVC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`; }
function mergeTimeline(current, events) {
  const map = new Map((current || []).map(item => [`${item.status}|${new Date(item.occurredAt || item.createdAt).toISOString()}`, item]));
  events.forEach(item => map.set(`${item.status}|${new Date(item.occurredAt || Date.now()).toISOString()}`, item));
  return [...map.values()].sort((a, b) => new Date(a.occurredAt || a.createdAt) - new Date(b.occurredAt || b.createdAt)).slice(-200);
}

export default ServiceEngineService;
