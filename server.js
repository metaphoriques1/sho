const express = require("express");
const axios = require("axios");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_SCOPES,
  SHOPIFY_REDIRECT_URI,
  PORT = 3000
} = process.env;

// In-memory storage (replace with DB in production)
const stores = new Map();
const analytics = new Map();

// ============================================
// 1. HEALTH & HOME
// ============================================
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// ============================================
// 2. SHOPIFY OAUTH FLOW
// ============================================
app.get("/auth", (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: "Missing shop param" });

  const authUrl =
    `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${SHOPIFY_SCOPES}` +
    `&redirect_uri=${SHOPIFY_REDIRECT_URI}`;

  res.redirect(authUrl);
});

app.get("/callback", async (req, res) => {
  const { shop, code } = req.query;

  if (!shop || !code) {
    return res.status(400).json({ error: "Missing shop or code" });
  }

  try {
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code
    });

    const token = response.data.access_token;

    // Store the shop data
    stores.set(shop, {
      token,
      shop,
      connectedAt: new Date(),
      lastSync: null,
      inventoryCount: 0,
      orderCount: 0
    });

    console.log(`✅ Shop connected: ${shop}`);

    // Redirect to dashboard with shop param
    res.redirect(`/dashboard?shop=${encodeURIComponent(shop)}`);
  } catch (error) {
    console.error("OAuth error:", error.response?.data || error.message);
    res.status(500).json({ error: "OAuth failed" });
  }
});

