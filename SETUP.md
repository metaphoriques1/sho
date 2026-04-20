# Shopify Inventory AI - Complete Setup Guide

## 🚀 What You Have

A **production-ready** inventory management system that:
- ✅ Fetches real order data from Shopify (last 30 days)
- ✅ Calculates weighted demand forecasts (recent = 2x weight)
- ✅ Triggers replenishment orders automatically at ROP
- ✅ Creates Draft Orders in Shopify admin (exportable to suppliers)
- ✅ Runs on cron (every hour) or on-demand
- ✅ Full error handling & logging
- ✅ Web dashboard for monitoring
- ✅ Configurable via API

---

## 📋 Prerequisites

- Node.js 16+ 
- Shopify store with Admin API access
- Access token from Shopify (private app or custom app)

---

## 🔧 Local Setup (5 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Create `.env` file
Copy `.env.example` to `.env` and fill in:
```bash
SHOPIFY_STORE=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxx
LEAD_TIME_DAYS=7
SAFETY_STOCK=10
MIN_ORDER_QTY=5
PORT=3000
```

**How to get Shopify access token:**
1. Go to Shopify Admin → Settings → Apps and integrations
2. Click "Develop apps"
3. Create a private app (or custom app if using OAuth)
4. Copy the "Admin API access token"
5. Make sure these scopes are enabled:
   - `read_products`
   - `read_orders`
   - `write_draft_orders`

### 3. Run Locally
```bash
npm start
```

You'll see:
```
✅ Server running on port 3000
⏰ Cron job triggered every hour
```

### 4. Open Dashboard
```
http://localhost:3000/dashboard.html
```

Or use API directly:
```bash
# Manual trigger
curl -X POST http://localhost:3000/run-check

# Check status
curl http://localhost:3000/health

# View logs
curl http://localhost:3000/logs
```

---

## 🌐 Deploy to Production

### Option A: Heroku (Easiest, $7/month)

```bash
# Install Heroku CLI
brew install heroku  # macOS
# or download from heroku.com/download

# Login
heroku login

# Create app
heroku create your-app-name

# Set environment variables
heroku config:set SHOPIFY_STORE=your-store.myshopify.com
heroku config:set SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
heroku config:set LEAD_TIME_DAYS=7
heroku config:set SAFETY_STOCK=10
heroku config:set MIN_ORDER_QTY=5

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Option B: DigitalOcean App Platform ($5-12/month)

1. Create account at digitalocean.com
2. Go to **App Platform** → **Create App**
3. Connect GitHub repo
4. Set environment variables (from `.env`)
5. Deploy

App will be available at `https://your-app.ondigitalocean.app`

### Option C: AWS Lambda + RDS (Serverless, pay-per-use)

Use serverless framework:
```bash
npm install -g serverless

# Deploy
serverless deploy
```

---

## 📊 How It Works

### 1. **Data Collection** (Every hour)
- Fetches all products from Shopify
- Fetches last 30 days of orders
- Extracts daily sales for each variant

### 2. **Demand Forecasting**
```
Weighted Average = (Last 7 days × 2 + Older days) / (7×2 + older_count)
```
This gives more weight to recent trends (seasonality awareness).

### 3. **Reorder Point Calculation**
```
ROP = Average Daily Sales × Lead Time (days) + Safety Stock
```

Example:
- Average daily sales: 5 units
- Lead time: 7 days
- Safety stock: 10 units
- **ROP = 5×7 + 10 = 45 units**

When stock falls below 45, replenishment is triggered.

### 4. **Order Creation**
- Target stock: ROP × 1.8 (builds buffer)
- Order quantity = snapped to nearest 5 (for supplier convenience)
- Creates **Draft Order** in Shopify admin
- You review & export to your supplier as CSV

### 5. **Logging**
All runs logged to `/logs` directory, searchable via dashboard.

---

## 🎯 Configuration

### Adjust Parameters

Edit `.env` or use dashboard to tune:

| Parameter | Default | Meaning | Adjust if... |
|-----------|---------|---------|-------------|
| `LEAD_TIME_DAYS` | 7 | Days from order to delivery | Supplier slower? Increase |
| `SAFETY_STOCK` | 10 | Minimum buffer (units) | High demand spikes? Increase |
| `MIN_ORDER_QTY` | 5 | Don't order less than this | Supplier has minimums? Increase |

**Optimization:**
- Too many orders? Increase `LEAD_TIME_DAYS` or `SAFETY_STOCK`
- Too few? Decrease them (but risk stockouts)
- See dashboard stats to find the right balance

