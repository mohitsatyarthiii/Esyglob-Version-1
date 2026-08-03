import Address from '../models/Address.js';
import mongoose from 'mongoose';

function withCoordinates(data) {
  if (!Number.isFinite(data?.latitude) || !Number.isFinite(data?.longitude)) return data;
  return { ...data, coordinates: { type: 'Point', coordinates: [data.longitude, data.latitude] } };
}

class AddressRepository {
  /**
   * Check if ID is valid ObjectId
   */
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Get all addresses for a user
   */
  static async findByUser(userId) {
    return Address.find({ userId })
      .sort({ isDefault: -1, updatedAt: -1 })
      .lean();
  }

  static async findDefault(userId) {
    return Address.findOne({ userId, isDefault: true }).lean();
  }

  /**
   * Find a single address by ID and user
   */
  static async findByIdAndUser(addressId, userId) {
    if (!this.isValidId(addressId)) return null;
    return Address.findOne({ _id: addressId, userId });
  }

  /**
   * Check if address exists
   */
  static async exists(addressId, userId) {
    if (!this.isValidId(addressId)) return false;
    return Address.exists({ _id: addressId, userId });
  }

  /**
   * Check if user has any addresses
   */
  static async hasAnyAddress(userId) {
    return Address.exists({ userId });
  }

  /**
   * Create a new address
   */
  static async create(data) {
    return Address.create(withCoordinates(data));
  }

  /**
   * Update an address
   */
  static async update(addressId, userId, data) {
    if (!this.isValidId(addressId)) return null;

    return Address.findOneAndUpdate(
      { _id: addressId, userId },
      { $set: withCoordinates(data) },
      { returnDocument: 'after', runValidators: true }
    );
  }

  /**
   * Update address with lean result
   */
  static async updateLean(addressId, userId, data) {
    if (!this.isValidId(addressId)) return null;

    return Address.findOneAndUpdate(
      { _id: addressId, userId },
      { $set: withCoordinates(data) },
      { returnDocument: 'after', runValidators: true, lean: true }
    );
  }

  /**
   * Set an address as default (unset others)
   */
  static async setAsDefault(addressId, userId) {
    // Unset all other defaults
    await Address.updateMany(
      { userId, _id: { $ne: addressId } },
      { $set: { isDefault: false } }
    );

    // Set this one as default
    return Address.findOneAndUpdate(
      { _id: addressId, userId },
      { $set: { isDefault: true } },
      { returnDocument: 'after', runValidators: true }
    );
  }

  /**
   * Delete an address
   */
  static async delete(addressId, userId) {
    if (!this.isValidId(addressId)) return null;
    return Address.findOneAndDelete({ _id: addressId, userId });
  }

  /**
   * Unset all defaults for a user
   */
  static async unsetAllDefaults(userId) {
    return Address.updateMany(
      { userId },
      { $set: { isDefault: false } }
    );
  }

  /**
   * Find next address to set as default
   */
  static async findNextDefault(userId) {
    return Address.findOne({ userId })
      .sort({ updatedAt: -1 })
      .lean();
  }

  /**
   * Count user addresses
   */
  static async countByUser(userId) {
    return Address.countDocuments({ userId });
  }

  static async upsertDefaultLocation(userId, data) {
    const current = await Address.findOne({ userId, isDefault: true });
    const payload = {
      ...data,
      isDefault: true,
      coordinates: Number.isFinite(data.latitude) && Number.isFinite(data.longitude)
        ? { type: 'Point', coordinates: [data.longitude, data.latitude] }
        : current?.coordinates,
    };
    if (current) {
      Object.assign(current, payload);
      return current.save();
    }
    await this.unsetAllDefaults(userId);
    return Address.create({ ...payload, userId });
  }

}

export default AddressRepository;
