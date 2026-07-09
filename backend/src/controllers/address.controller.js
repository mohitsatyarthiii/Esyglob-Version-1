import AddressService from '../services/address.service.js';
import { z } from 'zod';

class AddressController {
  /**
   * GET - List all addresses
   */
  static async list(req, res) {
    try {
      const result = await AddressService.getUserAddresses(req.user._id);
      return res.json(result);
    } catch (error) {
      console.error('[Addresses-GET] Error:', error);
      return res.status(500).json({ error: 'Unable to fetch addresses' });
    }
  }

  /**
   * POST - Create address
   */
  static async create(req, res) {
    try {
      const result = await AddressService.createAddress(req.user._id, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Addresses-POST] Error:', error);

      if (error instanceof z.ZodError) {
        return res.status(422).json({ error: 'Please fill all required address fields' });
      }

      return res.status(500).json({ error: 'Unable to save address' });
    }
  }

  /**
   * PUT - Full update address
   */
  static async update(req, res) {
    try {
      const { addressId } = req.params;
      const result = await AddressService.updateAddress(req.user._id, addressId, req.body);
      return res.json(result);
    } catch (error) {
      console.error('[Addresses-PUT] Error:', error);

      if (error instanceof z.ZodError) {
        return res.status(422).json({ error: 'Please fill all required address fields' });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Unable to update address' });
    }
  }

  /**
   * PATCH - Partial update (set default)
   */
  static async patch(req, res) {
    try {
      const { addressId } = req.params;
      const result = await AddressService.patchAddress(req.user._id, addressId, req.body);
      return res.json(result);
    } catch (error) {
      console.error('[Addresses-PATCH] Error:', error);

      if (error instanceof z.ZodError) {
        return res.status(422).json({ error: 'Unable to update address' });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Unable to update address' });
    }
  }

  /**
   * DELETE - Delete address
   */
  static async delete(req, res) {
    try {
      const { addressId } = req.params;
      const result = await AddressService.deleteAddress(req.user._id, addressId);
      return res.json(result);
    } catch (error) {
      console.error('[Addresses-DELETE] Error:', error);

      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Unable to delete address' });
    }
  }
}

export default AddressController;