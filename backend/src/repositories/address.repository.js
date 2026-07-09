import Address from '../models/Address.js';
import mongoose from 'mongoose';

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
    return Address.create(data);
  }

  /**
   * Update an address
   */
  static async update(addressId, userId, data) {
    if (!this.isValidId(addressId)) return null;

    return Address.findOneAndUpdate(
      { _id: addressId, userId },
      { $set: data },
      { new: true, runValidators: true }
    );
  }

  /**
   * Update address with lean result
   */
  static async updateLean(addressId, userId, data) {
    if (!this.isValidId(addressId)) return null;

    return Address.findOneAndUpdate(
      { _id: addressId, userId },
      { $set: data },
      { new: true, runValidators: true, lean: true }
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
      { new: true, runValidators: true }
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
}

export default AddressRepository;