import { apiRequest, normalizeList, unwrapData } from './client'

export const SERVICE_CATALOG = [
  service('shipping', 'Shipping & Logistics', 'Logistics', 'both', 'Plan freight, pickup, delivery and international shipment support.', 'Quote based', ['Shipment type', 'Pickup and delivery', 'Cargo details'], [
    field('type', 'Shipping type', 'select', true, ['ocean_fcl', 'ocean_lcl', 'air_freight', 'air_express', 'express_courier']), field('packageDescription', 'Cargo description', 'text', true), field('quantity', 'Package quantity', 'number', true), field('weight', 'Total weight (kg)', 'number'), field('pickupAddress', 'Pickup address', 'textarea', true), field('deliveryAddress', 'Delivery address', 'textarea', true), field('specialRequirements', 'Special instructions', 'textarea')]),
  service('customs-brokerage', 'Customs Clearance', 'Logistics', 'both', 'Coordinate import or export clearance, HS classification and shipping documents.', 'From INR 2,499', ['Route details', 'HS and product values', 'Clearance tracking'], [
    field('type', 'Clearance type', 'select', true, ['import', 'export']), field('originCountry', 'Origin country', 'text', true), field('destinationCountry', 'Destination country', 'text', true), field('portOfLoading', 'Port of loading'), field('portOfDischarge', 'Port of discharge'), field('productName', 'Product name', 'text', true), field('hsCode', 'HS code'), field('unitValue', 'Shipment value', 'number')]),
  service('warehousing', 'Warehousing & Fulfillment', 'Logistics', 'both', 'Storage, inventory intake, pick-pack and fulfillment operations.', 'Rate card', ['Inventory intake', 'Storage planning', 'Fulfillment support'], [
    field('warehouseLocation', 'Preferred warehouse location', 'text', true), field('sku', 'SKU', 'text', true), field('productName', 'Product name', 'text', true), field('quantity', 'Quantity', 'number', true), field('storageType', 'Storage type', 'select', false, ['standard', 'climate_controlled', 'cold_storage', 'high_value']), field('details', 'Fulfillment requirements', 'textarea')]),
  service('escrow', 'Escrow Services', 'Trade Finance', 'both', 'Protect B2B payments with transaction linking and milestone release controls.', 'Platform fee', ['Transaction setup', 'Protected payment', 'Release tracking'], [
    field('sellerId', 'Seller ID', 'text', true), field('orderId', 'Order ID'), field('amount', 'Protected amount', 'number', true), field('currency', 'Currency', 'select', true, ['INR', 'USD', 'EUR', 'GBP']), field('description', 'Agreement description', 'textarea', true), field('terms', 'Release terms', 'textarea')]),
  service('trade-financing', 'Trade Financing', 'Trade Finance', 'both', 'Apply for purchase-order, invoice or working-capital finance.', 'Rate based', ['Finance request', 'Supporting records', 'Review decision'], [
    field('type', 'Financing type', 'select', true, ['po_financing', 'invoice_factoring', 'supply_chain', 'working_capital']), field('requestedAmount', 'Requested amount', 'number', true), field('currency', 'Currency', 'select', true, ['INR', 'USD', 'EUR']), field('termDays', 'Term', 'select', false, ['30', '60', '90', '120', '180']), field('purchaseOrderNumber', 'Purchase order number'), field('details', 'Business requirement', 'textarea', true)]),
  service('quality-inspection', 'Quality Inspection', 'Inspection', 'both', 'Book product, factory, pre-shipment and container-loading inspections.', 'From INR 3,499', ['Inspection scope', 'Factory schedule', 'Results and evidence'], [
    field('type', 'Inspection type', 'select', true, ['pre_production', 'during_production', 'pre_shipment', 'container_loading', 'factory_audit']), field('supplierName', 'Supplier name', 'text', true), field('factoryName', 'Factory name', 'text', true), field('factoryAddress', 'Factory address', 'textarea', true), field('requestedDate', 'Requested date', 'date', true), field('standard', 'Inspection standard'), field('specialRequirements', 'Special requirements', 'textarea')]),
  service('trade-assurance', 'Trade Assurance', 'Protection', 'buyer', 'Request transaction protection and risk review before placing a large order.', 'From INR 1,299', ['Supplier review', 'Trade terms', 'Protection recommendation'], commonFields('Describe the transaction and protection required')),
  service('dispute-resolution', 'Dispute Resolution', 'Protection', 'both', 'File and track an evidence-backed order or escrow dispute.', 'Case based', ['Transaction reference', 'Claim evidence', 'Resolution timeline'], [
    field('transactionType', 'Transaction type', 'select', true, ['order', 'escrow']), field('transactionId', 'Order or escrow ID', 'text', true), field('respondentId', 'Respondent ID', 'text', true), field('type', 'Dispute type', 'select', true, ['quality', 'delivery', 'payment', 'contract', 'other']), field('claimAmount', 'Claim amount', 'number'), field('desiredResolution', 'Desired resolution', 'select', false, ['Full refund', 'Partial refund', 'Replacement', 'Compensation', 'Other']), field('details', 'Case description', 'textarea', true)]),
  service('insurance', 'Cargo Insurance', 'Protection', 'both', 'Request cargo, shipment and trade-risk insurance guidance.', 'Quote based', ['Cargo details', 'Coverage selection', 'Partner quote'], [...contactFields(), field('shipmentValue', 'Shipment value', 'number', true), field('route', 'Shipment route', 'text', true), field('details', 'Coverage requirements', 'textarea', true)]),

  service('seller-verification', 'Business Verification', 'Verification', 'seller', 'Submit company credentials for seller verification and buyer trust.', 'Included', ['Company information', 'Business documents', 'Verification decision'], [...contactFields(), field('registrationNumber', 'Registration number'), field('taxNumber', 'GST / tax number'), field('details', 'Business and manufacturing profile', 'textarea', true)]),
  service('consulting', 'Trade Consulting', 'Advisory', 'both', 'Get specialist guidance for sourcing, logistics, compliance or market entry.', 'From INR 1,999', ['Business context', 'Expert review', 'Action plan'], [...contactFields(), field('subject', 'Consulting topic', 'text', true), field('details', 'What do you need help with?', 'textarea', true)]),
]

