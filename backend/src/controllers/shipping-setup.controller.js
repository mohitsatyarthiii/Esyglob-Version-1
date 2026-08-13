import * as setupService from '../services/seller-shipping-setup.service.js';

function send(res, promise, status = 200) {
  return promise.then(data => res.status(status).json({ setup: data }))
    .catch(error => res.status(error.statusCode || 500).json({ error: error.statusCode >= 500 ? 'Shipping setup is temporarily unavailable' : error.message, code: error.code || 'SHIPPING_SETUP_FAILED' }));
}

export function mine(req, res) { return send(res, setupService.getSellerShippingSetup(req.user._id)); }
export async function syncMine(req, res) {
  try {
    const current = await setupService.getSellerShippingSetup(req.user._id);
    return send(res, setupService.synchronizeSellerShippingSetup(current.sellerId, { register: true }));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.statusCode >= 500 ? 'Shipping setup is temporarily unavailable' : error.message, code: error.code || 'SHIPPING_SETUP_FAILED' });
  }
}
export async function adminList(req, res) {
  try { return res.json({ setups: await setupService.listSellerShippingSetups(req.query) }); }
  catch { return res.status(500).json({ error: 'Shipping setup is temporarily unavailable', code: 'SHIPPING_SETUP_FAILED' }); }
}
export function adminRetry(req, res) { return send(res, setupService.synchronizeSellerShippingSetup(req.params.sellerId, { register: true, providerKeys: req.body?.provider ? [req.body.provider] : undefined })); }
export function adminMapping(req, res) { return send(res, setupService.setProviderMapping(req.params.sellerId, req.params.providerKey, req.body)); }
