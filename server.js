const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 8080;

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";
const SHOP_NAME = process.env.SHOP_NAME || "Ma Boutique";

app.use(cors({
  origin: FRONTEND_URL === "*" ? true : FRONTEND_URL
}));

app.use(express.json());

/*
|--------------------------------------------------------------------------
| Catalogue
|--------------------------------------------------------------------------
| Les prix sont conservés côté serveur afin d'éviter qu'un client
| modifie le prix directement dans le navigateur.
*/

const PRODUCTS = {
  p1: {
    id: "p1",
    name: "Produit 1",
    price: 5000,
    currency: "XAF"
  },

  p2: {
    id: "p2",
    name: "Produit 2",
    price: 10000,
    currency: "XAF"
  },

  p3: {
    id: "p3",
    name: "Produit 3",
    price: 15000,
    currency: "XAF"
  }
};

/*
|--------------------------------------------------------------------------
| Fichier des commandes
|--------------------------------------------------------------------------
*/

const DATA_DIR = path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

function ensureOrdersFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, "[]", "utf8");
  }
}

function readOrders() {
  ensureOrdersFile();

  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
  } catch (error) {
    return [];
  }
}

function saveOrders(orders) {
  ensureOrdersFile();

  fs.writeFileSync(
    ORDERS_FILE,
    JSON.stringify(orders, null, 2),
    "utf8"
  );
}

/*
|--------------------------------------------------------------------------
| Vérification du panier
|--------------------------------------------------------------------------
*/

function calculateCart(cart) {
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new Error("Panier vide.");
  }

  let total = 0;
  const items = [];

  for (const item of cart) {
    const product = PRODUCTS[item.id];

    if (!product) {
      throw new Error(`Produit inconnu : ${item.id}`);
    }

    const quantity = Number(item.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new Error("Quantité invalide.");
    }

    const subtotal = product.price * quantity;

    total += subtotal;

    items.push({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity,
      subtotal
    });
  }

  return {
    items,
    total,
    currency: "XAF"
  };
}

/*
|--------------------------------------------------------------------------
| Route de test
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: `${SHOP_NAME} - serveur Flutterwave opérationnel`,
    status: "online"
  });
});

/*
|--------------------------------------------------------------------------
| Vérification santé serveur
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

/*
|--------------------------------------------------------------------------
| Création d'un paiement Flutterwave
|--------------------------------------------------------------------------
*/

app.post("/api/create-payment", async (req, res) => {
  try {
    if (!FLW_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "FLW_SECRET_KEY n'est pas configurée sur le serveur."
      });
    }

    const {
      cart,
      customer
    } = req.body;

    if (!customer || !customer.email || !customer.name) {
      return res.status(400).json({
        success: false,
        message: "Nom et adresse email du client obligatoires."
      });
    }

    const orderData = calculateCart(cart);

    const txRef =
      `SHOP-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 10)
        .toUpperCase()}`;

    const order = {
      id: txRef,
      status: "pending",
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone || ""
      },
      items: orderData.items,
      amount: orderData.total,
      currency: orderData.currency,
      created_at: new Date().toISOString()
    };

    const orders = readOrders();

    orders.push(order);

    saveOrders(orders);

    const frontendUrl =
      process.env.FRONTEND_URL || "http://localhost:3000";

    const redirectUrl =
      `${frontendUrl}/payment-result.html`;

    const response = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref: txRef,

        amount: orderData.total,

        currency: "XAF",

        redirect_url: redirectUrl,

        payment_options: "card,mobilemoneyxaf",

        customer: {
          email: customer.email,
          name: customer.name,
          phonenumber: customer.phone || ""
        },

        customizations: {
          title: SHOP_NAME,
          description: `Paiement de commande ${txRef}`
        },

        meta: {
          order_id: txRef
        }
      },
      {
        headers: {
          Authorization: `Bearer ${FLW_SECRET_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.json({
      success: true,
      order_id: txRef,
      payment_link: response.data.data.link
    });

  } catch (error) {
    console.error(
      "Erreur création paiement:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Impossible de créer le paiement Flutterwave."
    });
  }
});

/*
|--------------------------------------------------------------------------
| Vérification d'une transaction Flutterwave
|--------------------------------------------------------------------------
*/

app.get("/api/payment-callback", async (req, res) => {
  try {
    const transactionId = req.query.transaction_id;

    if (!transactionId) {
      return res.status(400).send("Transaction introuvable.");
    }

    if (!FLW_SECRET_KEY) {
      return res.status(500).send("Clé Flutterwave non configurée.");
    }

    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      {
        headers: {
          Authorization: `Bearer ${FLW_SECRET_KEY}`
        }
      }
    );

    const data = response.data.data;

    const txRef = data.tx_ref;
    const orders = readOrders();

    const orderIndex = orders.findIndex(
      order => order.id === txRef
    );

    if (orderIndex === -1) {
      return res.status(404).send("Commande introuvable.");
    }

    const order = orders[orderIndex];

    const paymentIsValid =
      data.status === "successful" &&
      Number(data.amount) === Number(order.amount) &&
      data.currency === order.currency &&
      data.tx_ref === order.id;

    if (paymentIsValid) {
      order.status = "paid";
      order.transaction_id = transactionId;
      order.paid_at = new Date().toISOString();

      orders[orderIndex] = order;

      saveOrders(orders);

      return res.redirect(
        `${process.env.FRONTEND_URL || "/"}/payment-result.html?status=success&order_id=${encodeURIComponent(order.id)}`
      );
    }

    order.status = "failed";
    order.transaction_id = transactionId;

    orders[orderIndex] = order;

    saveOrders(orders);

    return res.redirect(
      `${process.env.FRONTEND_URL || "/"}/payment-result.html?status=failed&order_id=${encodeURIComponent(order.id)}`
    );

  } catch (error) {
    console.error(
      "Erreur vérification paiement:",
      error.response?.data || error.message
    );

    return res.status(500).send(
      "Erreur lors de la vérification du paiement."
    );
  }
});

/*
|--------------------------------------------------------------------------
| Consultation d'une commande
|--------------------------------------------------------------------------
*/

app.get("/api/orders/:id", (req, res) => {
  const orders = readOrders();

  const order = orders.find(
    item => item.id === req.params.id
  );

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Commande introuvable."
    });
  }

  return res.json({
    success: true,
    order
  });
});

/*
|--------------------------------------------------------------------------
| Webhook Flutterwave
|--------------------------------------------------------------------------
*/

app.post("/api/flutterwave-webhook", (req, res) => {
  console.log("Webhook Flutterwave reçu.");

  /*
   * La validation cryptographique du webhook devra être activée
   * avant la mise en production définitive.
   */

  return res.status(200).json({
    received: true
  });
});

/*
|--------------------------------------------------------------------------
| Démarrage du serveur
|--------------------------------------------------------------------------
*/

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `${SHOP_NAME} - serveur démarré sur 0.0.0.0:${PORT}`
  );
});
