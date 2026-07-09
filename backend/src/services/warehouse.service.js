import WarehouseRepository from '../repositories/warehouse.repository.js';
import NotificationService from './notification.service.js';
import {
  warehouseOperationSchema,
  INVENTORY_STATUSES,
  WAREHOUSE_ORDER_STATUSES,
  WAREHOUSE_ORDER_TYPES,
  toPositiveInt,
} from '../validators/warehouse.validator.js';

class WarehouseService {
  /**
   * Get warehousing data (warehouses, inventory, or orders)
   */
  static async getData(userId, query = {}) {
    const { type, status, warehouseId, page: rawPage, limit: rawLimit } = query;
    const page = toPositiveInt(rawPage, 1);
    const limit = toPositiveInt(rawLimit, 10, 50);

    // Warehouses
    if (type === 'warehouses') {
      const warehouses = await WarehouseRepository.getWarehouses();
      return { warehouses, total: warehouses.length };
    }

    // Inventory
    if (type === 'inventory') {
      const dbQuery = { userId };
      if (warehouseId && WarehouseRepository.isValidId(warehouseId)) {
        dbQuery.warehouseId = warehouseId;
      }
      if (status && INVENTORY_STATUSES.includes(status)) {
        dbQuery.status = status;
      }

      return WarehouseRepository.findInventory(dbQuery, { page, limit });
    }

    // Orders (default)
    const dbQuery = { userId };
    if (status && status !== 'all' && WAREHOUSE_ORDER_STATUSES.includes(status)) {
      dbQuery.status = status;
    }
    if (warehouseId && WarehouseRepository.isValidId(warehouseId)) {
      dbQuery.warehouseId = warehouseId;
    }

    return WarehouseRepository.findOrders(dbQuery, { page, limit });
  }

  /**
   * Process warehouse operation (add_inventory or create_order)
   */
  static async processOperation(userId, data) {
    // Validate
    const parsed = warehouseOperationSchema.safeParse(data);
    if (!parsed.success) {
      const action = data?.action;
      const errorMsg = action === 'create_order'
        ? 'Missing required fields: warehouseId, type, items'
        : action === 'add_inventory'
          ? 'Missing required fields: warehouseId, sku, quantity'
          : 'Invalid action';

      throw Object.assign(new Error(errorMsg), { statusCode: 400 });
    }

    const { action, ...operationData } = parsed.data;

    // ADD INVENTORY
    if (action === 'add_inventory') {
      const { warehouseId, sku, productName, quantity, unitValue, storageType } = operationData;

      // Verify warehouse exists
      const warehouse = await WarehouseRepository.findWarehouseById(warehouseId);
      if (!warehouse) {
        throw Object.assign(new Error('Warehouse not found'), { statusCode: 404 });
      }

      // Upsert inventory
      const inventory = await WarehouseRepository.upsertInventory(
        userId, warehouseId, sku, { productName, quantity, unitValue, storageType }
      );

      // Update warehouse occupancy
      await WarehouseRepository.updateOccupancy(warehouseId, quantity);

      // Notify
      await NotificationService.createNotification({
        userId,
        notificationType: 'inventory_added',
        title: 'Inventory Added',
        description: `${quantity} units of ${productName || sku} added to ${warehouse.name}.`,
        data: {
          relatedId: inventory._id,
          relatedModel: 'WarehouseInventory',
          actionUrl: '/dashboard/buyer/warehousing',
        },
        priority: 'low',
      }).catch(err => console.error('Warehouse notification error:', err));

      return { inventory, message: 'Inventory added successfully' };
    }

    // CREATE ORDER
    if (action === 'create_order') {
      const { warehouseId, type, items, shippingAddress, specialInstructions } = operationData;

      // Validate stock availability
      const inventoryIds = items.map(item => item.inventoryId);
      const inventories = await WarehouseRepository.getInventoriesByIds(
        inventoryIds, userId, warehouseId
      );

      const inventoryById = new Map(
        inventories.map(inv => [String(inv._id), inv])
      );

      for (const item of items) {
        const inventory = inventoryById.get(String(item.inventoryId));
        if (!inventory || inventory.availableQuantity < item.quantity) {
          throw Object.assign(
            new Error(
              `Insufficient stock for ${inventory?.productName || item.inventoryId}. Available: ${inventory?.availableQuantity || 0}`
            ),
            { statusCode: 400 }
          );
        }
      }

      // Calculate fees
      const warehouse = await WarehouseRepository.findWarehouseById(warehouseId);
      const pickPackFee = items.length * (warehouse?.pickPackRate || 2.5);
      const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

      // Create order
      const order = await WarehouseRepository.createOrder({
        userId,
        warehouseId,
        type,
        items,
        shippingAddress,
        specialInstructions,
        pickPackFee,
        totalCost: pickPackFee,
        status: 'pending',
      });

      // Reserve inventory
      for (const item of items) {
        await WarehouseRepository.reserveInventory(
          item.inventoryId, userId, warehouseId, item.quantity
        );
      }

      // Notify
      await NotificationService.createNotification({
        userId,
        notificationType: 'warehouse_order_created',
        title: 'Fulfillment Order Created',
        description: `Order ${order.orderNumber} has been created for ${totalItems} items.`,
        data: {
          relatedId: order._id,
          relatedModel: 'WarehouseOrder',
          actionUrl: `/dashboard/buyer/warehousing/orders/${order._id}`,
        },
        priority: 'medium',
      }).catch(err => console.error('Warehouse notification error:', err));

      return { order, message: 'Fulfillment order created successfully' };
    }

    throw Object.assign(new Error('Invalid action'), { statusCode: 400 });
  }
}

export default WarehouseService;