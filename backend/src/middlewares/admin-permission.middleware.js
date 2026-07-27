const rolePermissions = {
  super_admin: ['*'],
  operations_admin: ['dashboard:view', 'orders:manage', 'products:manage', 'categories:manage', 'users:view', 'activity:view'],
  verification_admin: ['dashboard:view', 'verifications:manage', 'sellers:view', 'activity:view'],
  finance_admin: ['dashboard:view', 'orders:view', 'payments:manage', 'coupons:manage', 'gift_cards:manage', 'activity:view'],
  support_admin: ['dashboard:view', 'users:view', 'orders:view', 'payments:view', 'activity:view'],
  content_admin: ['dashboard:view', 'products:manage', 'categories:manage', 'activity:view'],
};

export function adminRole(user) {
  return String(user?.metadata?.adminRole || 'super_admin');
}

export function hasAdminPermission(user, permission) {
  if (!user?.roles?.includes('admin')) return false;
  const configured = Array.isArray(user?.metadata?.adminPermissions) ? user.metadata.adminPermissions : rolePermissions[adminRole(user)] || [];
  return configured.includes('*') || configured.includes(permission);
}

export function requireAdminPermission(permission) {
  return (req, res, next) => {
    if (!hasAdminPermission(req.user, permission)) {
      return res.status(403).json({ error: 'Your admin role does not permit this action', code: 'ADMIN_PERMISSION_REQUIRED', permission });
    }
    return next();
  };
}

const resourcePermissions = {
  users: ['users:view', 'users:manage'], sellers: ['sellers:view', 'sellers:manage'],
  verifications: ['verifications:manage'], products: ['products:manage'],
  categories: ['categories:manage'], subcategories: ['categories:manage'],
  orders: ['orders:view', 'orders:manage'], payments: ['payments:view', 'payments:manage'],
  coupons: ['coupons:manage'], 'gift-cards': ['gift_cards:manage'], activities: ['activity:view'],
};

export function requireAdminResourcePermission(mode = 'view') {
  return (req, res, next) => {
    if (mode === 'manage' && req.params.resource === 'activities') {
      return res.status(403).json({ error: 'Admin activity records are immutable', code: 'IMMUTABLE_AUDIT_LOG' });
    }
    const options = resourcePermissions[req.params.resource] || [];
    const allowed = mode === 'manage' ? options.slice(-1) : options;
    if (!allowed.some((permission) => hasAdminPermission(req.user, permission))) {
      return res.status(403).json({ error: 'Your admin role cannot access this resource', code: 'ADMIN_PERMISSION_REQUIRED' });
    }
    return next();
  };
}

export const ADMIN_ROLE_PERMISSIONS = rolePermissions;
