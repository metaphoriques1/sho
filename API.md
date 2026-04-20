# Shopify Inventory AI - API Reference

Complete API documentation with curl examples and response schemas.

---

## Base URL

```
http://localhost:3000
```

Or your deployed URL (e.g., `https://my-inventory-app.herokuapp.com`)

---

## Authentication

**Current:** None (add IP whitelist or API key as needed)

**To add basic auth**, modify `server.js`:
```javascript
const API_KEY = process.env.API_KEY;
const authMiddleware = (req, res, next) => {
  if (req.path.startsWith('/api') && req.headers.authorization !== `Bearer ${API_KEY}`) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
};
app.use(authMiddleware);
```

---

## Endpoints

### 1. Health Check

**Verify the app is running and Shopify is connected.**

```
GET /health
```

**Response:**
```json
{
  "status": "connected",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

**Example:**
```bash
curl http://localhost:3000/health
```

---

### 2. Configure

**Set Shopify store and inventory parameters.**

```
POST /configure
Content-Type: application/json

{
  "store": "your-store.myshopify.com",
  "token": "shpat_xxxxx",
  "lead_time_days": 7,
  "safety_stock": 10,
  "min_order_qty": 5
}
```

**Response:**
```json
{
  "message": "Configured successfully",
  "store": "your-store.myshopify.com"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/configure \
  -H "Content-Type: application/json" \
  -d '{
    "store": "mystore.myshopify.com",
    "token": "shpat_abc123",
    "lead_time_days": 7,
    "safety_stock": 10,
    "min_order_qty": 5
  }'
