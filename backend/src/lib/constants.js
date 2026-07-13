export const USER_ROLES = {
  BUYER: 'buyer',
  SELLER: 'seller',
  ADMIN: 'admin',
};

const ROLE_ALIASES = {
  supplier: USER_ROLES.SELLER,
};

export function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return ROLE_ALIASES[value] || value;
}

export function normalizeRoles(roles = []) {
  const normalized = Array.isArray(roles)
    ? roles.map(normalizeRole).filter(Boolean)
    : [normalizeRole(roles)].filter(Boolean);

  return [...new Set(normalized)];
}

export function hasRole(userOrRoles, role) {
  const roles = Array.isArray(userOrRoles) ? userOrRoles : userOrRoles?.roles;
  return normalizeRoles(roles).includes(normalizeRole(role));
}



// Seller Verification Status
export const SELLER_STATUS = {
  PENDING: 'pending',
  DOCUMENT_SUBMITTED: 'document_submitted',
  DOCUMENT_REVIEW: 'document_review',
  INFO_REQUESTED: 'info_requested',
  MANUAL_VERIFICATION: 'manual_verification',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
};

export const VERIFICATION_LEVELS = {
  NONE: 0,
  LEVEL_1: 1,
  LEVEL_2: 2,
  FACTORY_VERIFIED: 3,
  PREMIUM_VERIFIED: 4,
};

export const BADGE_STATUS = {
  INACTIVE: 'inactive',
  ACTIVE: 'active',
  EXPIRED: 'expired',
};

export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  TRIAL: 'trial',
};

export const SUBSCRIPTION_PLANS = {
  BUYER_BASIC: 'buyer_basic',
  BUYER_PREMIUM: 'buyer_premium',
  SELLER_STARTER: 'seller_starter',
  SELLER_PROFESSIONAL: 'seller_professional',
  SELLER_ENTERPRISE: 'seller_enterprise',
};

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
};

export const UPLOAD = {
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'text/csv',
    'text/plain',
    'application/zip',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'audio/webm',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
  ],
  MAX_FILES_PER_UPLOAD: 5,
};

export const COMPANY_TYPES = [
  'manufacturer',
  'wholesaler',
  'distributor',
  'trader',
  'exporter',
  'other',
];

export const ALLOWED_DOCUMENT_TYPES_SET = new Set([
  'gst_certificate',
  'pan_card',
  'business_registration',
  'incorporation_certificate',
  'address_proof',
  'utility_bill',
  'import_export_code',
  'msme_certificate',
  'government_id',
  'bank_statement',
  'factory_address_proof',
  'factory_image',
  'factory_video',
  'production_line_image',
  'machinery_image',
  'certification',
  'cin_document',
  'partnership_deed',
  'llp_agreement',
  'trade_license',
  'shop_license',
  'professional_tax',
  'ad_code',
  'rcmc',
  'dgft_registration',
  'lut_document',
  'import_license',
  'export_license',
  'customs_registration',
  'factory_license',
  'warehouse_image',
  'office_image',
  'fire_safety_certificate',
  'pollution_certificate',
  'cancelled_cheque',
  'quality_certificate',
  'service_license',
  'service_document',
  'other',
]);
