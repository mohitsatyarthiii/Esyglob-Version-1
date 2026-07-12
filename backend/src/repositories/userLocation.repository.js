import UserLocation from '../models/UserLocation.js';
import mongoose from 'mongoose';

class UserLocationRepository {
  /**
   * Check if ID is valid ObjectId
   */
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Find location by userId
   */
  static async findByUserId(userId) {
    return UserLocation.findOne({ userId }).lean();
  }

  /**
   * Upsert current location (create or update)
   */
  static async upsertLocation(userId, locationData) {
    const { latitude, longitude, accuracy, altitude, speed, heading, address } = locationData;

    const update = {
      current: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      accuracy: accuracy || undefined,
      altitude: altitude || undefined,
      speed: speed || undefined,
      heading: heading || undefined,
      address: address || undefined,
      lastUpdated: new Date(),
      $push: {
        history: {
          $each: [{
            location: {
              type: 'Point',
              coordinates: [longitude, latitude],
            },
            accuracy: accuracy || undefined,
            timestamp: new Date(),
          }],
          $slice: -100, // Keep only last 100 entries
        },
      },
    };

    return UserLocation.findOneAndUpdate(
      { userId },
      update,
      { upsert: true, new: true, lean: true }
    );
  }

  /**
   * Update location only (without address)
   */
  static async updateCoordinates(userId, coordinates, accuracy) {
    return UserLocation.findOneAndUpdate(
      { userId },
      {
        $set: {
          current: {
            type: 'Point',
            coordinates: [coordinates.longitude, coordinates.latitude],
          },
          accuracy: accuracy || undefined,
          lastUpdated: new Date(),
        },
        $push: {
          history: {
            $each: [{
              location: {
                type: 'Point',
                coordinates: [coordinates.longitude, coordinates.latitude],
              },
              accuracy: accuracy || undefined,
              timestamp: new Date(),
            }],
            $slice: -100,
          },
        },
      },
      { upsert: true, new: true, lean: true }
    );
  }

  /**
   * Update address from reverse geocoding
   */
  static async updateAddress(userId, addressData) {
    return UserLocation.findOneAndUpdate(
      { userId },
      {
        $set: {
          address: addressData,
          lastUpdated: new Date(),
        },
      },
      { new: true, lean: true }
    );
  }

  /**
   * Deactivate location tracking
   */
  static async deactivate(userId) {
    return UserLocation.findOneAndUpdate(
      { userId },
      { $set: { isActive: false } },
      { new: true }
    );
  }

  /**
   * Activate location tracking
   */
  static async activate(userId) {
    return UserLocation.findOneAndUpdate(
      { userId },
      { $set: { isActive: true } },
      { new: true }
    );
  }

  /**
   * Get location history for a date range
   */
  static async getHistory(userId, startDate, endDate) {
    const location = await UserLocation.findOne({ userId }).lean();
    
    if (!location || !location.history) return [];

    return location.history.filter(entry => {
      const timestamp = new Date(entry.timestamp);
      if (startDate && timestamp < startDate) return false;
      if (endDate && timestamp > endDate) return false;
      return true;
    });
  }

  /**
   * Find nearby users (for logistics/delivery)
   */
  static async findNearby(coordinates, maxDistance = 5000, limit = 50) {
    return UserLocation.find({
      current: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [coordinates.longitude, coordinates.latitude],
          },
          $maxDistance: maxDistance, // in meters
        },
      },
      isActive: true,
    })
      .limit(limit)
      .lean();
  }

  /**
   * Delete location data for a user
   */
  static async deleteByUserId(userId) {
    return UserLocation.findOneAndDelete({ userId });
  }

  /**
   * Check if user has location data
   */
  static async exists(userId) {
    return UserLocation.exists({ userId });
  }
}

export default UserLocationRepository;