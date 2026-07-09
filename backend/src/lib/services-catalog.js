export function listServices() {
  return [
    {
      key: 'shipping',
      title: 'Shipping & Logistics',
      description: 'End-to-end shipping solutions including sea freight, air freight, and courier services',
      requirements: ['Product ready for shipping', 'Destination details'],
      benefits: ['Door-to-door delivery', 'Real-time tracking', 'Competitive rates'],
    },
    {
      key: 'trade-assurance',
      title: 'Trade Assurance',
      description: 'Payment protection service that safeguards your orders from payment to delivery',
      requirements: ['Order placed through EsyGlob'],
      benefits: ['Payment protection', 'Quality guarantee', 'On-time delivery guarantee'],
    },
    {
      key: 'escrow',
      title: 'Escrow Service',
      description: 'Secure payment holding until order confirmation and delivery verification',
      requirements: ['Agreed terms between buyer and seller'],
      benefits: ['Secure transactions', 'Dispute resolution', 'Fraud prevention'],
    },
    {
      key: 'quality-inspection',
      title: 'Quality Inspection',
      description: 'Third-party quality inspection services for products before shipment',
      requirements: ['Product specifications', 'Inspection criteria'],
      benefits: ['Quality assurance', 'Compliance verification', 'Defect reduction'],
    },
    {
      key: 'supplier-verification',
      title: 'Supplier Verification',
      description: 'Comprehensive supplier background checks and business verification',
      requirements: ['Business registration documents', 'Tax identification', 'Address proof'],
      benefits: ['Trusted suppliers', 'Reduced risk', 'Verified credentials'],
    },
    {
      key: 'warehousing',
      title: 'Warehousing',
      description: 'Secure storage and inventory management solutions',
      requirements: ['Inventory details', 'Storage duration'],
      benefits: ['Secure storage', 'Inventory management', 'Order fulfillment'],
    },
    {
      key: 'trade-financing',
      title: 'Trade Financing',
      description: 'Financing solutions for importers and exporters to manage cash flow',
      requirements: ['Business financials', 'Order details'],
      benefits: ['Working capital', 'Flexible repayment', 'Competitive rates'],
    },
    {
      key: 'customs-brokerage',
      title: 'Customs Brokerage',
      description: 'Professional customs clearance and documentation services',
      requirements: ['Shipping documents', 'Product classification'],
      benefits: ['Faster clearance', 'Compliance assurance', 'Duty optimization'],
    },
    {
      key: 'dispute-resolution',
      title: 'Dispute Resolution',
      description: 'Mediation and resolution services for trade disputes',
      requirements: ['Order documentation', 'Evidence of issue'],
      benefits: ['Fair resolution', 'Expert mediation', 'Time-efficient'],
    },
    {
      key: 'market-analytics',
      title: 'Market Analytics',
      description: 'Data-driven insights on market trends, demand, and competition',
      requirements: ['Product category interest'],
      benefits: ['Informed decisions', 'Market intelligence', 'Trend analysis'],
    },
    {
      key: 'documentation-support',
      title: 'Documentation Support',
      description: 'Assistance with export/import documentation and compliance',
      requirements: ['Transaction details'],
      benefits: ['Complete documentation', 'Regulatory compliance', 'Error reduction'],
    },
    {
      key: 'consulting',
      title: 'Trade Consulting',
      description: 'Expert consulting for international trade strategy and operations',
      requirements: ['Business objectives'],
      benefits: ['Strategic guidance', 'Market entry support', 'Risk assessment'],
    },
    {
      key: 'tax-calculator',
      title: 'Tax Calculator',
      description: 'Calculate import duties, taxes, and landed costs for your shipments',
      requirements: ['Product HS code', 'Product value', 'Origin and destination'],
      benefits: ['Accurate cost estimation', 'Budget planning', 'Duty optimization'],
    },
  ];
}

export default listServices;