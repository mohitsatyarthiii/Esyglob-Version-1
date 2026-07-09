import AddressRepository from '../repositories/address.repository.js';
import { createAddressSchema, updateAddressSchema } from '../validators/address.validator.js';
import { z } from 'zod';

class AddressService {
  /**
   * Get all user addresses
   */
  static async getUserAddresses(userId) {
    const addresses = await AddressRepository.findByUser(userId);
    return { addresses };
  }

  /**
   * Create a new address
   */
  static async createAddress(userId, data) {
    // Validate
    const parsed = createAddressSchema.parse(data);

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
    const parsed = updateAddressSchema.parse(data);

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
}

export default AddressService;