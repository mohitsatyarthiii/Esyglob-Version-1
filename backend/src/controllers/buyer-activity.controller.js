import BuyerActivityService from '../services/buyer-activity.service.js';

class BuyerActivityController {
  // ==================== RECENTLY VIEWED ====================

  /**
   * POST - Track recently viewed product
   */
  static async trackRecentlyViewed(req, res) {
    try {
      if (!req.user?.roles?.includes('buyer')) {
        return res.json({ tracked: false });
      }

      const result = await BuyerActivityService.trackRecentlyViewed(
        req.user._id, req.body.productId
      );
      return res.json(result);
    } catch (error) {
      console.error('[RecentlyViewed] Error:', error);
      if (error.statusCode === 422) {
        return res.status(422).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to track view' });
    }
  }

  // ==================== SAVED ITEMS ====================

  /**
   * GET - Get saved items or check if item is saved
   */
  static async getSavedItems(req, res) {
    try {
      if (!req.user?.roles?.includes('buyer')) {
        return res.status(403).json({ error: 'Buyer access required' });
      }

      const result = await BuyerActivityService.getSavedItems(
        req.user._id, req.query
      );
      return res.json(result);
    } catch (error) {
      console.error('[SavedItems-GET] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch saved items' });
    }
  }

  /**
   * POST - Toggle saved item
   */
  static async toggleSavedItem(req, res) {
    try {
      console.log('[BuyerActivityController.toggleSavedItem] req.body:', JSON.stringify(req.body));

      if (!req.user?.roles?.includes('buyer')) {
        return res.status(403).json({ error: 'Buyer access required' });
      }

      const { itemType, itemId } = req.body;

      console.log('[BuyerActivityController.toggleSavedItem] Destructured:', { itemType, itemId });

      const result = await BuyerActivityService.toggleSavedItem(
        req.user._id, itemType, itemId
      );

      const statusCode = result.saved ? 201 : 200;
      return res.status(statusCode).json(result);
    } catch (error) {
      console.error('[SavedItems-POST] Error:', error);

      if (error.statusCode === 422) {
        return res.status(422).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Failed to update saved item' });
    }
  }
}

export default BuyerActivityController;