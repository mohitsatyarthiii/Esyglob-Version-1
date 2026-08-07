export function resolveId(value) {
  return typeof value === 'object' ? String(value?._id || value?.id || '') : String(value || '')
}

export function displayName(value, fallback = 'EsyGlob user') {
  return value?.companyName || value?.businessName || value?.fullName || value?.name || value?.email || fallback
}