```

**Note:** Also set these in `.env` for auto-configuration on startup.

---

### 3. Run Check

**Manually trigger an inventory check.**

```
POST /run-check
```

**Response:**
```json
{
  "timestamp": "2024-01-15T10:35:22.456Z",
  "products_checked": 250,
  "replenishments_triggered": 3,
  "draft_order_id": 1234567890,
  "errors": []
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/run-check
```

**Response if not configured:**
```json
{
  "error": "Not configured. Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN."
}
```

**What happens:**
1. Fetches all products from Shopify
2. Fetches last 30 days of orders
3. Calculates weighted average daily sales per variant
4. Computes ROP for each variant
5. Creates Draft Order for items below ROP
6. Returns results and draft order ID (if created)

---

### 4. Get Logs List

**List available log files.**

```
GET /logs
```

**Response:**
```json
[
  {
    "date": "2024-01-15.log",
    "path": "/logs/2024-01-15.log"
  },
  {
    "date": "2024-01-14.log",
    "path": "/logs/2024-01-14.log"
  }
]
```

**Example:**
```bash
curl http://localhost:3000/logs
```

---

### 5. Get Specific Log

**Read contents of a specific log file.**

```
GET /logs/:filename
```

**Response:** Plain text file with all log entries.

**Example:**
```bash
curl http://localhost:3000/logs/2024-01-15.log
```

**Log Format:**
```
[2024-01-15T10:35:22.456Z] [INFO] 🔄 Starting inventory check...
[2024-01-15T10:35:23.789Z] [SUCCESS] ✅ Loaded 250 products
[2024-01-15T10:35:24.012Z] [INFO] 📦 Blue Widget (SKU-123): stock=15, avg_sales=5.2/day, ROP=47, order=35 units
[2024-01-15T10:35:25.345Z] [SUCCESS] ✅ Created Draft Order #1234567890 with 1 items
```

---

## Response Schemas

### Run Check Response (Full Example)

```json
{
  "timestamp": "2024-01-15T10:35:25.456Z",
  "products_checked": 250,
  "replenishments_triggered": 3,
  "draft_order_id": 1234567890,
  "errors": [
    "Variant 987654321: Could not determine inventory",
    "Product SKU-999: Invalid data"
  ]
}
```

**Fields:**
- `timestamp`: When the check ran (ISO 8601)
- `products_checked`: Total products analyzed
- `replenishments_triggered`: Draft orders created
- `draft_order_id`: Shopify draft order ID (if > 0 items)
- `errors`: Array of non-fatal errors (check won't stop)

---

## Cron Schedule

By default, checks run at **:00 of every hour** (00:00, 01:00, 02:00, etc).

To change, edit `server.js`:
```javascript
// Every hour at :00
cron.schedule('0 * * * *', ...);

// Every day at 9 AM
cron.schedule('0 9 * * *', ...);

// Every 30 minutes
cron.schedule('*/30 * * * *', ...);

// Every Monday at 8 AM
cron.schedule('0 8 * * 1', ...);
```

Use [crontab.guru](https://crontab.guru) to test patterns.

---

## Error Handling

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Not configured` | Missing .env vars | Set `SHOPIFY_STORE` & `SHOPIFY_ACCESS_TOKEN` |
| `Invalid token` | Wrong access token | Regenerate in Shopify Admin |
| `Rate limit exceeded` | Too many API calls | Wait 1 minute, cron will retry next hour |
| `Shopify API error: 401` | Token expired | Regenerate token |
| `Network timeout` | Shopify API unreachable | Check internet, retry manually |

### How Errors Are Handled

- **Fatal errors**: Logged, execution stops, alert sent
- **Non-fatal errors**: Logged, continue with other items
- **Retry logic**: Cron job retries in next run (built-in)

---

## Rate Limiting

Shopify allows **2 requests per second** per store.

**How we handle it:**
- Batch requests for products and orders
- Single API call per run cycle
- Automatic delays between calls

**If hitting limits:**
- Increase cron interval (e.g., every 2 hours)
- Filter products by collection/tag
- Contact Shopify for higher limits

---

## Testing

### Test Health
```bash
curl -v http://localhost:3000/health
```

### Test Configuration
```bash
curl -X POST http://localhost:3000/configure \
  -H "Content-Type: application/json" \
  -d @test-config.json
```

`test-config.json`:
```json
{
  "store": "test-store.myshopify.com",
  "token": "shpat_test123",
  "lead_time_days": 7,
  "safety_stock": 10,
  "min_order_qty": 5
}
```

### Test Inventory Check
```bash
curl -X POST http://localhost:3000/run-check -v
```

### Monitor Logs
```bash
curl http://localhost:3000/logs | jq '.[0]' | xargs -I {} curl http://localhost:3000/logs/{}
```

---

## Webhooks (Future)

Currently manual trigger only. To add Shopify webhooks:

```javascript
// Listen for order.created
app.post('/webhooks/order-created', (req, res) => {
  // Verify signature
  // Re-run inventory check
  // Return 200 OK
  res.json({ success: true });
});
```

Shopify would POST to: `https://your-app.com/webhooks/order-created`

This enables **real-time** replenishment (vs hourly cron).

---

## Rate Limits (Self-Hosted)

No API rate limits in the code. Set manually if needed:

```javascript
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10 // 10 requests per minute
});
app.use('/run-check', limiter);
```

---

## Headers

### Request
```
Content-Type: application/json
(no authentication required currently)
```

### Response
```
Content-Type: application/json
X-Response-Time: 234ms (optional, can add)
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Bad request (missing params) |
| `403` | Forbidden (auth failed, if enabled) |
| `500` | Server error (logs have details) |

---

## Example Integration

### Node.js
```javascript
const axios = require('axios');

async function runInventoryCheck() {
  try {
    const res = await axios.post('http://localhost:3000/run-check');
    console.log(`Checked ${res.data.products_checked} products`);
    console.log(`Triggered ${res.data.replenishments_triggered} replenishments`);
  } catch (err) {
    console.error('Inventory check failed:', err.message);
  }
}

runInventoryCheck();
```

### Python
```python
import requests

response = requests.post('http://localhost:3000/run-check')
data = response.json()

print(f"Products: {data['products_checked']}")
print(f"Orders: {data['replenishments_triggered']}")
print(f"Draft Order: #{data['draft_order_id']}")
```

### Bash
```bash
curl -X POST http://localhost:3000/run-check | jq '.replenishments_triggered'
```

---

## Monitoring

### Uptime Monitor (Pingdom / UptimeRobot)

Set up ping to `/health`:
```
https://your-app.com/health
Expected response: 200 OK with "connected" status
Frequency: Every 5 minutes
Alert if: Status becomes "disconnected"
```

### Slack Integration (Future)

Post results to Slack after each run:
```javascript
app.post('/run-check', async (req, res) => {
  const results = await inventoryAI.run();
  
  // Send to Slack webhook
  await axios.post(process.env.SLACK_WEBHOOK, {
    text: `📦 Inventory check: ${results.replenishments_triggered} items need reorder`
  });
  
  res.json(results);
});
```

---

## Troubleshooting API

### "Cannot GET /health"
- Server is not running
- Wrong port (check `.env` PORT)
- Wrong URL

### "Configured successfully" but next check fails
- Token is invalid
- Store URL is wrong
- Shopify API is down

### Logs not showing
- Check log directory exists: `./logs/`
- Check file permissions
- Run `npm start` to create logs

---

## Contributing

Find a bug? Have an idea?

```bash
# Fork repo
# Make changes
# Test with: npm test (when added)
# Submit PR
```

---

## Version

`1.0.0` - Initial release

Last updated: January 2024

---

**Need help?** Check SETUP.md or open an issue on GitHub.
