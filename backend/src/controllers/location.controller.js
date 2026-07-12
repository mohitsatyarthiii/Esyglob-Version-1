import LocationService from '../services/location.service.js';
import { z } from 'zod';

class LocationController {
  /**
   * GET - Get current location
   */
  static async getCurrent(req, res) {
    try {
      const result = await LocationService.getCurrentLocation(req.user._id);
      return res.json(result);
    } catch (error) {
      console.error('[Location-GET] Error:', error);
      return res.status(500).json({ error: 'Unable to fetch location' });
    }
  }

  /**
   * PUT - Update current location
   */
  static async update(req, res) {
    try {
      const result = await LocationService.updateLocation(req.user._id, req.body);
      return res.json(result);
    } catch (error) {
      console.error('[Location-PUT] Error:', error);

      if (error instanceof z.ZodError) {
        return res.status(422).json({ 
          error: 'Invalid location data',
          details: error.errors 
        });
      }

      return res.status(500).json({ error: 'Unable to update location' });
    }
  }

  /**
   * PATCH - Update address from reverse geocoding
   */
  static async updateAddress(req, res) {
    try {
      const result = await LocationService.updateAddress(req.user._id, req.body);
      return res.json(result);
    } catch (error) {
      console.error('[Location-PATCH] Error:', error);

      if (error instanceof z.ZodError) {
        return res.status(422).json({ 
          error: 'Invalid address data',
          details: error.errors 
        });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Unable to update address' });
    }
  }

  /**
   * GET - Get location history
   */
  static async getHistory(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const result = await LocationService.getLocationHistory(
        req.user._id,
        startDate ? new Date(startDate) : null,
        endDate ? new Date(endDate) : null
      );
      return res.json(result);
    } catch (error) {
      console.error('[Location-History] Error:', error);
      return res.status(500).json({ error: 'Unable to fetch location history' });
    }
  }

  /**
   * PUT - Toggle tracking on/off
   */
  static async toggleTracking(req, res) {
    try {
      const { isActive } = req.body;
      const result = await LocationService.toggleTracking(req.user._id, isActive);
      return res.json(result);
    } catch (error) {
      console.error('[Location-Toggle] Error:', error);
      return res.status(500).json({ error: 'Unable to toggle tracking' });
    }
  }

  /**
   * DELETE - Delete location data
   */
  static async delete(req, res) {
    try {
      const result = await LocationService.deleteLocation(req.user._id);
      return res.json(result);
    } catch (error) {
      console.error('[Location-DELETE] Error:', error);
      return res.status(500).json({ error: 'Unable to delete location data' });
    }
  }
}

export default LocationController;