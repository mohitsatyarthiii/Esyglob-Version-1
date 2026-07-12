import ProfileService from '../services/profile.service.js';
import { z } from 'zod';

class ProfileController {
  /**
   * GET - Get profile
   */
  static async get(req, res) {
    try {
      const result = await ProfileService.getProfile(req.user._id);
      return res.json(result);
    } catch (error) {
      console.error('[Profile-GET] Error:', error);
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Unable to load profile settings' });
    }
  }

  /**
   * PATCH - Update profile
   */
  static async update(req, res) {
    try {
      const result = await ProfileService.updateProfile(
        req.user._id, req.user.roles, req.body
      );
      return res.json(result);
    } catch (error) {
      console.error('[Profile-PATCH] Error:', error);

      if (error instanceof z.ZodError) {
        return res.status(422).json({ error: 'Please check the profile fields and try again' });
      }
      if (error.statusCode === 409) {
        return res.status(409).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Unable to update profile settings' });
    }
  }

  static async updateCurrency(req, res) {
    try {
      const result = await ProfileService.updatePreferredCurrency(req.user._id, req.body?.currency);
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Unable to update currency' });
    }
  }

  /**
   * PATCH - Change password
   */
  static async changePassword(req, res) {
    try {
      const result = await ProfileService.changePassword(req.user._id, req.body);
      return res.json(result);
    } catch (error) {
      console.error('[Profile-Password] Error:', error);

      if (error instanceof z.ZodError) {
        return res.status(422).json({ error: 'Password must be at least 8 characters' });
      }
      if (error.statusCode === 422) {
        return res.status(422).json({ error: error.message });
      }
      if (error.statusCode === 401) {
        return res.status(401).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Unable to update password' });
    }
  }
}

export default ProfileController;
