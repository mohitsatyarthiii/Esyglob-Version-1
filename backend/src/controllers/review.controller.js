import ReviewService from '../services/review.service.js';
import { z } from 'zod';
import { hasRole } from '../lib/constants.js';

class ReviewController {
  /**
   * GET - List reviews
   */
  static async list(req, res) {
    try {
      const result = await ReviewService.getReviews(req.query, req.user);
      return res.json(result);
    } catch (error) {
      if (error.statusCode === 401) {
        return res.status(401).json({ error: error.message });
      }
      console.error('[Reviews-GET] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch reviews' });
    }
  }

  /**
   * POST - Create review
   */
  static async create(req, res) {
    try {
      if (!hasRole(req.user, 'buyer')) {
        return res.status(403).json({ error: 'Only buyers can create reviews' });
      }

      const result = await ReviewService.createReview(req.user._id, req.user.roles, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Reviews-POST] Error:', error);

      if (error instanceof z.ZodError) {
        return res.status(422).json({ error: 'Please complete the review form' });
      }
      if (error.statusCode === 409) {
        return res.status(409).json({ error: error.message });
      }
      if (error.statusCode === 422) {
        return res.status(422).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Failed to create review' });
    }
  }

  /**
   * PUT - Update review
   */
  static async update(req, res) {
    try {
      const result = await ReviewService.updateReview(req.user._id, req.body);
      return res.json(result);
    } catch (error) {
      console.error('[Reviews-PUT] Error:', error);

      if (error instanceof z.ZodError) {
        return res.status(422).json({ error: 'Please complete the review form' });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      if (error.statusCode === 422) {
        return res.status(422).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Failed to update review' });
    }
  }

  /**
   * PATCH - Seller responds to review
   */
  static async sellerRespond(req, res) {
    try {
      if (!hasRole(req.user, 'seller')) {
        return res.status(403).json({ error: 'Only suppliers can respond to reviews' });
      }

      const { reviewId } = req.params;
      const { comment } = req.body;

      if (!comment || comment.trim().length < 2) {
        return res.status(422).json({ error: 'Please enter a response' });
      }

      const result = await ReviewService.addSellerResponse(
        req.user._id, req.user.roles, reviewId, comment.trim()
      );

      return res.json(result);
    } catch (error) {
      console.error('[Reviews-PATCH] Error:', error);

      if (error instanceof z.ZodError) {
        return res.status(422).json({ error: 'Please enter a response' });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Failed to save response' });
    }
  }
}

export default ReviewController;
