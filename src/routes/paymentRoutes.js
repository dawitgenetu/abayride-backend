const express = require("express");
const {
  initializeChapa, verifyChapa, chapaWebhook,
  payCash, confirmCash, getPaymentHistory,
} = require("../controllers/paymentController");
const { authenticateUser, authorizeRole } = require("../middlewares/authMiddleware");

const router = express.Router();

// Chapa
router.post("/payments/chapa/init",           authenticateUser, authorizeRole("rider", "driver"), initializeChapa);
router.get("/payments/chapa/verify/:tx_ref",  authenticateUser, verifyChapa);
router.post("/payments/chapa/webhook",        chapaWebhook);

// Cash
router.post("/payments/cash",                 authenticateUser, authorizeRole("rider", "driver"), payCash);
router.post("/payments/cash/confirm",         authenticateUser, authorizeRole("driver"), confirmCash);

// History
router.get("/payments/history",               authenticateUser, getPaymentHistory);

module.exports = router;
