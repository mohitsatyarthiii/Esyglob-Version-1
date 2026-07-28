import { apiRequest, normalizeList, unwrapData } from './client'

const SERVICE_PROVIDERS = {
  shipping: ['dhl', 'fedex', 'shiprocket', 'delhivery'],
  'customs-brokerage': ['dhl', 'fedex'],
  warehousing: ['dhl', 'fedex'],
}

export const SERVICE_CATALOG = [
  service('shipping', 'Shipping & Logistics', 'Logistics', 'both', 'Compare live, serviceable courier rates and book directly with an available provider.', 'Live provider rates', ['Pickup information', 'Destination information', 'Shipment details'], [
    field('pickupContactName', 'Pickup contact name', 'text', true, undefined, 'Pickup information'), field('pickupPhone', 'Pickup phone', 'tel', true, undefined, 'Pickup information'), field('pickupEmail', 'Pickup email', 'email', false, undefined, 'Pickup information'), field('pickupLine1', 'Pickup address', 'textarea', true, undefined, 'Pickup information'), field('pickupCity', 'Pickup city', 'text', true, undefined, 'Pickup information'), field('pickupState', 'Pickup state', 'text', true, undefined, 'Pickup information'), field('pickupPostalCode', 'Pickup postal code', 'text', true, undefined, 'Pickup information'), field('pickupCountry', 'Pickup country', 'text', true, undefined, 'Pickup information'), field('pickupCountryCode', 'Pickup country code', 'text', true, undefined, 'Pickup information'),
    field('destinationContactName', 'Recipient name', 'text', true, undefined, 'Destination information'), field('destinationPhone', 'Recipient phone', 'tel', true, undefined, 'Destination information'), field('destinationEmail', 'Recipient email', 'email', false, undefined, 'Destination information'), field('destinationLine1', 'Destination address', 'textarea', true, undefined, 'Destination information'), field('destinationCity', 'Destination city', 'text', true, undefined, 'Destination information'), field('destinationState', 'Destination state', 'text', true, undefined, 'Destination information'), field('destinationPostalCode', 'Destination postal code', 'text', true, undefined, 'Destination information'), field('destinationCountry', 'Destination country', 'text', true, undefined, 'Destination information'), field('destinationCountryCode', 'Destination country code', 'text', true, undefined, 'Destination information'),
    field('shipmentDescription', 'Contents description', 'text', true, undefined, 'Shipment details'), field('quantity', 'Package quantity', 'number', true, undefined, 'Shipment details'), field('weightKg', 'Total weight (kg)', 'number', true, undefined, 'Shipment details'), field('lengthCm', 'Length (cm)', 'number', false, undefined, 'Shipment details'), field('widthCm', 'Width (cm)', 'number', false, undefined, 'Shipment details'), field('heightCm', 'Height (cm)', 'number', false, undefined, 'Shipment details'), field('declaredValue', 'Declared value', 'number', true, undefined, 'Shipment details'), field('currency', 'Currency', 'select', true, ['INR', 'USD', 'EUR', 'GBP'], 'Shipment details'), field('contents', 'Contents type', 'select', true, ['non_documents', 'documents'], 'Shipment details'),
    field('countryOfOrigin', 'Country of origin code', 'text', true, undefined, 'Shipment details', { contents: 'non_documents' }), field('hsCode', 'HS code', 'text', false, undefined, 'Shipment details', { contents: 'non_documents' }), field('incoterm', 'Incoterm', 'select', false, ['DAP', 'DDP', 'EXW', 'FCA', 'CPT', 'CIP'], 'Shipment details', { contents: 'non_documents' }), field('insuranceRequested', 'Carrier value protection', 'select', false, ['no', 'yes'], 'Shipment details')]),
  service('customs-brokerage', 'Customs Clearance', 'Logistics', 'both', 'Coordinate import or export clearance, HS classification and shipping documents.', 'From INR 2,499', ['Route details', 'HS and product values', 'Clearance tracking'], [
    field('type', 'Clearance type', 'select', true, ['import', 'export'], 'Route details'), field('originCountry', 'Country of origin', 'text', true, undefined, 'Route details'), field('destinationCountry', 'Destination country', 'text', true, undefined, 'Route details'), field('portOfLoading', 'Port of loading', 'text', false, undefined, 'Route details'), field('portOfDischarge', 'Port of discharge', 'text', false, undefined, 'Route details'), field('productName', 'Product name', 'text', true, undefined, 'HS and product values'), field('hsCode', 'HS code', 'text', true, undefined, 'HS and product values'), field('unitValue', 'Declared value', 'number', true, undefined, 'HS and product values'), field('currency', 'Currency', 'select', true, ['INR', 'USD', 'EUR', 'GBP'], 'HS and product values'), field('commercialInvoice', 'Commercial invoice reference', 'text', true, undefined, 'Clearance tracking'), field('packingList', 'Packing list reference', 'text', true, undefined, 'Clearance tracking'), field('importerExporterDetails', 'Importer / exporter details', 'textarea', true, undefined, 'Clearance tracking')]),
  service('warehousing', 'Warehousing & Fulfillment', 'Logistics', 'both', 'Storage, inventory intake, pick-pack and fulfillment operations.', 'Rate card', ['Inventory intake', 'Storage planning', 'Fulfillment support'], [
    field('warehouseLocation', 'Warehouse country or city', 'text', true, undefined, 'Inventory intake'), field('storageDurationDays', 'Storage duration (days)', 'number', true, undefined, 'Inventory intake'), field('estimatedVolumeM3', 'Estimated volume (m³)', 'number', true, undefined, 'Storage planning'), field('palletCount', 'Pallet count', 'number', false, undefined, 'Storage planning'), field('inventoryType', 'Inventory type', 'text', true, undefined, 'Storage planning'), field('temperatureRequirement', 'Temperature requirement', 'select', false, ['ambient', 'chilled', 'frozen', 'controlled'], 'Fulfillment support'), field('details', 'Fulfillment requirements', 'textarea', false, undefined, 'Fulfillment support')]),
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

function service(key, title, category, role, description, startingPrice, steps, fields) {
  const parsedPrice = /^From\s+([A-Z]{3})\s+([\d,]+(?:\.\d+)?)$/i.exec(startingPrice)
  return {
    key,
    title,
    category,
    role,
    description,
    startingPrice,
    startingPriceAmount: parsedPrice ? Number(parsedPrice[2].replaceAll(',', '')) : null,
    startingPriceCurrency: parsedPrice?.[1]?.toUpperCase() || null,
    steps,
    fields,
    providers: SERVICE_PROVIDERS[key] || [],
  }
}
function field(key, label, type = 'text', required = false, options, step, showWhen) { return { key, label, type, required, options, step, showWhen } }
function contactFields() { return [field('companyName', 'Company name'), field('contactName', 'Contact name', 'text', true), field('contactEmail', 'Email', 'email', true), field('contactPhone', 'Phone', 'tel')] }
function commonFields(label) { return [...contactFields(), field('details', label, 'textarea', true)] }

export function getService(key) { return SERVICE_CATALOG.find((item) => item.key === key) }
export function servicesForRole(role) { return SERVICE_CATALOG.filter((item) => item.role === 'both' || item.role === role) }
export function isServiceFieldVisible(fieldItem, values) {
  return !fieldItem.showWhen || Object.entries(fieldItem.showWhen).every(([key, value]) => values[key] === value)
}

export async function fetchServiceRequests(params = {}) { return normalizeList(await apiRequest('/service-requests', { query: { limit: 100, ...params }, cache: false }), ['requests', 'items']) }
export async function fetchServiceRequest(id) { const data = unwrapData(await apiRequest(`/service-requests/${id}`, { cache: false })) || {}; return data.request || data }
export async function fetchServiceQuote(serviceKey, requirements = {}) { return unwrapData(await apiRequest(`/service-requests/quote/${serviceKey}`, { method: 'POST', body: { requirements } })) || {} }
export async function searchServiceProviders(serviceKey, input) { return unwrapData(await apiRequest(`/service-requests/providers/search/${serviceKey}`, { method: 'POST', body: input, cache: false })) || {} }
export async function fetchServiceProviderCapabilities() { return unwrapData(await apiRequest('/service-requests/providers/capabilities', { cache: false })) || {} }
export async function fetchServiceBooking(id) { return unwrapData(await apiRequest(`/service-requests/${id}/booking`, { cache: false })) || {} }
export async function retryServiceBooking(id) { return unwrapData(await apiRequest(`/service-requests/${id}/booking/retry`, { method: 'POST', cache: false })) || {} }
export async function syncServiceTracking(id) { return unwrapData(await apiRequest(`/service-requests/${id}/tracking/sync`, { method: 'POST', cache: false })) || {} }
export async function createServiceRequest(serviceItem, role, values, documents = [], termsAccepted = false, providerQuoteId = '') {
  const data = unwrapData(await apiRequest('/service-requests', { method: 'POST', body: { role, serviceKey: serviceItem.key, originalServiceKey: serviceItem.key, serviceTitle: serviceItem.title, companyName: values.companyName, contactName: values.contactName, contactEmail: values.contactEmail, contactPhone: values.contactPhone, subject: values.subject || serviceItem.title, details: values.details || values.specialRequirements || serviceItem.description, priority: values.priority || 'normal', requirements: values, providerQuoteId: providerQuoteId || undefined, documents, termsAccepted } })) || {}
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
