export function getActiveRole(user, pathname = '') {
  const roles = user?.roles || [];

  if (pathname.startsWith('/dashboard/admin') && roles.includes('admin')) return 'admin';
  if (pathname.startsWith('/dashboard/seller') && roles.includes('seller')) return 'seller';
  if (
    (pathname.startsWith('/dashboard/products') || pathname.startsWith('/dashboard/reviews')) &&
    roles.includes('seller')
  )
    return 'seller';
  if (pathname.startsWith('/dashboard/buyer') && roles.includes('buyer')) return 'buyer';

  if (user?.primaryRole && roles.includes(user.primaryRole)) return user.primaryRole;
  if (roles.includes('seller')) return 'seller';
  if (roles.includes('admin')) return 'admin';
  return 'buyer';
}

export function getDashboardPath(user, pathname = '') {
  const activeRole = getActiveRole(user, pathname);

  if (activeRole === 'seller') return '/dashboard/seller/account';
  if (activeRole === 'admin') return '/dashboard/admin';
  return '/dashboard/buyer/account';
}