require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

// ============================================================================
// LOGGER & UTILITIES
// ============================================================================
const logger = {
  log: (msg, level = 'INFO') => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${msg}`;
    console.log(logEntry);
    const logFile = path.join(LOG_DIR, `${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logEntry + '\n');
  },
  error: (msg, err) => logger.log(`${msg}: ${err?.message || err}`, 'ERROR'),
  warn: (msg) => logger.log(msg, 'WARN'),
  success: (msg) => logger.log(msg, 'SUCCESS'),
};

// ============================================================================
// SHOPIFY CLIENT
// ============================================================================
class ShopifyClient {
  constructor(store, token) {
    this.store = store;
    this.token = token;
    this.client = axios.create({
      baseURL: `https://${store}/admin/api/2024-01/`,
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  async get(endpoint) {
    try {
      const { data } = await this.client.get(endpoint);
      return data;
    } catch (err) {
      throw new Error(`Shopify GET ${endpoint}: ${err.response?.status} ${err.message}`);
    }
  }

  async post(endpoint, body) {
    try {
      const { data } = await this.client.post(endpoint, body);
      return data;
    } catch (err) {
      throw new Error(`Shopify POST ${endpoint}: ${err.response?.status} ${err.message}`);
    }
  }

  // Get all products with variants
  async getProducts(limit = 100) {
    const products = [];
    let nextPageUrl = `products.json?limit=${limit}&fields=id,title,variants`;
    while (nextPageUrl) {
      const data = await this.get(nextPageUrl);
      products.push(...data.products);
      nextPageUrl = null; // Single page for simplicity; add cursor pagination if needed
    }
    return products;
  }

  // Get last 30 days of orders
  async getOrders(days = 30) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const endpoint = `orders.json?created_at_min=${sinceDate.toISOString()}&limit=250&status=any`;
    const data = await this.get(endpoint);
    return data.orders || [];
  }

  // Create draft order (for replenishment)
  async createDraftOrder(items, note) {
    const draftOrder = {
      draft_order: {
        line_items: items.map(item => ({
          variant_id: item.variant_id,
          quantity: item.quantity,
        })),
        note,
        custom_attributes: [
          { name: 'replenishment_auto', value: 'true' }
        ]
      }
    };
    return await this.post('draft_orders.json', draftOrder);
  }
}

// ============================================================================
// INVENTORY AI LOGIC
// ============================================================================
class InventoryAI {
  constructor(shopify, config) {
    this.shopify = shopify;
    this.leadTimeDays = config.lead_time_days || 7;
    this.safetyStock = config.safety_stock || 10;
    this.minOrderQuantity = config.min_order_qty || 5;
  }

  // Calculate weighted average (recent days weighted 2x)
  calculateWeightedAverage(dailySales) {
    if (dailySales.length === 0) return 5; // Fallback for new products
    
    const recentDays = Math.min(7, Math.floor(dailySales.length * 0.3));
    const recent = dailySales.slice(-recentDays);
    const older = dailySales.slice(0, -recentDays);
    
    const recentSum = recent.reduce((a, b) => a + b, 0);
    const olderSum = older.reduce((a, b) => a + b, 0);
    
    if (older.length === 0) return recentSum / recentDays;
    return (recentSum * 2 + olderSum) / (recentDays * 2 + older.length);
  }

  // Extract daily sales for variant from orders
  extractDailySalesForVariant(variantId, orders) {
    const days = {};
    const now = new Date();
    
    // Initialize last 30 days
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      days[key] = 0;
    }
    
    // Tally orders
    orders.forEach(order => {
      const orderDate = new Date(order.created_at).toISOString().split('T')[0];
      if (days.hasOwnProperty(orderDate)) {
        const qty = order.line_items
          .filter(li => li.variant_id === variantId)
          .reduce((sum, li) => sum + li.quantity, 0);
        days[orderDate] += qty;
      }
    });
    
    return Object.values(days).reverse(); // Oldest first
  }

  // Calculate reorder point
  calculateROP(avgDailySales) {
    return avgDailySales * this.leadTimeDays + this.safetyStock;
  }

  // Calculate order quantity (account for min order qty)
  calculateOrderQuantity(rop, currentStock) {
    const maxStock = rop * 1.8; // Try to reach 1.8x the ROP
    let quantity = Math.ceil(maxStock - currentStock);
    
    // Snap to minimum
    if (quantity < this.minOrderQuantity) return 0;
    
    // Round to nearest 5 for supplier convenience
    return Math.ceil(quantity / 5) * 5;
  }

  // Main check
  async run() {
    const results = {
      timestamp: new Date().toISOString(),
      products_checked: 0,
      replenishments_triggered: 0,
      errors: []
    };

    try {
      logger.log('🔄 Starting inventory check...');
      
      // Fetch data
      const products = await this.shopify.getProducts();
      const orders = await this.shopify.getOrders(30);
      results.products_checked = products.length;

      const replenishmentItems = [];
      
      // Check each variant
      for (const product of products) {
        for (const variant of product.variants || []) {
          try {
            if (!variant.id) continue;

            const currentStock = variant.inventory_quantity || 0;
            const dailySales = this.extractDailySalesForVariant(variant.id, orders);
            const avgDailySales = this.calculateWeightedAverage(dailySales);
            const rop = this.calculateROP(avgDailySales);
            const orderQty = this.calculateOrderQuantity(rop, currentStock);

            if (orderQty > 0) {
              logger.log(
                `📦 ${product.title} (${variant.sku || variant.id}): ` +
                `stock=${currentStock}, avg_sales=${avgDailySales.toFixed(1)}/day, ` +
                `ROP=${rop.toFixed(0)}, order=${orderQty} units`
              );

              replenishmentItems.push({
                variant_id: variant.id,
                quantity: orderQty,
                title: product.title,
                sku: variant.sku,
              });

              results.replenishments_triggered++;
            }
          } catch (err) {
            results.errors.push(`Variant ${variant.id}: ${err.message}`);
            logger.warn(`Variant error: ${err.message}`);
          }
        }
      }

      // Create draft order if needed
      if (replenishmentItems.length > 0) {
        try {
          const draftNote = 
            `🤖 AUTO REPLENISHMENT\n` +
            `Generated: ${new Date().toISOString()}\n` +
            `Lead time: ${this.leadTimeDays} days\n` +
            `Items: ${replenishmentItems.map(i => `${i.sku || i.variant_id} (${i.quantity})`).join(', ')}`;
          
          const draft = await this.shopify.createDraftOrder(replenishmentItems, draftNote);
          logger.success(`✅ Created Draft Order #${draft.draft_order.id} with ${replenishmentItems.length} items`);
          results.draft_order_id = draft.draft_order.id;
        } catch (err) {
          results.errors.push(`Draft order creation: ${err.message}`);
          logger.error('Draft order failed', err);
        }
      } else {
        logger.log('✓ No replenishments needed');
      }

      return results;
    } catch (err) {
      results.errors.push(`Fatal: ${err.message}`);
      logger.error('Inventory check failed', err);
      throw err;
    }
  }
}

// ============================================================================
// GLOBAL STATE
// ============================================================================
let shopify = null;
let inventoryAI = null;

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: shopify ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// Manual trigger
app.post('/run-check', async (req, res) => {
  if (!shopify || !inventoryAI) {
    return res.status(400).json({ error: 'Not configured. Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN.' });
  }

  try {
    const results = await inventoryAI.run();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get logs
app.get('/logs', (req, res) => {
  try {
    const files = fs.readdirSync(LOG_DIR).sort().reverse().slice(0, 5);
    const logs = files.map(file => ({
      date: file,
      path: `/logs/${file}`,
    }));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific log
app.get('/logs/:filename', (req, res) => {
  try {
    const filePath = path.join(LOG_DIR, req.params.filename);
    if (!filePath.startsWith(LOG_DIR)) throw new Error('Invalid path');
    const content = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/plain');
    res.send(content);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Configuration endpoint
app.post('/configure', (req, res) => {
  const { store, token, lead_time_days, safety_stock, min_order_qty } = req.body;

  if (!store || !token) {
    return res.status(400).json({ error: 'Missing store or token' });
  }

  try {
    shopify = new ShopifyClient(store, token);
    inventoryAI = new InventoryAI(shopify, {
      lead_time_days: lead_time_days || 7,
      safety_stock: safety_stock || 10,
      min_order_qty: min_order_qty || 5,
    });

    logger.success(`✅ Configured for store: ${store}`);
    res.json({ message: 'Configured successfully', store });
  } catch (err) {
    logger.error('Configuration failed', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// STARTUP & CRON
// ============================================================================

const server = app.listen(PORT, () => {
  logger.success(`🚀 Server running on port ${PORT}`);
  logger.log('POST /configure with {"store":"...", "token":"..."}');
  logger.log('POST /run-check to trigger manually');
  logger.log('GET /health to check status');
  logger.log('GET /logs to list logs');

  // Schedule cron job: every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    if (shopify && inventoryAI) {
      try {
        logger.log('⏰ Cron job triggered');
        await inventoryAI.run();
      } catch (err) {
        logger.error('Cron job failed', err);
      }
    }
  });

  // Try to auto-configure from env
  if (process.env.SHOPIFY_STORE && process.env.SHOPIFY_ACCESS_TOKEN) {
    shopify = new ShopifyClient(
      process.env.SHOPIFY_STORE,
      process.env.SHOPIFY_ACCESS_TOKEN
    );
    inventoryAI = new InventoryAI(shopify, {
      lead_time_days: parseInt(process.env.LEAD_TIME_DAYS) || 7,
      safety_stock: parseInt(process.env.SAFETY_STOCK) || 10,
      min_order_qty: parseInt(process.env.MIN_ORDER_QTY) || 5,
    });
    logger.success('✅ Auto-configured from environment variables');
  }
});

process.on('SIGTERM', () => {
  logger.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.log('Server closed');
    process.exit(0);
  });
});
