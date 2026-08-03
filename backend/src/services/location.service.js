import AddressRepository from '../repositories/address.repository.js';
import AddressService from './address.service.js';
import { reverseGeocodeSchema } from '../validators/location.validator.js';

function legacyLocation(address) {
  if (!address) return null;
  const latitude = Number(address.latitude);
  const longitude = Number(address.longitude);
  return {
    _id: address._id,
    userId: address.userId,
    addressId: address._id,
    current: Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { type: 'Point', coordinates: [longitude, latitude] }
      : undefined,
    accuracy: address.gpsAccuracy,
    address: {
      formatted: address.address,
      street: address.street || address.address,
      city: address.city,
      state: address.state,
      country: address.country,
      postalCode: address.postalCode,
    },
    lastUpdated: address.lastLocatedAt || address.updatedAt,
    isActive: true,
    history: [],
  };
}

// Compatibility adapter: legacy /location clients now read and write Address.
class LocationService {
  static async getCurrentLocation(userId) {
    const address = await AddressRepository.findDefault(userId) || await AddressService.promoteLegacyLocation(userId);
    return { address, location: legacyLocation(address), message: address ? undefined : 'No saved address available' };
  }

  static async updateLocation(userId, data) {
    const { address } = await AddressService.upsertCurrentLocation(userId, data);
    return { address, location: legacyLocation(address) };
  }

  static async updateAddress(userId, data) {
    const parsed = reverseGeocodeSchema.parse(data);
    const current = await AddressRepository.findDefault(userId);
    if (!current) throw Object.assign(new Error('Default address not found'), { statusCode: 404 });
    const address = await AddressRepository.updateLean(current._id, userId, {
      address: parsed.formatted || current.address,
      street: parsed.street || current.street,
      city: parsed.city || current.city,
      state: parsed.state || current.state,
      country: parsed.country || current.country,
      postalCode: parsed.postalCode || current.postalCode,
    });
    return { address, location: legacyLocation(address) };
  }

  static async getLocationHistory() {
    return { history: [] };
  }

  static async toggleTracking(userId) {
    return this.getCurrentLocation(userId);
  }

  static async deleteLocation(userId) {
    const address = await AddressRepository.clearDefaultCoordinates(userId);
    return { success: true, address };
  }

  static async findNearbyLocations(coordinates, maxDistance, limit) {
    const locations = await AddressRepository.findNearby(coordinates, maxDistance, limit);
    return { locations };
  }
}

export default LocationService;
