import * as service from '../services/trade-artifact.service.js';
import { streamAgreementPdf } from '../lib/agreement-pdf.js';
const respond = handler => async (req, res) => { try { return res.json(await handler(req)); } catch (error) { return res.status(error.statusCode || 500).json({ error: error.message }); } };
export const workspace = respond(req => service.getWorkspace(req.params.entityType, req.params.entityId, req.user));
export const unifiedWorkspace = respond(req => service.getUnifiedWorkspace(req.params.entityType, req.params.entityId, req.user));
export const addNote = respond(req => service.addNote(req.params.entityType, req.params.entityId, req.user, req.body || {}));
export const createDocument = respond(req => service.createTradeDocument(req.params.entityType, req.params.entityId, req.user, req.body || {}));
export const signDocument = respond(req => service.signTradeDocument(req.params.entityType, req.params.entityId, req.params.documentId, req.user, req.body || {}, { ipAddress: req.ip, userAgent: req.get('user-agent') }));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
const contractValue = value => {
  if (value === null || value === undefined || value === '') return 'Not specified';
  if (Array.isArray(value)) return value.map(contractValue).join(', ') || 'None';
  if (typeof value === 'object') return Object.entries(value).filter(([, item]) => item !== undefined && item !== '').map(([key, item]) => `${key.replaceAll('_', ' ')}: ${contractValue(item)}`).join(' · ');
  return String(value);
};
const termRows = content => [
  ['Minimum order quantity', content.minimumOrderQuantity],
  ['Production', content.production],
  ['Delivery', content.delivery],
  ['Shipping', content.shipping],
  ['Shipping terms', content.shippingTerms],
  ['Payment terms', content.paymentTerms],
  ['Incoterms', content.incoterms],
  ['Taxes', content.taxes],
  ['Packaging', content.packaging],
  ['Warranty', content.warranty],
  ['Special conditions', content.specialConditions],
].filter(([, value]) => value !== undefined && value !== null && value !== '');

