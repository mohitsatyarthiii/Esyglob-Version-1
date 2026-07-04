import { apiRequest } from './client';
import { normalizeList, unwrapData } from './normalizers';
import { Pagination } from './types';

export type ServiceRole = 'buyer' | 'seller' | 'both';

export type ServiceField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'email' | 'phone';
  required?: boolean;
  options?: string[];
  placeholder?: string;
  step?: string;
};

export type ServiceCatalogItem = {
  key: string;
  title: string;
  category: string;
  role: ServiceRole;
  icon: string;
  image: string;
  shortDescription: string;
  description: string;
  startingPrice: string;
  duration: string;
  availability: 'Available' | 'Limited' | 'Invite only';
  status: 'Popular' | 'Recommended' | 'New' | 'Essential';
  benefits: string[];
  features: string[];
  documents: string[];
  faqs: Array<{ question: string; answer: string }>;
  terms: string[];
  fields: ServiceField[];
  workflowSteps?: string[];
  bookable?: boolean;
  unavailableReason?: string;
  keywords: string[];
  endpoint?: string;
};

export type ServiceRequest = {
  _id?: string;
  id?: string;
  requestNumber?: string;
  orderNumber?: string;
  transactionNumber?: string;
  inspectionNumber?: string;
  serviceKey?: string;
  originalServiceKey?: string;
  serviceTitle?: string;
  title?: string;
  subject?: string;
  status?: string;
  priority?: string;
  progress?: number;
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  details?: string;
  requirements?: Record<string, unknown>;
  documents?: Array<{ name?: string; url?: string; status?: string }>;
  history?: Array<{ status?: string; note?: string; message?: string; createdAt?: string; updatedAt?: string }>;
  notes?: string;
  expectedCompletionDate?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type ShippingOrder = ServiceRequest & {
  type?: string;
  carrier?: string;
  carrierService?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  pickup?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  packages?: Array<Record<string, unknown>>;
  totalWeight?: number;
  documents?: Array<{ name?: string; url?: string; type?: string; status?: string }>;
  specialInstructions?: string;
};

export type ServiceRequestList = {
  requests: ServiceRequest[];
  pagination?: Pagination;
};

const genericContactFields: ServiceField[] = [
  { key: 'companyName', label: 'Company name', type: 'text', placeholder: 'Your company or trading name' },
  { key: 'contactName', label: 'Contact name', type: 'text', placeholder: 'Primary contact' },
  { key: 'contactEmail', label: 'Email', type: 'email', placeholder: 'name@company.com' },
  { key: 'contactPhone', label: 'Phone', type: 'phone', placeholder: '+91 98765 43210' },
];

const documentFields: ServiceField[] = [
  { key: 'documentName', label: 'Document name', type: 'text', placeholder: 'Invoice, license, certificate' },
  { key: 'documentUrl', label: 'Document URL', type: 'text', placeholder: 'Secure file link' },
];

export const servicesCatalog: ServiceCatalogItem[] = [
  {
    key: 'shipping',
    title: 'Shipping & Logistics',
    category: 'Logistics',
    role: 'both',
    icon: 'truck-fast-outline',
    image: 'https://images.unsplash.com/photo-1494412651409-8963ce7935a7?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Plan international shipments, carrier booking, tracking, and customs handoff.',
    description: 'A managed logistics service for creating shipment records, reviewing packages, booking draft shipments, and tracking international delivery progress.',
    startingPrice: 'Quote based',
    duration: '2-7 business days',
    availability: 'Available',
    status: 'Popular',
    benefits: ['Shipment planning in one place', 'Package and route visibility', 'Carrier and tracking updates'],
    features: ['Ocean, air, express, and courier options', 'Package-level details', 'Insurance and instruction capture'],
    documents: ['Commercial invoice', 'Packing list', 'Product details', 'Shipping labels when available'],
    faqs: [
      { question: 'Can I book immediately?', answer: 'Shipments are created as drafts first, then booked after review.' },
      { question: 'Is tracking included?', answer: 'Tracking appears once the carrier and booking are assigned.' },
    ],
    terms: ['Rates depend on route, cargo, carrier availability, and customs requirements.'],
    endpoint: '/api/shipping',
    fields: [
      { key: 'type', label: 'Shipping type', type: 'select', required: true, options: ['ocean_fcl', 'ocean_lcl', 'air_freight', 'air_express', 'express_courier'], step: 'Shipment type and packages' },
      { key: 'packageDescription', label: 'Package description', type: 'text', step: 'Shipment type and packages' },
      { key: 'quantity', label: 'Quantity', type: 'number', required: true, step: 'Shipment type and packages' },
      { key: 'weight', label: 'Weight (kg)', type: 'number', step: 'Shipment type and packages' },
      { key: 'pickupAddress', label: 'Pickup address', type: 'textarea', required: true, step: 'Pickup and delivery' },
      { key: 'deliveryAddress', label: 'Delivery address', type: 'textarea', required: true, step: 'Pickup and delivery' },
      { key: 'specialInstructions', label: 'Special instructions', type: 'textarea', step: 'Insurance and instructions' },
    ],
    workflowSteps: ['Shipment type and packages', 'Pickup and delivery', 'Insurance and instructions'],
    keywords: ['freight', 'logistics', 'cargo', 'shipment', 'tracking'],
  },
  {
    key: 'escrow',
    title: 'Escrow Services',
    category: 'Trade Finance',
    role: 'both',
    icon: 'shield-check-outline',
    image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Secure milestone payments until delivery conditions are approved.',
    description: 'Protect large B2B transactions with escrow agreements, payment milestones, inspection windows, and release controls.',
    startingPrice: 'Platform fee',
    duration: 'Same day setup',
    availability: 'Available',
    status: 'Essential',
    benefits: ['Funds held securely', 'Milestone-based releases', 'Dispute support'],
    features: ['Seller and order linking', 'Funding references', 'Inspection period and terms'],
    documents: ['Purchase order', 'Supplier agreement', 'Payment reference after deposit'],
    faqs: [{ question: 'When are funds released?', answer: 'Funds release after buyer approval or completion of agreed terms.' }],
    terms: ['Escrow availability depends on seller, order status, and compliance review.'],
    endpoint: '/api/escrow',
    fields: [
      { key: 'sellerId', label: 'Seller ID', type: 'text', required: true },
      { key: 'orderId', label: 'Order ID', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'number', required: true },
      { key: 'currency', label: 'Currency', type: 'select', required: true, options: ['USD', 'EUR', 'GBP', 'INR'] },
      { key: 'paymentMethod', label: 'Payment method', type: 'select', options: ['bank_transfer', 'credit_card', 'wire', 'digital'] },
      { key: 'description', label: 'Agreement description', type: 'textarea' },
      { key: 'terms', label: 'Additional terms', type: 'textarea' },
    ],
    workflowSteps: ['Parties and order', 'Milestones and payment', 'Terms review'],
    keywords: ['payment', 'secure', 'milestone', 'finance'],
  },
  {
    key: 'quality-inspection',
    title: 'Quality Inspection',
    category: 'Inspection',
    role: 'both',
    icon: 'clipboard-check-outline',
    image: 'https://images.unsplash.com/photo-1581091215367-59ab6b5ec48f?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Book product, factory, pre-shipment, and loading inspections.',
    description: 'Coordinate inspection bookings, factory details, product checks, inspection standards, and result tracking.',
    startingPrice: 'From $149',
    duration: '3-5 business days',
    availability: 'Available',
    status: 'Recommended',
    benefits: ['Reduce quality risk', 'Independent checks', 'Clear inspection status'],
    features: ['Inspection type selection', 'Factory and product details', 'Schedule and standards capture'],
    documents: ['Product specification', 'Supplier contact', 'Factory address proof if available'],
    faqs: [{ question: 'Can I choose a date?', answer: 'Yes, requested dates are captured and confirmed by operations.' }],
    terms: ['Inspection dates are subject to factory access and inspector availability.'],
    endpoint: '/api/inspections',
    fields: [
      { key: 'type', label: 'Inspection type', type: 'select', required: true, options: ['pre_production', 'during_production', 'pre_shipment', 'container_loading', 'factory_audit'] },
      { key: 'supplierName', label: 'Supplier name', type: 'text', required: true },
      { key: 'factoryName', label: 'Factory name', type: 'text', required: true },
      { key: 'factoryAddress', label: 'Factory address', type: 'textarea', required: true },
      { key: 'contactPerson', label: 'Contact person', type: 'text' },
      { key: 'contactPhone', label: 'Contact phone', type: 'phone' },
      { key: 'requestedDate', label: 'Requested date', type: 'date', required: true },
      { key: 'standard', label: 'Inspection standard', type: 'text' },
      { key: 'specialRequirements', label: 'Special requirements', type: 'textarea' },
    ],
    workflowSteps: ['Inspection type', 'Factory and products', 'Schedule and standards'],
    keywords: ['inspection', 'factory', 'quality', 'audit'],
  },
  {
    key: 'customs-brokerage',
    title: 'Customs Brokerage',
    category: 'Compliance',
    role: 'both',
    icon: 'passport',
    image: 'https://images.unsplash.com/photo-1521791055366-0d553872125f?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Submit import/export clearance requests with route, carrier, HS code, and duty details.',
    description: 'A customs clearance workflow for shipment route information, product HS/value capture, document references, and duty estimate tracking.',
    startingPrice: 'Quote based',
    duration: '2-6 business days',
    availability: 'Available',
    status: 'Essential',
    benefits: ['Import/export clearance support', 'HS and product value capture', 'Duty status tracking'],
    features: ['Import or export clearance type', 'Carrier and route details', 'Product value and HS code rows'],
    documents: ['Commercial invoice', 'Packing list', 'HS code details', 'Shipment reference'],
    faqs: [{ question: 'Are duties calculated by the app?', answer: 'The backend calculates duty values from the submitted clearance payload.' }],
    terms: ['Clearance timelines depend on document completeness, port processing, and customs review.'],
    endpoint: '/api/customs',
    fields: [
      { key: 'type', label: 'Clearance type', type: 'select', required: true, options: ['import', 'export'], step: 'Shipment details' },
      { key: 'carrier', label: 'Carrier', type: 'select', options: ['DHL', 'FedEx', 'Maersk', 'MSC', 'CMA CGM'], step: 'Shipment details' },
      { key: 'trackingNumber', label: 'Tracking number', type: 'text', step: 'Shipment details' },
      { key: 'originCountry', label: 'Origin country', type: 'text', required: true, step: 'Route details' },
      { key: 'destinationCountry', label: 'Destination country', type: 'text', required: true, step: 'Route details' },
      { key: 'portOfLoading', label: 'Port of loading', type: 'text', step: 'Route details' },
      { key: 'portOfDischarge', label: 'Port of discharge', type: 'text', step: 'Route details' },
      { key: 'productName', label: 'Product name', type: 'text', step: 'Products and values' },
      { key: 'hsCode', label: 'HS code', type: 'text', step: 'Products and values' },
      { key: 'quantity', label: 'Quantity', type: 'number', step: 'Products and values' },
      { key: 'unit', label: 'Unit', type: 'select', options: ['pieces', 'kg', 'sets', 'meters'], step: 'Products and values' },
      { key: 'unitValue', label: 'Unit value', type: 'number', step: 'Products and values' },
    ],
    workflowSteps: ['Shipment details', 'Route details', 'Products and values'],
    keywords: ['customs', 'brokerage', 'hs code', 'duty', 'clearance'],
  },
  {
    key: 'trade-financing',
    title: 'Trade Financing',
    category: 'Trade Finance',
    role: 'both',
    icon: 'cash-multiple',
    image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Apply for PO financing, invoice factoring, supply chain finance, or working capital.',
    description: 'A financing application flow for requested amount, term, financing type, purchase context, and bank account details.',
    startingPrice: 'Rate based',
    duration: '3-10 business days',
    availability: 'Available',
    status: 'Recommended',
    benefits: ['Working capital options', 'Financing application tracking', 'Bank detail capture'],
    features: ['PO and invoice finance types', 'Term and currency selection', 'Processing fee and interest backend logic'],
    documents: ['Purchase order', 'Invoices', 'Bank details', 'Supplier reference'],
    faqs: [{ question: 'What happens after submission?', answer: 'Applications move to submitted and then under review by the financing workflow.' }],
    terms: ['Approval, interest, funded amount, and repayment schedule are determined by backend review.'],
    endpoint: '/api/financing',
    fields: [
      { key: 'type', label: 'Financing type', type: 'select', required: true, options: ['po_financing', 'invoice_factoring', 'supply_chain', 'working_capital'], step: 'Financing details' },
      { key: 'currency', label: 'Currency', type: 'select', required: true, options: ['USD', 'EUR', 'INR'], step: 'Financing details' },
      { key: 'requestedAmount', label: 'Requested amount', type: 'number', required: true, step: 'Financing details' },
      { key: 'termDays', label: 'Term days', type: 'select', options: ['30', '60', '90', '120', '180'], step: 'Financing details' },
      { key: 'purchaseOrderNumber', label: 'Purchase order number', type: 'text', step: 'Supporting information' },
      { key: 'supplierId', label: 'Supplier ID', type: 'text', step: 'Supporting information' },
      { key: 'invoiceNumber', label: 'Invoice number', type: 'text', step: 'Supporting information' },
      { key: 'bankName', label: 'Bank name', type: 'text', step: 'Bank details' },
      { key: 'accountNumber', label: 'Account number', type: 'text', step: 'Bank details' },
      { key: 'accountHolder', label: 'Account holder', type: 'text', step: 'Bank details' },
      { key: 'swiftCode', label: 'SWIFT code', type: 'text', step: 'Bank details' },
    ],
    workflowSteps: ['Financing details', 'Supporting information', 'Bank details'],
    keywords: ['finance', 'loan', 'invoice', 'purchase order', 'capital'],
  },
  {
    key: 'dispute-resolution',
    title: 'Dispute Resolution',
    category: 'Protection',
    role: 'both',
    icon: 'scale-balance',
    image: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'File and track disputes for delivered orders or escrow transactions.',
    description: 'A dispute case workflow for linked orders or escrow transactions, claim details, desired resolution, and status timeline tracking.',
    startingPrice: 'Case based',
    duration: '7-15 business days',
    availability: 'Available',
    status: 'Essential',
    benefits: ['Structured case filing', 'Evidence and timeline tracking', 'Resolution visibility'],
    features: ['Order or escrow transaction selection', 'Dispute type cards', 'Claim and resolution capture'],
    documents: ['Order or escrow reference', 'Evidence links', 'Photos or inspection reports if available'],
    faqs: [{ question: 'Can sellers access disputes?', answer: 'Sellers can access disputes through the API when they are involved as respondents.' }],
    terms: ['Dispute outcomes depend on evidence, transaction terms, and mediation review.'],
    endpoint: '/api/disputes',
    fields: [
      { key: 'transactionType', label: 'Transaction type', type: 'select', required: true, options: ['order', 'escrow'], step: 'Transaction' },
      { key: 'transactionId', label: 'Order or escrow ID', type: 'text', required: true, step: 'Transaction' },
      { key: 'respondentId', label: 'Respondent ID', type: 'text', required: true, step: 'Transaction' },
      { key: 'type', label: 'Dispute type', type: 'select', required: true, options: ['quality', 'delivery', 'payment', 'contract', 'other'], step: 'Dispute details' },
      { key: 'title', label: 'Title', type: 'text', step: 'Dispute details' },
      { key: 'description', label: 'Description', type: 'textarea', required: true, step: 'Dispute details' },
      { key: 'currency', label: 'Currency', type: 'select', options: ['USD', 'INR'], step: 'Resolution' },
      { key: 'claimAmount', label: 'Claim amount', type: 'number', step: 'Resolution' },
      { key: 'desiredResolution', label: 'Desired resolution', type: 'select', options: ['Full refund', 'Partial refund', 'Replacement', 'Compensation', 'Other'], step: 'Resolution' },
    ],
    workflowSteps: ['Transaction', 'Dispute details', 'Resolution'],
    keywords: ['dispute', 'claim', 'refund', 'resolution'],
  },
  {
    key: 'warehousing',
    title: 'Warehousing & Fulfillment',
    category: 'Operations',
    role: 'both',
    icon: 'warehouse',
    image: 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Storage, inventory intake, pick-pack, and fulfillment operations.',
    description: 'Request support for warehousing inventory, receiving, fulfillment, and stock visibility across warehouse locations.',
    startingPrice: 'Rate card',
    duration: '1-3 business days',
    availability: 'Limited',
    status: 'Recommended',
    benefits: ['Organized stock handling', 'Inventory visibility', 'Fulfillment readiness'],
    features: ['SKU and warehouse details', 'Storage type planning', 'Fulfillment support'],
    documents: ['Product list', 'SKU sheet', 'Inbound shipment details'],
    faqs: [{ question: 'Can existing stock be added?', answer: 'Yes, operations can add or increment warehouse inventory records.' }],
    terms: ['Storage and fulfillment fees depend on warehouse, item profile, and service usage.'],
    endpoint: '/api/warehousing',
    fields: [
      { key: 'warehouseId', label: 'Warehouse ID', type: 'text', required: true, step: 'Warehouse' },
      { key: 'sku', label: 'SKU', type: 'text', required: true, step: 'Inventory' },
      { key: 'productName', label: 'Product name', type: 'text', step: 'Inventory' },
      { key: 'quantity', label: 'Quantity', type: 'number', required: true, step: 'Inventory' },
      { key: 'unitValue', label: 'Unit value', type: 'number', step: 'Inventory' },
      { key: 'storageType', label: 'Storage type', type: 'select', options: ['standard', 'climate_controlled', 'cold_storage', 'hazardous', 'high_value'], step: 'Storage details' },
      { key: 'notes', label: 'Notes', type: 'textarea', step: 'Storage details' },
    ],
    workflowSteps: ['Warehouse', 'Inventory', 'Storage details'],
    keywords: ['warehouse', 'inventory', 'storage', 'fulfillment'],
  },
  {
    key: 'trade-assurance',
    title: 'Trade Assurance',
    category: 'Protection',
    role: 'both',
    icon: 'file-shield-outline',
    image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Order protection coverage for delivery, quality, and claim tracking.',
    description: 'Review and request support for order-level protection coverage and trade assurance activation.',
    startingPrice: 'Included on eligible orders',
    duration: 'Order based',
    availability: 'Available',
    status: 'Essential',
    benefits: ['Order protection visibility', 'Claim readiness', 'Linked inspections and shipping'],
    features: ['Coverage tracking', 'Order linking', 'Status-based progress'],
    documents: ['Order number', 'Quality specifications', 'Expected delivery details'],
    faqs: [{ question: 'Where do I activate it?', answer: 'Protection is activated from eligible order flows.' }],
    terms: ['Coverage depends on order eligibility and platform review.'],
    fields: [
      ...genericContactFields,
      { key: 'orderId', label: 'Order ID', type: 'text', required: true },
      { key: 'qualityStandards', label: 'Quality standards', type: 'textarea' },
      { key: 'details', label: 'Protection request details', type: 'textarea', required: true },
    ],
    workflowSteps: ['Order selection', 'Coverage details', 'Review request'],
    keywords: ['protection', 'assurance', 'claim', 'order'],
  },
  {
    key: 'supplier-verification',
    title: 'Supplier Verification',
    category: 'Verification',
    role: 'buyer',
    icon: 'account-search-outline',
    image: 'https://images.unsplash.com/photo-1560264280-88b68371db39?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Ask operations to verify supplier documents and company credentials.',
    description: 'A buyer-facing verification request for checking supplier companies, trading documents, registration records, and credibility signals.',
    startingPrice: 'Quote based',
    duration: '3-7 business days',
    availability: 'Available',
    status: 'Popular',
    benefits: ['Supplier credibility review', 'Document checklist guidance', 'Central request tracking'],
    features: ['Company and contact capture', 'Document links', 'Review history'],
    documents: ['Supplier license', 'Registration certificate', 'Tax documents', 'Website or profile link'],
    faqs: [{ question: 'Is this seller onboarding?', answer: 'No. Seller onboarding is handled in the seller verification module.' }],
    terms: ['Verification is based on documents and reachable public or partner records.'],
    fields: [
      ...genericContactFields,
      { key: 'supplierName', label: 'Supplier name', type: 'text', required: true },
      { key: 'details', label: 'What should be verified?', type: 'textarea', required: true },
      ...documentFields,
    ],
    workflowSteps: ['Supplier details', 'Verification scope', 'Documents'],
    keywords: ['supplier', 'verification', 'company', 'documents'],
  },
  {
    key: 'seller-verification',
    title: 'Business Verification',
    category: 'Verification',
    role: 'seller',
    icon: 'check-decagram-outline',
    image: 'https://images.unsplash.com/photo-1560472355-536de3962603?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Complete seller company setup, document upload, and verification review.',
    description: 'A guided seller verification path for company details, business address, GST/PAN, and verification document submission.',
    startingPrice: 'Included',
    duration: '2-5 business days',
    availability: 'Available',
    status: 'Essential',
    benefits: ['Build buyer trust', 'Unlock seller workflows', 'Track review status'],
    features: ['Draft autosave', 'Document replacement', 'Verification status'],
    documents: ['GST certificate', 'PAN card', 'Business registration', 'Address proof', 'Bank statement'],
    faqs: [{ question: 'Can I update later?', answer: 'Yes, profile and documents can be updated from seller onboarding.' }],
    terms: ['Documents are reviewed by the verification team and may require additional information.'],
    endpoint: '/api/seller/onboarding',
    fields: [
      { key: 'companyName', label: 'Company name', type: 'text', required: true },
      { key: 'companyType', label: 'Company type', type: 'select', required: true, options: ['manufacturer', 'wholesaler', 'distributor', 'trader', 'exporter', 'other'] },
      { key: 'businessEmail', label: 'Business email', type: 'email', required: true },
      { key: 'businessPhone', label: 'Business phone', type: 'phone', required: true },
      { key: 'street', label: 'Street address', type: 'text', required: true },
      { key: 'city', label: 'City', type: 'text', required: true },
      { key: 'state', label: 'State', type: 'text', required: true },
      { key: 'country', label: 'Country', type: 'text', required: true },
      { key: 'pincode', label: 'Pincode', type: 'text', required: true },
    ],
    workflowSteps: ['Company information', 'Business address', 'Verification review'],
    keywords: ['seller', 'business', 'verification', 'documents'],
  },
  {
    key: 'documentation-support',
    title: 'Documentation Support',
    category: 'Compliance',
    role: 'both',
    icon: 'file-document-edit-outline',
    image: 'https://images.unsplash.com/photo-1554224154-26032ffc0d07?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Trade document preparation and compliance support.',
    description: 'Get operational help with invoices, packing lists, certificates, shipping paperwork, and import/export documentation.',
    startingPrice: 'Quote based',
    duration: '1-4 business days',
    availability: 'Available',
    status: 'Popular',
    benefits: ['Reduce documentation gaps', 'Order and shipment context', 'Status tracking'],
    features: ['Document URL capture', 'Priority handling', 'Request history'],
    documents: ['Existing invoice', 'Packing list', 'Order or shipment reference'],
    faqs: [{ question: 'Can I upload files?', answer: 'This mobile flow accepts secure document links for now.' }],
    terms: ['Advice is operational support and does not replace licensed legal or tax counsel.'],
    fields: [...genericContactFields, { key: 'details', label: 'Document support needed', type: 'textarea', required: true }, ...documentFields],
    workflowSteps: ['Contact details', 'Document requirements', 'Document links'],
    keywords: ['documents', 'invoice', 'compliance', 'export'],
  },
  {
    key: 'consulting',
    title: 'Trade Consulting',
    category: 'Advisory',
    role: 'both',
    icon: 'account-tie-outline',
    image: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Expert guidance for sourcing, logistics, compliance, and market entry.',
    description: 'Book advisory support for sourcing strategy, supplier comparisons, compliance planning, logistics decisions, and trade operations.',
    startingPrice: 'Quote based',
    duration: '1-5 business days',
    availability: 'Available',
    status: 'Recommended',
    benefits: ['Practical B2B guidance', 'Role-aware support', 'Clear next steps'],
    features: ['Consulting topic capture', 'Timeline and priority', 'Operations follow-up'],
    documents: ['Product brief', 'Target market notes', 'Current supplier details'],
    faqs: [{ question: 'Who responds?', answer: 'The relevant EsyGlob operations or advisory team follows up.' }],
    terms: ['Recommendations depend on the completeness of information provided.'],
    fields: [...genericContactFields, { key: 'subject', label: 'Consulting topic', type: 'text' }, { key: 'details', label: 'What do you need help with?', type: 'textarea', required: true }, ...documentFields],
    workflowSteps: ['Contact details', 'Consulting topic', 'Supporting context'],
    keywords: ['consulting', 'advisory', 'strategy', 'sourcing'],
  },
  {
    key: 'insurance',
    title: 'Insurance Services',
    category: 'Risk',
    role: 'both',
    icon: 'umbrella-outline',
    image: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Cargo, shipment, and trade-risk insurance assistance.',
    description: 'Request insurance support for cargo value, shipment routes, delivery terms, and trade risk coverage.',
    startingPrice: 'Quote based',
    duration: '1-3 business days',
    availability: 'Available',
    status: 'New',
    benefits: ['Coverage guidance', 'Shipment value capture', 'Risk-aware support'],
    features: ['Route and value details', 'Coverage type request', 'Document links'],
    documents: ['Invoice', 'Shipment route', 'Cargo description'],
    faqs: [{ question: 'Is a quote guaranteed?', answer: 'Quotes depend on cargo, route, and partner availability.' }],
    terms: ['Final policy terms are issued by insurance partners.'],
    fields: [
      ...genericContactFields,
      { key: 'shipmentValue', label: 'Shipment value', type: 'number' },
      { key: 'route', label: 'Shipment route', type: 'text' },
      { key: 'details', label: 'Coverage requirements', type: 'textarea', required: true },
      ...documentFields,
    ],
    workflowSteps: ['Contact details', 'Coverage requirements', 'Document links'],
    keywords: ['insurance', 'cargo', 'risk', 'coverage'],
  },
  {
    key: 'market-analytics',
    title: 'Market Analytics',
    category: 'Insights',
    role: 'both',
    icon: 'chart-line',
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Category insights, price trends, and supplier intelligence.',
    description: 'The web protected service entry redirects users into the Market Insights dashboard. The mobile service card mirrors that behavior as an informational entry rather than creating a duplicate request workflow.',
    startingPrice: 'Included',
    duration: 'Instant insights',
    availability: 'Available',
    status: 'Recommended',
    benefits: ['Market trend visibility', 'Supplier intelligence', 'Category research support'],
    features: ['Insights dashboard entry', 'Role-aware service visibility', 'No duplicate service request'],
    documents: ['No documents required'],
    faqs: [{ question: 'Can this be booked?', answer: 'No. The web service redirects to Market Insights instead of creating a service request.' }],
    terms: ['Insights availability depends on marketplace data and account permissions.'],
    fields: [],
    workflowSteps: ['Open Market Insights'],
    bookable: false,
    unavailableReason: 'This service opens the Market Insights dashboard in the web app and does not use a protected booking API.',
    keywords: ['market', 'analytics', 'insights', 'trends', 'supplier intelligence'],
  },
  {
    key: 'tax-calculator',
    title: 'Tax Calculator',
    category: 'Compliance',
    role: 'both',
    icon: 'calculator-variant-outline',
    image: 'https://images.unsplash.com/photo-1554224155-1696413565d3?auto=format&fit=crop&w=1200&q=80',
    shortDescription: 'Global tax and trade cost estimates.',
    description: 'The web service center links to the public tax calculator rather than a protected dashboard module. Mobile keeps this as a service detail entry without duplicating public calculator logic.',
    startingPrice: 'Free tool',
    duration: 'Instant estimate',
    availability: 'Available',
    status: 'New',
    benefits: ['Trade cost estimation', 'Tax planning support', 'No service request required'],
    features: ['Public calculator parity', 'Buyer and seller visibility', 'No backend duplication'],
    documents: ['No documents required'],
    faqs: [{ question: 'Why is there no booking form?', answer: 'The protected dashboard service center opens the public calculator; it does not create a service booking.' }],
    terms: ['Calculator results are estimates and should be verified before commercial decisions.'],
    fields: [],
    workflowSteps: ['Open calculator'],
    bookable: false,
    unavailableReason: 'This item is a public calculator link in the web app, not a protected service booking flow.',
    keywords: ['tax', 'calculator', 'duties', 'cost', 'estimate'],
  },
];

export function getServicesForRole(role?: string | null) {
  const resolved = role === 'seller' ? 'seller' : 'buyer';
  return servicesCatalog.filter(service => service.role === 'both' || service.role === resolved);
}

export function getServiceByKey(key: string) {
  return servicesCatalog.find(service => service.key === key || service.key.replace(/-/g, '_') === key);
}

export async function fetchServiceRequests(params: { role?: string; serviceKey?: string; status?: string; page?: number; limit?: number } = {}): Promise<ServiceRequestList> {
  const payload = await apiRequest('/api/services', { query: { limit: 50, ...params } });
  const data = unwrapData<{ requests?: ServiceRequest[]; pagination?: Pagination }>(payload);

  return {
    requests: data?.requests ?? normalizeList<ServiceRequest>(payload, ['requests', 'items', 'results']),
    pagination: data?.pagination,
  };
}

export async function fetchServiceRequestDetails(requestId: string): Promise<ServiceRequest> {
  const payload = await apiRequest(`/api/services/${requestId}`);
  const data = unwrapData<{ request?: ServiceRequest } | ServiceRequest>(payload);
  return (data && typeof data === 'object' && 'request' in data ? data.request : data) as ServiceRequest;
}

export async function fetchShipments(params: { status?: string; type?: string; page?: number; limit?: number } = {}) {
  const payload = await apiRequest('/api/shipping', { query: { limit: 50, ...params } });
  const data = unwrapData<{ shipments?: ShippingOrder[]; pagination?: Pagination }>(payload);

  return {
    shipments: data?.shipments ?? normalizeList<ShippingOrder>(payload, ['shipments', 'orders', 'items']),
    pagination: data?.pagination,
  };
}

export async function createServiceBooking(service: ServiceCatalogItem, role: string, values: Record<string, string>) {
  const normalizedRole = role === 'seller' ? 'seller' : 'buyer';
  const sellerUsesGenericRequest = normalizedRole === 'seller' && service.key !== 'seller-verification';

  if (sellerUsesGenericRequest) {
    return createGenericServiceRequest(service, normalizedRole, values);
  }

  if (service.key === 'shipping') {
    return createShipping(values);
  }

  if (service.key === 'quality-inspection') {
    return createInspection(values);
  }

  if (service.key === 'escrow') {
    return createEscrow(values);
  }

  if (service.key === 'customs-brokerage') {
    return createCustoms(values);
  }

  if (service.key === 'trade-financing') {
    return createFinancing(values);
  }

  if (service.key === 'dispute-resolution') {
    return createDispute(values);
  }

  if (service.key === 'warehousing') {
    return createWarehouseInventory(values);
  }

  if (service.key === 'seller-verification') {
    return apiRequest('/api/seller/onboarding', {
      method: 'POST',
      body: {
        companyName: values.companyName,
        companyType: values.companyType,
        businessEmail: values.businessEmail,
        businessPhone: values.businessPhone,
        address: {
          street: values.street,
          city: values.city,
          state: values.state,
          country: values.country,
          pincode: values.pincode,
        },
      },
    });
  }

  return createGenericServiceRequest(service, normalizedRole, values);
}

async function createGenericServiceRequest(service: ServiceCatalogItem, role: string, values: Record<string, string>) {
  const documents = values.documentUrl
    ? [{ name: values.documentName || 'Document', url: values.documentUrl }]
    : [];
  const details = values.details || values.specialRequirements || values.description || values.subject || service.title;

  const payload = await apiRequest('/api/services', {
    method: 'POST',
    body: {
      role: role === 'seller' ? 'seller' : 'buyer',
      serviceKey: service.key,
      originalServiceKey: service.key,
      serviceTitle: service.title,
      companyName: values.companyName,
      contactName: values.contactName,
      contactEmail: values.contactEmail,
      contactPhone: values.contactPhone,
      subject: values.subject || service.title,
      details,
      priority: 'normal',
      requirements: values,
      documents,
    },
  });

  return unwrapData(payload);
}

async function createShipping(values: Record<string, string>) {
  const payload = await apiRequest('/api/shipping', {
    method: 'POST',
    body: {
      type: values.type,
      pickup: { address: values.pickupAddress },
      delivery: { address: values.deliveryAddress },
      packages: [{
        description: values.packageDescription,
        quantity: Number(values.quantity || 1),
        weight: Number(values.weight || 0),
      }],
      insurance: { isInsured: false },
      specialInstructions: values.specialInstructions,
    },
  });
  return unwrapData(payload);
}

async function createInspection(values: Record<string, string>) {
  const payload = await apiRequest('/api/inspections', {
    method: 'POST',
    body: {
      type: values.type,
      supplierName: values.supplierName,
      factoryName: values.factoryName,
      factoryAddress: values.factoryAddress,
      contactPerson: values.contactPerson,
      contactPhone: values.contactPhone,
      requestedDate: values.requestedDate,
      standard: values.standard,
      specialRequirements: values.specialRequirements,
      products: [{ name: values.supplierName || 'Inspection product', quantity: 1 }],
    },
  });
  return unwrapData(payload);
}

async function createEscrow(values: Record<string, string>) {
  const payload = await apiRequest('/api/escrow', {
    method: 'POST',
    body: {
      sellerId: values.sellerId,
      orderId: values.orderId || undefined,
      amount: Number(values.amount || 0),
      currency: values.currency || 'USD',
      paymentMethod: values.paymentMethod || 'bank_transfer',
      description: values.description,
      terms: values.terms,
      milestones: [{ title: 'Release on completion', percentage: 100, condition: values.terms || 'Buyer approval' }],
      inspectionPeriod: 7,
    },
  });
  return unwrapData(payload);
}

async function createCustoms(values: Record<string, string>) {
  const quantity = Number(values.quantity || 1);
  const unitValue = Number(values.unitValue || 0);
  const payload = await apiRequest('/api/customs', {
    method: 'POST',
    body: {
      type: values.type,
      carrier: values.carrier,
      trackingNumber: values.trackingNumber,
      originCountry: values.originCountry,
      destinationCountry: values.destinationCountry,
      portOfLoading: values.portOfLoading,
      portOfDischarge: values.portOfDischarge,
      products: [{
        name: values.productName || 'Product',
        hsCode: values.hsCode,
        originCountry: values.originCountry,
        quantity,
        unit: values.unit || 'pieces',
        unitValue,
        totalValue: quantity * unitValue,
      }],
      documents: [],
    },
  });
  return unwrapData(payload);
}

async function createFinancing(values: Record<string, string>) {
  const payload = await apiRequest('/api/financing', {
    method: 'POST',
    body: {
      type: values.type,
      requestedAmount: Number(values.requestedAmount || 0),
      currency: values.currency || 'USD',
      termDays: Number(values.termDays || 90),
      supplierId: values.supplierId || undefined,
      purchaseOrder: {
        orderNumber: values.purchaseOrderNumber,
        amount: Number(values.requestedAmount || 0),
        currency: values.currency || 'USD',
      },
      invoices: values.invoiceNumber ? [{ invoiceNumber: values.invoiceNumber, amount: Number(values.requestedAmount || 0) }] : [],
      documents: [],
      bankAccount: {
        bankName: values.bankName,
        accountNumber: values.accountNumber,
        accountHolder: values.accountHolder,
        swiftCode: values.swiftCode,
      },
    },
  });
  return unwrapData(payload);
}

async function createDispute(values: Record<string, string>) {
  const payload = await apiRequest('/api/disputes', {
    method: 'POST',
    body: {
      respondentId: values.respondentId,
      transactionType: values.transactionType,
      transactionId: values.transactionId,
      type: values.type,
      title: values.title,
      description: values.description,
      desiredResolution: values.desiredResolution,
      claimAmount: Number(values.claimAmount || 0),
      currency: values.currency || 'USD',
      evidence: [],
    },
  });
  return unwrapData(payload);
}

async function createWarehouseInventory(values: Record<string, string>) {
  const payload = await apiRequest('/api/warehousing', {
    method: 'POST',
    body: {
      action: 'add_inventory',
      warehouseId: values.warehouseId,
      sku: values.sku,
      productName: values.productName,
      quantity: Number(values.quantity || 0),
      unitValue: Number(values.unitValue || 0),
      storageType: values.storageType || 'standard',
      notes: values.notes,
    },
  });
  return unwrapData(payload);
}

export async function fetchAggregatedServiceActivity(role?: string | null): Promise<ServiceRequest[]> {
  const normalizedRole = role === 'seller' ? 'seller' : 'buyer';
  const calls = [
    fetchServiceRequests({ role: normalizedRole, limit: 30 }).then(result => result.requests),
    apiRequest('/api/shipping', { query: { limit: 10 } }).then(payload => normalizeList<ServiceRequest>(payload, ['shipments'])).catch(() => []),
    apiRequest('/api/escrow', { query: { limit: 10 } }).then(payload => normalizeList<ServiceRequest>(payload, ['transactions'])).catch(() => []),
    apiRequest('/api/inspections', { query: { limit: 10 } }).then(payload => normalizeList<ServiceRequest>(payload, ['inspections'])).catch(() => []),
    apiRequest('/api/customs', { query: { limit: 10 } }).then(payload => normalizeList<ServiceRequest>(payload, ['clearances'])).catch(() => []),
    apiRequest('/api/financing', { query: { limit: 10 } }).then(payload => normalizeList<ServiceRequest>(payload, ['applications'])).catch(() => []),
    apiRequest('/api/disputes', { query: { limit: 10 } }).then(payload => normalizeList<ServiceRequest>(payload, ['disputes'])).catch(() => []),
    apiRequest('/api/trade-assurance', { query: { limit: 10 } }).then(payload => normalizeList<ServiceRequest>(payload, ['assurances'])).catch(() => []),
    apiRequest('/api/warehousing', { query: { type: 'inventory', limit: 10 } }).then(payload => normalizeList<ServiceRequest>(payload, ['inventory'])).catch(() => []),
  ];
  const settled = await Promise.allSettled(calls);

  return settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}