---

## 📈 Monitoring & Metrics

### Dashboard Provides:
- ✅ Last run results (products checked, replenishments triggered)
- ✅ Error log (if anything breaks)
- ✅ Daily logs (searchable by date)
- ✅ Connection status (Shopify API health)

### Key Metrics to Watch:
```
1. Replenishment Frequency
   - Too high? Safety stock too low
   - Too low? Might miss sales spikes

2. Draft Order Status
   - All converted to real orders? Good
   - Many stuck as drafts? Review logic

3. Stockout Events
   - If happening: increase SAFETY_STOCK
   - If never: safety stock is too high

4. Forecast Accuracy
   - Compare "Avg Daily Sales" vs actual
   - Adjust LEAD_TIME_DAYS if predictions lag
```

---

## 🔒 Security Best Practices

### 1. **Environment Variables**
✅ Store tokens in `.env` (never in code)
✅ On Heroku/DO, use their config management (never paste to GitHub)

### 2. **API Access**
❌ Don't expose `/configure` endpoint to public
✅ Protect with basic auth or API key:

```javascript
// In server.js, add middleware:
app.use((req, res, next) => {
  if (req.path === '/configure' && req.method === 'POST') {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.API_KEY}`) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  next();
});
```

Then set in `.env`:
```
API_KEY=super-secret-key-change-me
```

### 3. **Dashboard Access**
❌ Don't expose to public internet
✅ Options:
- Serve on private network (VPN)
- Add basic auth to dashboard
- Use reverse proxy (nginx) with auth

### 4. **Token Rotation**
- Shopify tokens don't expire
- Regenerate if compromised
- Use Custom App (better control) over Private App

---

## 🐛 Troubleshooting

### "Connection refused" on Shopify API
```
Cause: Invalid store URL or token
Fix: Check .env, regenerate token in Shopify admin
```

### "Rate limit exceeded"
```
Cause: Shopify API throttling (2 req/sec)
Fix: Batching is implemented, but if still hitting limits:
  - Space out cron jobs (change schedule to every 2 hours)
  - Reduce products in check (filter by tag in inventory.ai)
```

### Cron not running on Heroku
```
Cause: Dyno sleeping (Heroku free tier)
Fix: Upgrade to paid dyno, or add external cron:
  - Use EasyCron (easycron.com) to call /run-check every hour
```

### Dashboard shows "Not Configured"
```
Cause: .env not loaded or API endpoint unreachable
Fix: 
  1. Check .env file exists and is readable
  2. Check logs: heroku logs --tail
  3. Restart: heroku restart
```

---

## 📞 Support Endpoints

All endpoints return JSON. No authentication by default (add as described above).

### Health Check
```
GET /health
→ { "status": "connected", "timestamp": "..." }
```

### Configure
```
POST /configure
Body: {
  "store": "your-store.myshopify.com",
  "token": "shpat_xxx",
  "lead_time_days": 7,
  "safety_stock": 10,
  "min_order_qty": 5
}
→ { "message": "Configured successfully", "store": "..." }
```

### Trigger Manually
```
POST /run-check
→ {
  "timestamp": "2024-01-15T10:30:00Z",
  "products_checked": 250,
  "replenishments_triggered": 3,
  "draft_order_id": 123456,
  "errors": []
}
```

### View Logs
```
GET /logs
→ [{ "date": "2024-01-15.log", "path": "/logs/2024-01-15.log" }, ...]

GET /logs/2024-01-15.log
→ (plain text file contents)
```

---

## 💰 Monetization (For Your SaaS)

### Pricing Tiers

**Basic ($29/month)**
- 1 Shopify store
- Daily replenishment checks
- Email alerts on triggers

**Pro ($79/month)**
- 5 stores
- Hourly checks
- Slack integration
- Forecast analytics

**Enterprise (Custom)**
- Unlimited stores
- Custom cron schedule
- White-label dashboard
- API access for partners

### Implementation

Add subscription check in `server.js`:
```javascript
async function checkSubscription(req, res, next) {
  const store = req.headers['x-shopify-store'];
  const subscription = await db.getSubscription(store);
  
  if (!subscription || subscription.status !== 'active') {
    return res.status(403).json({ error: 'Subscription required' });
  }
  next();
}
```

---

## 📝 Next Steps

1. **Deploy** to Heroku or DigitalOcean (15 min)
2. **Test** with 5-10 test products manually
3. **Monitor** dashboard for 3-5 days
4. **Adjust** SAFETY_STOCK based on results
5. **Launch** to customers

Good luck! 🚀
