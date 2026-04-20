const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_SCOPES,
  SHOPIFY_REDIRECT_URI
} = process.env;

// health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// home
app.get("/", (req, res) => {
  res.send("Shopify SaaS running");
});

// 1. START AUTH (главная кнопка подключения)
app.get("/auth", (req, res) => {
  const shop = req.query.shop;

  if (!shop) return res.send("Missing shop param");

  const url =
    `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${SHOPIFY_SCOPES}` +
    `&redirect_uri=${SHOPIFY_REDIRECT_URI}`;

  res.redirect(url);
});

// 2. CALLBACK (Shopify возвращает сюда)
app.get("/callback", async (req, res) => {
  const { shop, code } = req.query;

  try {
    const response = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code
      }
    );

    const token = response.data.access_token;

    console.log("CONNECTED SHOP:", shop);
    console.log("TOKEN:", token);

    res.send("Shop connected successfully");
  } catch (e) {
    console.log(e.response?.data || e.message);
    res.send("OAuth failed");
  }
});

// server start
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Running on", port);
});