export async function previewDocument(req, res) {
  try {
    const { document, entityNumber } = await service.getTradeDocument(req.params.entityType, req.params.entityId, req.params.documentId, req.user);
    if (req.query.format === 'pdf') return streamAgreementPdf(res, document, entityNumber);
    const content = document.metadata?.content || {};
    const isFinalQuotation = Boolean(document.metadata?.isFinalQuotation);
    const products = Array.isArray(content.products) ? content.products : [];
    const signatureRoles = ['seller', 'buyer'];
    const signatures = signatureRoles.map(role => { const item = (document.signatures || []).find(value => value.signerRole === role); const signatureMark = item?.signatureType === 'drawn' && String(item.signatureValue || '').startsWith('data:image/') ? `<img style="display:block;height:48px;margin-top:7px;max-width:180px;object-fit:contain;object-position:left center" src="${escapeHtml(item.signatureValue)}" alt="${escapeHtml(role)} signature">` : `<em>${escapeHtml(item?.signatureValue || '')}</em>`; return item ? `<article class="signature signed"><strong>${escapeHtml(role)} signature</strong><b>${escapeHtml(item.signerName)}</b>${signatureMark}<small>Signed ${escapeHtml(new Date(item.signedAt).toLocaleString())} · ${isFinalQuotation ? 'Final Quotation' : 'Agreement'} v${escapeHtml(document.version || 1)}</small></article>` : `<article class="signature pending">Awaiting ${escapeHtml(role)} signature</article>`; }).join('');
    const productRows = products.map(item => `<tr><td>${escapeHtml(item.name || 'Quoted product')}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.unitPrice)}</td><td>${escapeHtml(content.pricing?.currency || '')}</td></tr>`).join('');
    const terms = termRows(content).map(([title, value]) => `<div><dt>${escapeHtml(title)}</dt><dd>${escapeHtml(contractValue(value))}</dd></div>`).join('');
    const party = (title, value = {}) => `<article class="party"><small>${title}</small><strong>${escapeHtml(value.company || value.name || 'Marketplace participant')}</strong><span>${escapeHtml(value.name || '')}</span><span>${escapeHtml(value.email || value.registrationNumber || '')}</span></article>`;
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'private, no-store');
    return res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(document.title)}</title><style>*{box-sizing:border-box}body{background:#eef2f7;color:#172033;font:14px Inter,system-ui;margin:0;padding:26px}.page{background:#fff;border:1px solid #d8e0ea;box-shadow:0 18px 45px #0f172a14;margin:auto;max-width:860px;padding:42px 46px}.brand{align-items:flex-start;border-bottom:2px solid #17345f;display:flex;justify-content:space-between;padding-bottom:18px}.brand>div:first-child{align-items:center;display:flex;gap:12px}.mark{align-items:center;background:#2563eb;border-radius:9px;color:#fff;display:flex;font-size:18px;font-weight:900;height:39px;justify-content:center;width:39px}.brand b,.brand small{display:block}.brand b{color:#17345f;font-size:12px;letter-spacing:.04em}.brand small{color:#64748b;font-size:10px}.reference{text-align:right}.reference strong{display:block;font-size:12px}.reference em{color:#b45309;font-size:10px;font-style:normal;font-weight:700;text-transform:capitalize}h1{font-size:27px;margin:28px 0 22px;text-align:center}.parties{display:grid;gap:13px;grid-template-columns:1fr 1fr}.party{background:#f8fafc;border-left:3px solid #2563eb;padding:14px}.party small{color:#64748b;font-size:10px;font-weight:800;text-transform:uppercase}.party strong,.party span{display:block}.party strong{font-size:14px;margin:5px 0}.party span{color:#64748b;font-size:11px;margin-top:2px}table{border-collapse:collapse;margin:22px 0;width:100%}th{background:#17345f;color:#fff;font-size:11px;padding:10px;text-align:left}td{border:1px solid #dce4ed;font-size:12px;padding:11px}.terms{display:grid;grid-template-columns:1fr 1fr}.terms>div{border-bottom:1px solid #e2e8f0;display:grid;grid-template-columns:145px 1fr;padding:10px 5px}.terms dt{color:#64748b;font-size:10px;font-weight:800}.terms dd{font-size:11px;font-weight:600;margin:0}.notes{background:#fffbeb;border:1px solid #fde68a;border-radius:9px;font-size:11px;line-height:1.6;margin-top:18px;padding:13px}.signatures{border-top:1px solid #d8e0ea;display:grid;gap:12px;grid-template-columns:1fr 1fr;margin-top:28px;padding-top:22px}.signatures h2{font-size:15px;grid-column:1/-1;margin:0}.signature{border:1px solid #dce4ed;border-radius:10px;display:grid;min-height:110px;padding:14px}.signature strong{font-size:11px;text-transform:capitalize}.signature b{font-size:13px;margin-top:7px}.signature em{color:#17345f;font:17px cursive;margin-top:7px}.signature small{color:#64748b;font-size:9px;margin-top:7px}.signature.pending{background:#f8fafc;color:#64748b;place-content:center;text-transform:capitalize}footer{color:#64748b;font-size:9px;margin-top:28px;text-align:center}@media(max-width:640px){body{padding:0}.page{padding:24px 16px}.brand{gap:12px}.brand>div:first-child span:not(.mark){display:none}.parties,.terms,.signatures{grid-template-columns:1fr}.terms>div{grid-template-columns:120px 1fr}.signatures h2{grid-column:1}.reference{max-width:50%}}</style></head><body><main class="page"><header class="brand"><div><span class="mark">E</span><span><b>ESYGLOB ENTERPRISE TRADE</b><small>${isFinalQuotation ? 'Official Final Quotation' : 'International Commercial Agreement'}</small></span></div><div class="reference"><strong>${escapeHtml(content.finalQuotationNumber || content.agreementNumber || entityNumber)}</strong><small>Trade reference ${escapeHtml(content.tradeReference || entityNumber)}</small><em>Version ${escapeHtml(document.version || 1)} · ${escapeHtml(document.status).replaceAll('_', ' ')}</em></div></header><h1>${escapeHtml(document.title)}</h1><section class="parties">${party('Buyer', content.buyer)}${party('Seller', content.seller)}</section><table><thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th>Currency</th></tr></thead><tbody>${productRows || '<tr><td colspan="4">Product terms are being completed.</td></tr>'}</tbody></table><dl class="terms">${terms}</dl>${content.notes ? `<section class="notes"><strong>Commercial notes</strong><br>${escapeHtml(content.notes)}</section>` : ''}<section class="signatures"><h2>Electronic signatures</h2>${signatures}</section><footer>Generated and retained by EsyGlob with a controlled signature and activity audit trail.</footer></main></body></html>`);
  } catch (error) {
    return res.status(error.statusCode || 500).send(escapeHtml(error.message));
  }
}
