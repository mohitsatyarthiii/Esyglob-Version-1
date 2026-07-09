/**
 * Role-based permission definitions
 */
export const PERMISSIONS = {
  // Buyer permissions
  BUYER_VIEW_DASHBOARD: 'buyer:view_dashboard',
  BUYER_SEARCH_PRODUCTS: 'buyer:search_products',
  BUYER_CREATE_INQUIRY: 'buyer:create_inquiry',
  BUYER_REQUEST_SAMPLE: 'buyer:request_sample',
  BUYER_CHAT_SELLER: 'buyer:chat_seller',

  // Seller permissions
  SELLER_VIEW_DASHBOARD: 'seller:view_dashboard',
  SELLER_CREATE_PRODUCT: 'seller:create_product',
  SELLER_EDIT_PRODUCT: 'seller:edit_product',
  SELLER_DELETE_PRODUCT: 'seller:delete_product',
  SELLER_VIEW_ANALYTICS: 'seller:view_analytics',
  SELLER_MANAGE_PROFILE: 'seller:manage_profile',
  SELLER_VIEW_ORDERS: 'seller:view_orders',

  // Admin permissions
  ADMIN_VIEW_DASHBOARD: 'admin:view_dashboard',
  ADMIN_MANAGE_USERS: 'admin:manage_users',
  ADMIN_MANAGE_SELLERS: 'admin:manage_sellers',
  ADMIN_MANAGE_VERIFICATIONS: 'admin:manage_verifications',
  ADMIN_MANAGE_PRODUCTS: 'admin:manage_products',
  ADMIN_MANAGE_SUBSCRIPTIONS: 'admin:manage_subscriptions',
  ADMIN_VIEW_ANALYTICS: 'admin:view_analytics',
  ADMIN_MODERATE_CONTENT: 'admin:moderate_content',
};

const ROLE_PERMISSIONS = {
  buyer: [
    PERMISSIONS.BUYER_VIEW_DASHBOARD,
    PERMISSIONS.BUYER_SEARCH_PRODUCTS,
    PERMISSIONS.BUYER_CREATE_INQUIRY,
    PERMISSIONS.BUYER_REQUEST_SAMPLE,
    PERMISSIONS.BUYER_CHAT_SELLER,
  ],
  seller: [
    PERMISSIONS.SELLER_VIEW_DASHBOARD,
    PERMISSIONS.SELLER_CREATE_PRODUCT,
    PERMISSIONS.SELLER_EDIT_PRODUCT,
    PERMISSIONS.SELLER_DELETE_PRODUCT,
    PERMISSIONS.SELLER_VIEW_ANALYTICS,
    PERMISSIONS.SELLER_MANAGE_PROFILE,
    PERMISSIONS.SELLER_VIEW_ORDERS,
  ],
  admin: [
    PERMISSIONS.ADMIN_VIEW_DASHBOARD,
    PERMISSIONS.ADMIN_MANAGE_USERS,
    PERMISSIONS.ADMIN_MANAGE_SELLERS,
    PERMISSIONS.ADMIN_MANAGE_VERIFICATIONS,
    PERMISSIONS.ADMIN_MANAGE_PRODUCTS,
    PERMISSIONS.ADMIN_MANAGE_SUBSCRIPTIONS,
    PERMISSIONS.ADMIN_VIEW_ANALYTICS,
    PERMISSIONS.ADMIN_MODERATE_CONTENT,
  ],
};

export function getUserPermissions(roles) {
  return (roles || []).reduce((acc, role) => {
    return [...acc, ...(ROLE_PERMISSIONS[role] || [])];
  }, []);
}

export function hasPermission(roles, permission) {
  const permissions = getUserPermissions(roles);
  return permissions.includes(permission);
}

export function hasAnyPermission(roles, permissions) {
  const userPermissions = getUserPermissions(roles);
  return permissions.some((p) => userPermissions.includes(p));
}

export function hasAllPermissions(roles, permissions) {
  const userPermissions = getUserPermissions(roles);
  return permissions.every((p) => userPermissions.includes(p));
}