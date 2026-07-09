import Warehouse from '../models/Warehouse.js';
import WarehouseInventory from '../models/WarehouseInventory.js';
import WarehouseOrder from '../models/WarehouseOrder.js';
import mongoose from 'mongoose';

class WarehouseRepository {
  /**
   * Check valid ObjectId
   */
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  // ==================== WAREHOUSES ====================

  /**
   * Get all active warehouses
   */
  static async getWarehouses() {
    return Warehouse.find({ status: 'active' })
      .sort({ country: 1, city: 1 })
      .lean();
  }

  // ==================== INVENTORY ====================

  /**
   * Find inventory with pagination
   */
  static async findInventory(query, { page = 1, limit = 10 } = {}) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      WarehouseInventory.find(query)
        .populate('warehouseId', 'name code address')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WarehouseInventory.countDocuments(query),
    ]);

    return {
      inventory: data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Upsert inventory (add or update)
   */
  static async upsertInventory(userId, warehouseId, sku, updateData) {
    return WarehouseInventory.findOneAndUpdate(
      { userId, warehouseId, sku },
      {
        $setOnInsert: {
          userId,
          warehouseId,
          sku,
          productName: updateData.productName,
          unitValue: updateData.unitValue || 0,
          storageType: updateData.storageType || 'standard',
        },
        $inc: {
          totalQuantity: updateData.quantity,
          availableQuantity: updateData.quantity,
        },
        $set: {
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true }
    );
  }

  /**
   * Get inventories by IDs
   */
  static async getInventoriesByIds(inventoryIds, userId, warehouseId) {
    return WarehouseInventory.find({
      _id: { $in: inventoryIds },
      userId,
      warehouseId,
    })
      .select('_id productName availableQuantity')
      .lean();
  }

  /**
   * Reserve inventory quantity
   */
  static async reserveInventory(inventoryId, userId, warehouseId, quantity) {
    return WarehouseInventory.findOneAndUpdate(
      {
        _id: inventoryId,
        userId,
        warehouseId,
        availableQuantity: { $gte: quantity },
      },
      {
        $inc: {
          availableQuantity: -quantity,
          reservedQuantity: quantity,
        },
      }
    );
  }

  // ==================== WAREHOUSE ORDERS ====================

  /**
   * Find warehouse orders with pagination
   */
  static async findOrders(query, { page = 1, limit = 10 } = {}) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      WarehouseOrder.find(query)
        .populate('warehouseId', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WarehouseOrder.countDocuments(query),
    ]);

    return {
      orders: data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Create warehouse order
   */
  static async createOrder(data) {
    return WarehouseOrder.create(data);
  }

  /**
   * Find warehouse by ID
   */
  static async findWarehouseById(warehouseId) {
    if (!this.isValidId(warehouseId)) return null;
    return Warehouse.findById(warehouseId).select('_id name pickPackRate currentOccupancy').lean();
  }

  /**
   * Update warehouse occupancy
   */
  static async updateOccupancy(warehouseId, increment) {
    return Warehouse.findByIdAndUpdate(warehouseId, {
      $inc: { currentOccupancy: increment },
    });
  }
}

export default WarehouseRepository;