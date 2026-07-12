import UserLocationRepository from '../repositories/userLocation.repository.js';
import { updateLocationSchema, reverseGeocodeSchema } from '../validators/location.validator.js';
import { z } from 'zod';

class LocationService {
  /**
   * Get user's current location
   */
  static async getCurrentLocation(userId) {
    const location = await UserLocationRepository.findByUserId(userId);
    
    if (!location) {
      return { location: null, message: 'No location data available' };
    }

    return { location };
  }

  /**
   * Update current location (from mobile GPS)
   */
  static async updateLocation(userId, data) {
    // Validate
    const parsed = updateLocationSchema.parse(data);

    // Save location
    const location = await UserLocationRepository.upsertLocation(userId, parsed);

    return { location };
  }

  /**
   * Update address from reverse geocoding
   */
  static async updateAddress(userId, data) {
    // Validate
    const parsed = reverseGeocodeSchema.parse(data);

    // Update address
    const location = await UserLocationRepository.updateAddress(userId, parsed);

    if (!location) {
      throw Object.assign(new Error('Location not found'), { statusCode: 404 });
    }

    return { location };
  }

  /**
   * Get location history
   */
  static async getLocationHistory(userId, startDate, endDate) {
    const history = await UserLocationRepository.getHistory(userId, startDate, endDate);
    return { history };
  }

  /**
   * Toggle location tracking on/off
   */
  static async toggleTracking(userId, isActive) {
    if (isActive) {
      await UserLocationRepository.activate(userId);
    } else {
      await UserLocationRepository.deactivate(userId);
    }

    const location = await UserLocationRepository.findByUserId(userId);
    return { location };
  }

  /**
   * Delete location data
   */
  static async deleteLocation(userId) {
    await UserLocationRepository.deleteByUserId(userId);
    return { success: true };
  }

  /**
   * Find nearby addresses (for delivery radius)
   */
  static async findNearbyLocations(coordinates, maxDistance, limit) {
    const locations = await UserLocationRepository.findNearby(coordinates, maxDistance, limit);
    return { locations };
  }
}

export default LocationService;