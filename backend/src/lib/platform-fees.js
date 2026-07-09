import CommerceSettings from '../models/CommerceSettings.js';

/**
 * Determine if platform fee should be applied to an order
 */
export function shouldApplyPlatformFee({ orderType, orderSubType } = {}) {
  // Sample orders are exempt from platform fees
  if (orderSubType === 'sample_order') return false;
  // All other orders include platform fee
  return true;
}

/**
 * Get the base amount of an order for fee calculation
 */
export function getOrderBaseAmount(order) {
  return Number(
    order?.subtotal ||
      order?.totalPrice ||
      order?.totalAmount ||
      0
  );
}

/**
 * Get the default platform fee rate from environment
 */
export function getPlatformFeeRate(baseAmount) {
  return Number(process.env.PLATFORM_FEE_RATE || 0.03);
}

/**
 * Calculate platform fee for an order using default rate
 */
export function calculateOrderPlatformFee(order) {
  const base = getOrderBaseAmount(order);
  return Math.round(base * getPlatformFeeRate(base) * 100) / 100;
}

/**
 * Calculate platform fee from CommerceSettings slabs
 * Falls back to environment variable if no settings found
 */
export async function calculatePlatformFeeFromSettings(taxableAmount) {
  try {
    const settings = await CommerceSettings.findOne({ key: 'default' }).lean();
    const slabs = settings?.platformFeeSlabs || [];

    // Find matching slab
    const activeSlabs = slabs.filter((slab) => slab.isActive !== false);
    const matchedSlab = activeSlabs.find(
      (slab) =>
        taxableAmount >= slab.minAmount &&
        (slab.maxAmount === null ||
          slab.maxAmount === undefined ||
          taxableAmount <= slab.maxAmount)
    );

    if (matchedSlab) {
      const fee = Math.round(taxableAmount * matchedSlab.rate * 100) / 100;
      return {
        platformFee: fee,
        platformFeeRate: matchedSlab.rate,
        platformFeeSlab: matchedSlab.label || `${matchedSlab.rate * 100}%`,
      };
    }

    // Fallback to default rate
    const defaultRate = Number(process.env.PLATFORM_FEE_RATE || 0.03);
    const fee = Math.round(taxableAmount * defaultRate * 100) / 100;
    return {
      platformFee: fee,
      platformFeeRate: defaultRate,
      platformFeeSlab: `${defaultRate * 100}%`,
    };
  } catch {
    // Fallback if CommerceSettings query fails
    const defaultRate = Number(process.env.PLATFORM_FEE_RATE || 0.03);
    const fee = Math.round(taxableAmount * defaultRate * 100) / 100;
    return {
      platformFee: fee,
      platformFeeRate: defaultRate,
      platformFeeSlab: `${defaultRate * 100}%`,
    };
  }
}

/**
 * Get platform fee configuration summary
 */
export async function getPlatformFeeConfig() {
  try {
    const settings = await CommerceSettings.findOne({ key: 'default' }).lean();
    const slabs = settings?.platformFeeSlabs || [];

    return {
      enabled: true,
      defaultRate: Number(process.env.PLATFORM_FEE_RATE || 0.03),
      slabs: slabs
        .filter((slab) => slab.isActive !== false)
        .map((slab) => ({
          minAmount: slab.minAmount,
          maxAmount: slab.maxAmount,
          rate: slab.rate,
          label: slab.label || `${slab.rate * 100}%`,
        })),
    };
  } catch {
    return {
      enabled: true,
      defaultRate: Number(process.env.PLATFORM_FEE_RATE || 0.03),
      slabs: [],
    };
  }
}

/**
 * Validate platform fee calculation
 */
export function validatePlatformFee(order) {
  const base = getOrderBaseAmount(order);
  const expectedFee = calculateOrderPlatformFee(order);
  const actualFee = Number(order?.platformFee || 0);
  const tolerance = 0.01; // 1 paisa tolerance

  return {
    isValid: Math.abs(actualFee - expectedFee) <= tolerance,
    expected: expectedFee,
    actual: actualFee,
    base,
  };
}