// ============================================
// 3. INVENTORY MANAGEMENT API
// ============================================
app.get("/api/inventory", async (req, res) => {
  const shop = req.query.shop;
  const storeData = stores.get(shop);

  if (!storeData) {
    return res.status(401).json({ error: "Shop not connected" });
  }

  try {
    const response = await axios.get(
      `https://${shop}/admin/api/2024-01/products.json?limit=250`,
      { headers: { "X-Shopify-Access-Token": storeData.token } }
    );

    const products = response.data.products.map(p => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      variants: p.variants.map(v => ({
        id: v.id,
        sku: v.sku,
        title: v.title,
        inventory: v.inventory_quantity || 0,
        price: v.price
      }))
    }));

    // Calculate ROP (Reorder Point) - demo calculation
    const productsWithROP = products.map(p => ({
      ...p,
      rop: Math.ceil(p.variants.reduce((sum, v) => sum + v.inventory, 0) * 0.3),
      status: p.variants.some(v => v.inventory <= 5) ? "LOW" : "OK"
    }));

    res.json({
      shop,
      count: products.length,
      products: productsWithROP,
      lastSync: new Date()
    });
  } catch (error) {
    console.error("Inventory error:", error.message);
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

// ============================================
// 4. ORDERS & ANALYTICS
// ============================================
app.get("/api/orders", async (req, res) => {
  const shop = req.query.shop;
  const storeData = stores.get(shop);

  if (!storeData) {
    return res.status(401).json({ error: "Shop not connected" });
  }

  try {
    const response = await axios.get(
      `https://${shop}/admin/api/2024-01/orders.json?status=any&limit=250`,
      { headers: { "X-Shopify-Access-Token": storeData.token } }
    );

    const orders = response.data.orders;

    // Calculate analytics
    const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const avgOrderValue = totalRevenue / orders.length || 0;
    const totalCustomers = new Set(orders.map(o => o.customer_id)).size;

    // Forecast demand (next 30 days based on last 30)
    const last30Days = orders.filter(o => {
      const orderDate = new Date(o.created_at);
      const daysDiff = (Date.now() - orderDate) / (1000 * 60 * 60 * 24);
      return daysDiff <= 30;
    });

    const forecastedDemand = Math.ceil(last30Days.length * 1.15); // 15% growth

    res.json({
      shop,
      totalOrders: orders.length,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
      totalCustomers,
      last30Days: last30Days.length,
      forecastedDemand,
      orders: orders.slice(0, 50) // Last 50 orders
    });
  } catch (error) {
    console.error("Orders error:", error.message);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// ============================================
// 5. CUSTOMER MANAGEMENT
// ============================================
app.get("/api/customers", async (req, res) => {
  const shop = req.query.shop;
  const storeData = stores.get(shop);

  if (!storeData) {
    return res.status(401).json({ error: "Shop not connected" });
  }

  try {
    const response = await axios.get(
      `https://${shop}/admin/api/2024-01/customers.json?limit=250`,
      { headers: { "X-Shopify-Access-Token": storeData.token } }
    );

    const customers = response.data.customers;

    // Segment customers
    const segments = {
      vip: customers.filter(c => c.orders_count >= 5).length,
      regular: customers.filter(c => c.orders_count >= 2 && c.orders_count < 5).length,
      new: customers.filter(c => c.orders_count === 1).length,
      inactive: customers.filter(c => c.orders_count === 0).length
    };

    res.json({
      shop,
      totalCustomers: customers.length,
      segments,
      topCustomers: customers
        .sort((a, b) => parseFloat(b.total_spent || 0) - parseFloat(a.total_spent || 0))
        .slice(0, 20)
    });
  } catch (error) {
    console.error("Customers error:", error.message);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

// ============================================
// 6. CAMPAIGNS & EMAIL MANAGEMENT
// ============================================
app.post("/api/campaign", async (req, res) => {
  const { shop, type, title, message, targetSegment } = req.body;
  const storeData = stores.get(shop);

  if (!storeData) {
    return res.status(401).json({ error: "Shop not connected" });
  }

  try {
    // Store campaign (in production, send actual emails)
    const campaign = {
      id: Date.now(),
      shop,
      type,
      title,
      message,
      targetSegment,
      createdAt: new Date(),
      status: "PENDING"
    };

    if (!analytics.has(shop)) {
      analytics.set(shop, { campaigns: [] });
    }

    analytics.get(shop).campaigns.push(campaign);

    console.log(`📧 Campaign created: ${title} for ${targetSegment}`);

    res.json({
      success: true,
      campaign,
      message: `Campaign "${title}" queued for ${targetSegment} segment`
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

// ============================================
// 7. DRAFT ORDERS (Bulk Operations)
// ============================================
app.post("/api/draft-order", async (req, res) => {
  const { shop, lineItems, customerEmail } = req.body;
  const storeData = stores.get(shop);

  if (!storeData) {
    return res.status(401).json({ error: "Shop not connected" });
  }

  try {
    const draftOrder = {
      draft_order: {
        line_items: lineItems,
        customer: { email: customerEmail },
        note: "Auto-generated draft order"
      }
    };

    const response = await axios.post(
      `https://${shop}/admin/api/2024-01/draft_orders.json`,
      draftOrder,
      { headers: { "X-Shopify-Access-Token": storeData.token } }
    );

    res.json({
      success: true,
      draftOrder: response.data.draft_order
    });
  } catch (error) {
    console.error("Draft order error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create draft order" });
  }
});

// ============================================
// 8. DASHBOARD DATA (All-in-one)
// ============================================
app.get("/api/dashboard", async (req, res) => {
  const shop = req.query.shop;
  const storeData = stores.get(shop);

  if (!storeData) {
    return res.status(401).json({ error: "Shop not connected" });
  }

  try {
    // Fetch all data in parallel
    const [ordersRes, inventoryRes, customersRes] = await Promise.all([
      axios.get(`https://${shop}/admin/api/2024-01/orders.json?status=any&limit=100`, {
        headers: { "X-Shopify-Access-Token": storeData.token }
      }),
      axios.get(`https://${shop}/admin/api/2024-01/products.json?limit=100`, {
        headers: { "X-Shopify-Access-Token": storeData.token }
      }),
      axios.get(`https://${shop}/admin/api/2024-01/customers.json?limit=100`, {
        headers: { "X-Shopify-Access-Token": storeData.token }
      })
    ]);

    const orders = ordersRes.data.orders;
    const products = inventoryRes.data.products;
    const customers = customersRes.data.customers;

    const dashboard = {
      shop,
      metrics: {
        totalOrders: orders.length,
        totalRevenue: parseFloat(
          orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0).toFixed(2)
        ),
        totalCustomers: customers.length,
        activeProducts: products.length,
        lowStockItems: products.filter(p =>
          p.variants.some(v => v.inventory_quantity <= 5)
        ).length
      },
      topProducts: products
        .map(p => ({
          id: p.id,
          title: p.title,
          inventory: p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0)
        }))
        .sort((a, b) => b.inventory - a.inventory)
        .slice(0, 5),
      recentOrders: orders.slice(0, 10)
    };

    // Update store data
    storeData.lastSync = new Date();
    storeData.inventoryCount = products.length;
    storeData.orderCount = orders.length;

    res.json(dashboard);
  } catch (error) {
    console.error("Dashboard error:", error.message);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// ============================================
// 9. STORE STATUS
// ============================================
app.get("/api/store-status", (req, res) => {
  const shop = req.query.shop;
  const storeData = stores.get(shop);

  if (!storeData) {
    return res.status(401).json({ error: "Shop not found" });
  }

  res.json(storeData);
});

// ============================================
// 10. DISCONNECT
// ============================================
app.post("/api/disconnect", (req, res) => {
  const shop = req.query.shop;
  stores.delete(shop);
  analytics.delete(shop);
  res.json({ success: true, message: `${shop} disconnected` });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🚀 Shopify SaaS Running              ║
║   Port: ${PORT}                          ║
║   URL: http://localhost:${PORT}         ║
║   Dashboard: http://localhost:${PORT}/dashboard ║
╚════════════════════════════════════════╝
  `);
});

module.exports = app;
