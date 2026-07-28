import {
  Activity, BadgeCheck, Boxes, CreditCard, FolderTree, Gift, PackageCheck, Store, Tag, Users,
} from 'lucide-react'

export const resources = {
  users: {
    title: 'Users', description: 'Buyer, seller and administrator accounts.', icon: Users,
    search: 'Search name, email or phone',
    columns: [
      ['User', (row) => row.fullName || row.email, 'fullName'],
      ['Email', 'email'], ['Role', (row) => row.roles?.join(', '), 'createdAt'], ['Status', (row) => row.isBanned ? 'suspended' : row.isActive ? 'active' : 'inactive', 'isActive'], ['Joined', 'createdAt'],
    ],
    fields: [['fullName', 'Full name'], ['phone', 'Phone'], ['roles', 'Roles (comma separated)'], ['primaryRole', 'Primary role', 'select', ['buyer', 'seller', 'admin']], ['isActive', 'Active', 'boolean'], ['isBanned', 'Suspended', 'boolean'], ['banReason', 'Suspension reason', 'textarea']],
  },
  sellers: {
    title: 'Sellers', description: 'Supplier and manufacturer business accounts.', icon: Store,
    search: 'Search company or business contact',
    columns: [['Company', 'companyName'], ['Type', 'companyType'], ['Country', 'country'], ['Status', (row) => row.status || (row.isVerified ? 'verified' : 'pending')], ['Updated', 'updatedAt']],
    fields: [['companyName', 'Company name'], ['companyType', 'Business type', 'select', ['manufacturer', 'wholesaler', 'distributor', 'trader', 'exporter', 'other']], ['businessEmail', 'Business email'], ['businessPhone', 'Business phone'], ['address', 'Business address', 'address'], ['country', 'Country'], ['city', 'City'], ['isVerified', 'Verified', 'boolean']],
  },
  verifications: {
    title: 'Seller verification', description: 'Review business evidence, factories and trust signals.', icon: BadgeCheck,
    search: 'Search legal name, GST, PAN or status',
    columns: [['Company', (row) => row.sellerId?.companyName || row.businessInfo?.legalName || 'Seller application', 'submittedAt'], ['Status', 'status'], ['Documents', (row) => row.documents?.length || 0, 'submittedAt'], ['Trust score', (row) => row.overallTrustScore || 0, 'submittedAt'], ['Submitted', (row) => row.submittedAt || row.createdAt, 'submittedAt']],
    fields: [['status', 'Decision', 'select', ['under_review', 'approved', 'rejected', 'additional_information_required', 'reverification_required', 'factory_inspection_scheduled']], ['internalNote', 'Internal admin note', 'textarea'], ['sellerFeedback', 'Seller-visible feedback', 'textarea'], ['inspectionScheduledAt', 'Inspection date', 'datetime-local']],
  },
  products: {
    title: 'Products', description: 'Catalog moderation, pricing and visibility.', icon: Boxes,
    search: 'Search products, categories or brands',
    bulkStatuses: ['published', 'paused', 'pending_review'],
    columns: [['Product', 'name'], ['Supplier', (row) => row.sellerId?.companyName || '—', 'createdAt'], ['Price', (row) => money(row.price, row.currency), 'price'], ['MOQ', (row) => `${row.minimumOrderQuantity || 1} ${row.unit || 'pcs'}`, 'minimumOrderQuantity'], ['Status', (row) => row.status || (row.isActive ? 'active' : 'inactive'), 'status']],
    fields: [['name', 'Product name'], ['price', 'Price', 'number'], ['currency', 'Currency'], ['minimumOrderQuantity', 'MOQ', 'number'], ['unit', 'Unit'], ['status', 'Status', 'select', ['draft', 'pending_review', 'active', 'published', 'paused', 'rejected']], ['isActive', 'Active', 'boolean']],
  },
  categories: {
    title: 'Categories', description: 'Marketplace taxonomy, icons and SEO metadata.', icon: FolderTree,
    search: 'Search categories',
    canCreate: true,
    required: ['name', 'slug'],
    bulkStatuses: ['active', 'inactive'],
    columns: [['Category', 'name'], ['Slug', 'slug'], ['Featured', (row) => row.metadata?.isFeatured ? 'yes' : 'no'], ['Status', (row) => row.isActive ? 'active' : 'inactive'], ['Updated', 'updatedAt']],
    fields: [['name', 'Name'], ['slug', 'Slug'], ['description', 'Description', 'textarea'], ['image', 'Image URL'], ['icon', 'Icon'], ['metadata.title', 'SEO title'], ['metadata.keywords', 'SEO keywords'], ['metadata.sortOrder', 'Sort order', 'number'], ['metadata.isFeatured', 'Featured', 'boolean'], ['isActive', 'Active', 'boolean']],
  },
  orders: {
    title: 'Orders', description: 'Trade orders, fulfillment and operational status.', icon: PackageCheck,
    search: 'Search order number or status',
    columns: [['Order', 'orderNumber'], ['Buyer', (row) => row.buyerId?.fullName || row.buyerId?.email || '—', 'createdAt'], ['Seller', (row) => row.sellerId?.companyName || '—', 'createdAt'], ['Total', (row) => money(row.totalAmount || row.grandTotal, row.currency), 'totalAmount'], ['Status', 'status'], ['Created', 'createdAt']],
    fields: [['status', 'Order status', 'select', ['pending', 'confirmed', 'processing', 'production', 'ready_to_ship', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded', 'disputed']], ['paymentStatus', 'Payment status'], ['shippingStatus', 'Shipping status'], ['adminNotes', 'Admin notes', 'textarea']],
  },
  payments: {
    title: 'Payments', description: 'Transactions, gateways, failures and refunds.', icon: CreditCard,
    search: 'Search payment or transaction reference',
    columns: [['Payment', 'paymentNumber'], ['Customer', (row) => row.userId?.fullName || row.userId?.email || '—', 'createdAt'], ['Amount', (row) => money(row.amount, row.currency), 'amount'], ['Gateway', (row) => row.gateway || row.paymentMethod, 'createdAt'], ['Status', 'status'], ['Created', 'createdAt']],
    fields: [['status', 'Payment status', 'select', ['initiated', 'pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled']], ['adminNotes', 'Admin notes', 'textarea']],
  },
  coupons: {
    title: 'Coupons', description: 'Campaign schedules, restrictions and usage.', icon: Tag,
    search: 'Search coupon code or campaign',
    canCreate: true,
    required: ['code', 'name', 'discountType', 'value', 'currency', 'scope'],
    columns: [['Code', 'code'], ['Campaign', 'name'], ['Discount', (row) => row.discountType === 'percentage' ? `${row.value}%` : money(row.value, row.currency), 'value'], ['Usage', 'redemptionCount'], ['Status', 'status'], ['Expires', 'expiresAt']],
    fields: [['code', 'Coupon code'], ['name', 'Campaign name'], ['description', 'Description', 'textarea'], ['campaignType', 'Campaign type', 'select', ['standard', 'limited_time', 'festival', 'referral', 'first_order', 'subscription']], ['discountType', 'Discount type', 'select', ['percentage', 'fixed_amount', 'free_shipping']], ['value', 'Discount value', 'number'], ['maximumDiscount', 'Maximum discount', 'number'], ['currency', 'Currency'], ['scope', 'Scope', 'select', ['platform', 'product', 'category', 'seller', 'manufacturer', 'subscription']], ['productIds', 'Product IDs (comma separated)'], ['categoryIds', 'Category IDs (comma separated)'], ['sellerIds', 'Seller IDs (comma separated)'], ['manufacturerIds', 'Manufacturer IDs (comma separated)'], ['countryCodes', 'Allowed countries'], ['currencyCodes', 'Allowed currencies'], ['minimumOrderValue', 'Minimum order', 'number'], ['usageLimit', 'Total usage limit', 'number'], ['perUserUsageLimit', 'Per-user limit', 'number'], ['priority', 'Priority', 'number'], ['firstOrderOnly', 'First order only', 'boolean'], ['referralOnly', 'Referral only', 'boolean'], ['stackable', 'Stackable', 'boolean'], ['stackGroup', 'Stack group'], ['status', 'Status', 'select', ['draft', 'active', 'inactive', 'expired']], ['startsAt', 'Starts', 'datetime-local'], ['expiresAt', 'Expires', 'datetime-local']],
  },
  'gift-cards': {
    title: 'Gift cards', description: 'Issued balances, redemption and card lifecycle.', icon: Gift,
    search: 'Search card suffix, label or recipient',
    canCreate: true,
    required: ['amount', 'currency'],
    columns: [['Card', (row) => `•••• ${row.codeLast4}`, 'createdAt'], ['Label', 'label'], ['Recipient', 'recipientEmail'], ['Balance', (row) => money(row.balance, row.currency), 'balance'], ['Status', 'status'], ['Created', 'createdAt']],
    fields: [['label', 'Label'], ['amount', 'Value', 'number'], ['currency', 'Currency'], ['recipientEmail', 'Recipient email'], ['status', 'Status', 'select', ['active', 'inactive', 'depleted', 'expired', 'cancelled']], ['expiresAt', 'Expiry', 'datetime-local']],
  },
  activities: {
    title: 'Activity log', description: 'Immutable record of sensitive administrator actions.', icon: Activity,
    search: 'Search action, resource, summary or reason',
    columns: [['Action', 'action'], ['Resource', 'resource'], ['Administrator', (row) => row.actorId?.fullName || row.actorId?.email || 'Administrator'], ['Summary', 'summary'], ['Date', 'createdAt']],
    fields: [],
    readOnly: true,
  },
}

export const navGroups = [
  ['Overview', [['Dashboard', '/dashboard']]],
  ['Marketplace', [['Users', '/users'], ['Sellers', '/sellers'], ['Seller verification', '/verifications'], ['Products', '/products'], ['Categories', '/categories']]],
  ['Commerce', [['Orders', '/orders'], ['Payments', '/payments'], ['Coupons', '/coupons'], ['Gift cards', '/gift-cards']]],
  ['System', [['Activity log', '/activities']]],
]

function money(value, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 2 }).format(Number(value || 0))
}
