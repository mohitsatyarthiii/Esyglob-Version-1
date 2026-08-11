import AddressRepository from '../repositories/address.repository.js';
import { createAddressSchema, updateAddressSchema } from '../validators/address.validator.js';
import { z } from 'zod';
import User from '../models/User.js';
import AddressAutocompleteService from './address-autocomplete.service.js';
import { updateLocationSchema } from '../validators/location.validator.js';
import mongoose from 'mongoose';

class AddressService {
  /**
   * Get all user addresses
   */
  static async getUserAddresses(userId) {
    let addresses = await AddressRepository.findByUser(userId);
    if (!addresses.length) {
      await this.promoteLegacyLocation(userId);
      addresses = await AddressRepository.findByUser(userId);
    }
    return { addresses };
  }

  static async promoteLegacyLocation(userId) {
    if (!mongoose.connection.readyState) return null;
    const legacy = await mongoose.connection.collection('userlocations').findOne({ userId: new mongoose.Types.ObjectId(userId) });
    const [longitude, latitude] = legacy?.current?.coordinates || [];
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const result = await this.upsertCurrentLocation(userId, { latitude, longitude, accuracy: legacy.accuracy, address: legacy.address });
    return result.address;
  }

  /**
   * Create a new address
   */
  static async createAddress(userId, data) {
    // Validate
    const parsed = createAddressSchema.parse(normalizeAddressInput(data));
    parsed.addressLabel = normalizeAddressLabel(data.addressLabel || data.addressType);
    delete parsed.addressType;

    // Check if this is the first address (auto-set as default)
    const hasExistingAddress = await AddressRepository.hasAnyAddress(userId);
    const shouldBeDefault = parsed.isDefault || !hasExistingAddress;

    // If setting as default, unset all others
    if (shouldBeDefault) {
      await AddressRepository.unsetAllDefaults(userId);
    }

    // Create address
    const address = await AddressRepository.create({
      ...parsed,
      isDefault: shouldBeDefault,
      userId,
    });

    return { address };
  }

  /**
   * Update an address (PUT - full update)
   */
  static async updateAddress(userId, addressId, data) {
    // Validate
    const parsed = updateAddressSchema.parse(normalizeAddressInput(data));
    parsed.addressLabel = normalizeAddressLabel(data.addressLabel || data.addressType);
    delete parsed.addressType;

    // Verify ownership
    const exists = await AddressRepository.exists(addressId, userId);
    if (!exists) {
      throw Object.assign(new Error('Address not found'), { statusCode: 404 });
    }

    // Handle default
    if (parsed.isDefault) {
      await AddressRepository.unsetAllDefaults(userId);
    }

    // Update
    const address = await AddressRepository.updateLean(addressId, userId, parsed);
    if (!address) {
      throw Object.assign(new Error('Address not found'), { statusCode: 404 });
    }

    return { address };
  }

  /**
   * Patch an address (PATCH - partial update, mainly for set default)
   */
  static async patchAddress(userId, addressId, data) {
    // Validate
    const parsed = z.object({
      isDefault: z.boolean().optional(),
    }).passthrough().parse(data);

    // Verify ownership
    const exists = await AddressRepository.exists(addressId, userId);
    if (!exists) {
      throw Object.assign(new Error('Address not found'), { statusCode: 404 });
    }

    // Handle setting as default
    if (parsed.isDefault) {
      const address = await AddressRepository.setAsDefault(addressId, userId);
      if (!address) {
        throw Object.assign(new Error('Address not found'), { statusCode: 404 });
      }
      return { address };
    }

    // Just return the existing address if no changes
    const address = await AddressRepository.findByIdAndUser(addressId, userId);
    return { address };
  }

