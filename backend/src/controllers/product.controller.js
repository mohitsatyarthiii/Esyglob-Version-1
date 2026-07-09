import ProductService from '../services/product.service.js';

class ProductController {
  /**
   * GET /api/products - Ultra-fast public listing
   */
  static async getProducts(req, res) {
    try {
      const result = await ProductService.getProducts(req.query, req.user);
      
      // Aggressive caching headers
      res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=30, stale-while-revalidate=60');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      return res.json(result);
    } catch (error) {
      console.error('[Products-GET] Error:', error.message);
      if (error.statusCode === 403) {
        return res.status(403).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Unable to fetch products' });
    }
  }

  /**
   * GET /api/products/:productId - Product detail
   */
  static async getProductDetail(req, res) {
    try {
      const result = await ProductService.getProductDetail(req.params.productId, req.user);
      
      // Cache for longer period
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=300');
      
      return res.json(result);
    } catch (error) {
      console.error('[Product-Detail] Error:', error.message);
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to fetch product' });
    }
  }

  /**
   * POST /api/products - Create product
   */
  static async createProduct(req, res) {
    try {
      const result = await ProductService.createProduct(req.user._id, req.body);
      return res.status(201).json(result);
    } catch (error) {
      console.error('[Product-Create] Error:', error.message);
      if (error.name === 'ZodError') {
        return res.status(422).json({ error: 'Please fill all required product fields' });
      }
      if (error.statusCode === 409) return res.status(409).json({ error: error.message });
      if (error.statusCode === 422) return res.status(422).json({ error: error.message });
      return res.status(500).json({ error: 'Unable to create product' });
    }
  }

  /**
   * PATCH /api/products/:productId - Update product
   */
  static async updateProduct(req, res) {
    try {
      const result = await ProductService.updateProduct(req.user._id, req.params.productId, req.body);
      return res.json(result);
    } catch (error) {
      console.error('[Product-Update] Error:', error.message);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to update product' });
    }
  }

  /**
   * DELETE /api/products/:productId - Delete product
   */
  static async deleteProduct(req, res) {
    try {
      const result = await ProductService.deleteProduct(req.user._id, req.params.productId);
      return res.json(result);
    } catch (error) {
      console.error('[Product-Delete] Error:', error.message);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.statusCode === 403) return res.status(403).json({ error: error.message });
      if (error.statusCode === 404) return res.status(404).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to delete product' });
    }
  }
}

export default ProductController;