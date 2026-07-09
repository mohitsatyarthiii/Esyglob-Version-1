// Automated platform services attached to every order
export const AUTOMATED_PLATFORM_SERVICES = [
  {
    key: 'buyer_protection',
    label: 'Buyer Protection',
    description: 'Basic buyer protection for sample orders',
    automated: true,
    included: true,
  },
  {
    key: 'secure_payment',
    label: 'Secure Payment',
    description: 'Payment processed through secure gateway',
    automated: true,
    included: true,
  },
  {
    key: 'order_tracking',
    label: 'Order Tracking',
    description: 'Track your order status',
    automated: true,
    included: true,
  },
  {
    key: 'shipment_tracking',
    label: 'Shipment Tracking',
    description: 'Real-time shipment tracking',
    automated: true,
    included: true,
  },
  {
    key: 'gst_invoice',
    label: 'GST Invoice',
    description: 'Automated GST-compliant invoice',
    automated: true,
    included: true,
  },
  {
    key: 'document_automation',
    label: 'Document Automation',
    description: 'Auto-generated shipping and compliance documents',
    automated: true,
    included: true,
  },
];

/**
 * Build automated order services configuration
 */
export function buildAutomatedOrderServices({ quote, seller, product, logisticsOption } = {}) {
  const logistics = logisticsOption || quote?.selectedLogistics || null;

  return {
    platformServices: AUTOMATED_PLATFORM_SERVICES.map(service => ({
      ...service,
      automated: true,
      providerKey:
        service.key === 'shipment_tracking' || service.key === 'order_tracking'
          ? logistics?.providerKey || 'manual'
          : 'platform',
      attachedAt: new Date(),
    })),
    tradeAssurance: {
      isProtected: true,
      enabled: true,
      coverageAmount: Number(quote?.productTotal || 0),
      terms: 'Automatic EsyGlob Trade Assurance applies after order placement.',
    },
    logistics: {
      selected: logistics
        ? {
            key: logistics.key,
            label: logistics.label,
            mode: logistics.mode,
            incoterm: logistics.incoterm,
            eta: logistics.eta,
            providerKey: logistics.providerKey,
            amount: logistics.amount,
          }
        : null,
      internalBreakdown: logistics?.internalBreakdown || {},
    },
    compliance: {
      sellerVerified: Boolean(seller?.isVerified || seller?.isTrustedSeller),
      productStatus: product?.status || '',
      riskStatus: 'screened',
      fraudStatus: 'screened',
      taxStatus: 'calculated',
      paymentValidation: 'required',
    },
    documentsRequired: [
      'gst_invoice',
      'purchase_order',
      'packing_list',
      'shipping_documents',
      'tracking_details',
    ],
  };
}