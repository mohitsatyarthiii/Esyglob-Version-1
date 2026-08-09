function configuredPackages() {
  try {
    const parsed = JSON.parse(process.env.AI_CREDIT_PACKAGES_JSON || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(item => ({
      key: String(item.key || '').trim(),
      name: String(item.name || `${Number(item.credits || 0).toLocaleString()} Credits`).trim(),
      credits: Number(item.credits), price: Number(item.price),
      currency: String(item.currency || 'INR').toUpperCase(), popular: Boolean(item.popular),
    })).filter(item => item.key && Number.isInteger(item.credits) && item.credits > 0 && Number.isFinite(item.price) && item.price > 0);
  } catch { return []; }
}
export function listAICreditPackages() { return configuredPackages(); }
export function getAICreditPackage(key) { return configuredPackages().find(item => item.key === key) || null; }