function service(key, title, category, role, description, startingPrice, steps, fields) { return { key, title, category, role, description, startingPrice, steps, fields } }
function field(key, label, type = 'text', required = false, options) { return { key, label, type, required, options } }
function contactFields() { return [field('companyName', 'Company name'), field('contactName', 'Contact name', 'text', true), field('contactEmail', 'Email', 'email', true), field('contactPhone', 'Phone', 'tel')] }
function commonFields(label) { return [...contactFields(), field('details', label, 'textarea', true)] }

export function getService(key) { return SERVICE_CATALOG.find((item) => item.key === key) }
export function servicesForRole(role) { return SERVICE_CATALOG.filter((item) => item.role === 'both' || item.role === role) }

export async function fetchServiceRequests(params = {}) { return normalizeList(await apiRequest('/service-requests', { query: { limit: 100, ...params }, cache: false }), ['requests', 'items']) }
export async function fetchServiceRequest(id) { const data = unwrapData(await apiRequest(`/service-requests/${id}`, { cache: false })) || {}; return data.request || data }
export async function fetchServiceQuote(serviceKey, requirements = {}) { return unwrapData(await apiRequest(`/service-requests/quote/${serviceKey}`, { method: 'POST', body: { requirements } })) || {} }
export async function createServiceRequest(serviceItem, role, values, documents = []) {
  const data = unwrapData(await apiRequest('/service-requests', { method: 'POST', body: { role, serviceKey: serviceItem.key, originalServiceKey: serviceItem.key, serviceTitle: serviceItem.title, companyName: values.companyName, contactName: values.contactName, contactEmail: values.contactEmail, contactPhone: values.contactPhone, subject: values.subject || serviceItem.title, details: values.details || values.specialRequirements || serviceItem.description, priority: values.priority || 'normal', requirements: values, documents } })) || {}
  return data.request || data
}
export async function cancelServiceRequest(id) { const data = unwrapData(await apiRequest(`/service-requests/${id}/cancel`, { method: 'PATCH' })) || {}; return data.request || data }
export async function initiateServicePayment(id) { return unwrapData(await apiRequest(`/service-requests/${id}/payment`, { method: 'POST' })) || {} }
export async function verifyServicePayment(id, input) { return unwrapData(await apiRequest(`/service-requests/${id}/payment/verify`, { method: 'POST', body: input })) || {} }
export async function updateServicePaymentStatus(id, status) { return unwrapData(await apiRequest(`/service-requests/${id}/payment/status`, { method: 'PATCH', body: { status } })) || {} }

export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true)
  return new Promise((resolve) => {
    const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true
    script.onload = () => resolve(true); script.onerror = () => resolve(false); document.body.appendChild(script)
  })
}
