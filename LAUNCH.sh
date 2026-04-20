#!/bin/bash
# SHOPIFY INVENTORY AI - LAUNCH CHECKLIST
# Complete this in order. You'll be live in ~1 hour.

echo "🚀 Shopify Inventory AI Launch Checklist"
echo "========================================"
echo ""

# COLOR CODES
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# STEP 1: Shopify Setup
echo -e "${YELLOW}[ ] STEP 1: Shopify Configuration${NC}"
echo "Time: 10 minutes"
echo ""
echo "Do this in Shopify Admin:"
echo "  1. Go to Settings → Apps and integrations"
echo "  2. Click 'Develop apps' at top right"
echo "  3. Create a new app (name: 'Inventory AI')"
echo "  4. Go to Configuration tab"
echo "  5. Enable these Admin API scopes:"
echo "     ✓ read_products"
echo "     ✓ read_orders"  
echo "     ✓ write_draft_orders"
echo "  6. Click 'Save'"
echo "  7. Go to 'API credentials' tab"
echo "  8. COPY the 'Admin API access token'"
echo ""
read -p "Press enter when done, then paste token below:" token
export SHOPIFY_TOKEN=$token
echo -e "${GREEN}✓ Token saved${NC}"
echo ""

# STEP 2: Local Setup
echo -e "${YELLOW}[ ] STEP 2: Local Installation${NC}"
echo "Time: 5 minutes"
echo ""
echo "Run these commands:"
echo "  $ npm install"
echo "  $ cp .env.example .env"
echo ""
read -p "Did you run npm install? (y/n): " npm_done
if [ "$npm_done" != "y" ]; then
  echo -e "${RED}❌ Run npm install first!${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# STEP 3: Configuration
echo -e "${YELLOW}[ ] STEP 3: Configure .env${NC}"
echo "Time: 2 minutes"
echo ""
echo "Edit .env and fill in these values:"
echo ""
echo "  SHOPIFY_STORE=your-store.myshopify.com"
echo "  SHOPIFY_ACCESS_TOKEN=$SHOPIFY_TOKEN"
echo "  LEAD_TIME_DAYS=7"
echo "  SAFETY_STOCK=10"
echo "  MIN_ORDER_QTY=5"
echo "  PORT=3000"
echo ""
read -p "Edit .env now? (y/n): " edit_env
if [ "$edit_env" = "y" ]; then
  nano .env  # or use your preferred editor
fi
echo -e "${GREEN}✓ Configuration saved${NC}"
echo ""

# STEP 4: Test Locally
echo -e "${YELLOW}[ ] STEP 4: Test Locally${NC}"
echo "Time: 5 minutes"
echo ""
echo "Run: npm start"
echo ""
read -p "Start the server now? (y/n): " start_local
if [ "$start_local" = "y" ]; then
  npm start &
  sleep 3
  echo ""
  echo "✓ Server running on http://localhost:3000"
  echo ""
  echo "Open in browser:"
  echo "  Dashboard: http://localhost:3000/dashboard.html"
  echo ""
  read -p "Did the dashboard load? (y/n): " dashboard_ok
  if [ "$dashboard_ok" != "y" ]; then
    echo -e "${RED}❌ Dashboard failed to load. Check logs!${NC}"
    exit 1
  fi
fi
echo -e "${GREEN}✓ Local test successful${NC}"
echo ""

# STEP 5: Deploy
echo -e "${YELLOW}[ ] STEP 5: Deploy to Production${NC}"
echo "Time: 15 minutes"
echo ""
echo "Choose one:"
echo ""
echo "OPTION A: Heroku (easiest)"
echo "  1. Create account at heroku.com"
echo "  2. Install: brew install heroku"
echo "  3. Run:"
echo "     $ heroku login"
echo "     $ heroku create my-inventory-app"
echo "     $ heroku config:set SHOPIFY_STORE=... SHOPIFY_ACCESS_TOKEN=..."
echo "     $ git push heroku main"
echo ""
echo "OPTION B: DigitalOcean App Platform"
echo "  1. Create account at digitalocean.com"
echo "  2. App Platform → Create App → Connect GitHub"
echo "  3. Set env vars from .env"
echo "  4. Deploy"
echo ""
echo "OPTION C: Localhost (testing only)"
echo "  Keep running npm start"
echo ""
read -p "Which option? (a/b/c): " deploy_option

if [ "$deploy_option" = "a" ]; then
  echo "Deploying to Heroku..."
  heroku login
  heroku create my-inventory-app
  echo "Set these config vars in Heroku:"
  read -p "  Paste: heroku config:set SHOPIFY_STORE=..." 
  read -p "  Paste: heroku config:set SHOPIFY_ACCESS_TOKEN=..."
  git push heroku main
  echo -e "${GREEN}✓ Deployed to Heroku!${NC}"
  heroku open
elif [ "$deploy_option" = "b" ]; then
  echo "Visit digitalocean.com/app-platform to deploy"
  echo "Tutorial: https://docs.digitalocean.com/products/app-platform/"
  echo -e "${GREEN}✓ Ready to deploy${NC}"
else
  echo -e "${GREEN}✓ Running locally${NC}"
fi
echo ""

# STEP 6: Verify
echo -e "${YELLOW}[ ] STEP 6: Verify Production${NC}"
echo "Time: 5 minutes"
echo ""
echo "Open your app URL and:"
echo "  1. Check /health endpoint"
echo "  2. Go to dashboard"
echo "  3. Click 'Run Check Now'"
echo "  4. Should see products checked count"
echo ""
read -p "Is it working? (y/n): " verify_ok
if [ "$verify_ok" != "y" ]; then
  echo -e "${RED}❌ Check logs and troubleshooting in SETUP.md${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Production verified!${NC}"
echo ""

# STEP 7: Monitor
echo -e "${YELLOW}[ ] STEP 7: Set Up Monitoring${NC}"
echo "Time: 5 minutes"
echo ""
echo "For the next 7 days:"
echo "  ✓ Check dashboard daily"
echo "  ✓ Watch for replenishment triggers"
echo "  ✓ Monitor draft orders"
echo "  ✓ Adjust SAFETY_STOCK if needed"
echo ""
echo "If stockouts happen: INCREASE SAFETY_STOCK"
echo "If over-ordering: INCREASE LEAD_TIME_DAYS"
echo ""
echo -e "${GREEN}✓ Monitoring enabled${NC}"
echo ""

# DONE
echo "========================================"
echo -e "${GREEN}🎉 YOU'RE LIVE!${NC}"
echo "========================================"
echo ""
echo "Summary:"
echo "  ✓ Shopify connected"
echo "  ✓ Server running"
echo "  ✓ Cron scheduled (every hour)"
echo "  ✓ Dashboard accessible"
echo "  ✓ Logs being collected"
echo ""
echo "Next steps:"
echo "  1. Monitor for 1 week"
echo "  2. Collect feedback from team"
echo "  3. Adjust parameters as needed"
echo "  4. Launch to customers (if reselling)"
echo ""
echo "Support:"
echo "  📖 SETUP.md - Full documentation"
echo "  📖 README.md - Feature overview"
echo "  📧 Contact: your-email@example.com"
echo ""
