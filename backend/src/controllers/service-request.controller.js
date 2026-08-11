import ServiceRequestService from '../services/service-request.service.js';
import ServiceEngineService from '../services/service-engine.service.js';

const run = handler => async (req, res) => { try { const result = await handler(req); res.status(result.statusCode || 200).json(result.body || result); } catch (error) { res.status(error.statusCode || 500).json({ error: error.publicMessage || safeMessage(error), code: error.code || 'SERVICE_REQUEST_FAILED', fieldErrors: error.fieldErrors, requestId: req.id }); } };
export default {
  providers: run(async req => ServiceEngineService.searchProviders(req.user._id, req.params.serviceKey, req.body, req.id)),
  capabilities: run(async () => ({ providers: ServiceEngineService.capabilities() })),
  providerHealth: run(async req => ({ providers: await ServiceEngineService.health({ refresh: req.query.refresh === 'true' }) })),
  quote: run(async req => ServiceRequestService.getQuote(req.params.serviceKey, req.body?.requirements)),
  list: run(async req => ServiceRequestService.list(req.user._id, req.query)),
  get: run(async req => ServiceRequestService.get(req.user._id, req.params.id)),
  create: run(async req => ({ statusCode: 201, body: await ServiceRequestService.create(req.user._id, req.body) })),
  cancel: run(async req => ServiceRequestService.cancel(req.user._id, req.params.id)),
  initiatePayment: run(async req => ServiceRequestService.initiatePayment(req.user._id, req.params.id)),
  verifyPayment: run(async req => ServiceRequestService.verifyPayment(req.user._id, req.params.id, req.body)),
  paymentStatus: run(async req => ServiceRequestService.setPaymentStatus(req.user._id, req.params.id, req.body?.status)),
  booking: run(async req => ServiceEngineService.getBooking(req.user._id, req.params.id)),
  retryBooking: run(async req => ServiceEngineService.retryBooking(req.user._id, req.params.id)),
  tracking: run(async req => ServiceEngineService.syncTracking(req.user._id, req.params.id)),
};

function safeMessage(error) {
  if (error.statusCode >= 500) return 'The requested service is temporarily unavailable';
  return error.message || 'Service request failed';
}