  /**
   * Delete an address
   */
  static async deleteAddress(userId, addressId) {
    // Verify ownership
    const exists = await AddressRepository.exists(addressId, userId);
    if (!exists) {
      throw Object.assign(new Error('Address not found'), { statusCode: 404 });
    }

    // Delete
    const address = await AddressRepository.delete(addressId, userId);
    if (!address) {
      throw Object.assign(new Error('Address not found'), { statusCode: 404 });
    }

    // If deleted address was default, set next one as default
    if (address.isDefault) {
      const nextAddress = await AddressRepository.findNextDefault(userId);
      if (nextAddress) {
        await AddressRepository.setAsDefault(nextAddress._id, userId);
      }
    }

    return { success: true };
  }

  static async upsertCurrentLocation(userId, data) {
    const parsed = updateLocationSchema.parse(normalizeLocationInput(data));
    let geocoded = parsed.address || {};
    for (let attempt = 0; attempt < 2 && !isCompleteGeocodedAddress(geocoded); attempt += 1) {
      const reverse = await AddressAutocompleteService.reverse({
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        refresh: attempt > 0,
      });
      geocoded = { ...geocoded, ...(reverse.location || {}) };
    }
    geocoded = normalizeGeocodedAddress(geocoded);
    if (!isCompleteGeocodedAddress(geocoded)) {
      throw Object.assign(new Error('Unable to detect your location. Please select your location manually.'), {
        statusCode: 422,
        code: 'ADDRESS_GEOCODING_INCOMPLETE',
      });
    }
    const [current, user] = await Promise.all([
      AddressRepository.findDefault(userId),
      User.findById(userId).select('fullName firstName lastName email phone').lean(),
    ]);
    const fullName = current?.fullName || user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || String(user?.email || '').split('@')[0];
    const address = await AddressRepository.upsertDefaultLocation(userId, {
      fullName,
      phone: current?.phone || user?.phone || '',
      companyName: current?.companyName || '',
      address: geocoded.formatted || geocoded.formattedAddress || geocoded.line1 || geocoded.street,
      street: geocoded.street || geocoded.line1 || current?.street || '',
      city: geocoded.city || current?.city || '',
      district: geocoded.district || current?.district || '',
      state: geocoded.state || current?.state || '',
      country: geocoded.country || current?.country,
      countryCode: geocoded.countryCode,
      postalCode: geocoded.postalCode || current?.postalCode || '',
      placeId: geocoded.placeId || current?.placeId,
      landmark: current?.landmark || '',
      addressLabel: current?.addressLabel || 'Other',
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      gpsAccuracy: parsed.accuracy,
      locationSource: 'gps',
      lastLocatedAt: new Date(),
    });
    return { address: address.toObject?.() || address };
  }
}

export default AddressService;

function normalizeAddressLabel(value) {
  const normalized = String(value || 'Other').toLowerCase();
  if (normalized === 'home' || normalized === 'shipping') return 'Home';
  if (normalized === 'office' || normalized === 'billing') return 'Office';
  if (normalized === 'warehouse') return 'Warehouse';
  return 'Other';
}

function normalizeAddressInput(data = {}) {
  return {
    ...data,
    countryCode: String(data.countryCode || '').trim().toUpperCase(),
  };
}

function normalizeLocationInput(data = {}) {
  const address = data.address ? { ...data.address } : undefined;
  if (address) {
    const countryCode = String(address.countryCode || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(countryCode)) address.countryCode = countryCode;
    else delete address.countryCode;
  }
  return { ...data, address };
}

function normalizeGeocodedAddress(value = {}) {
  return {
    ...value,
    formatted: String(value.formatted || value.formattedAddress || '').trim(),
    countryCode: String(value.countryCode || '').trim().toUpperCase(),
  };
}

function isCompleteGeocodedAddress(value = {}) {
  const normalized = normalizeGeocodedAddress(value);
  return Boolean(
    normalized.formatted
    && String(normalized.city || '').trim()
    && String(normalized.state || '').trim()
    && String(normalized.country || '').trim()
    && /^[A-Z]{2}$/.test(normalized.countryCode)
  );
}
