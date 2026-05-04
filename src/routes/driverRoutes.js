const express = require("express");
const { updateDriverStatus, registerDriverProfile, getDriverEarnings, getDriverMe } = require("../controllers/driverController");
const { getWallet, requestWithdrawal } = require("../controllers/walletController");
const { authenticateUser, authorizeRole } = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/drivers/register", authenticateUser, authorizeRole("driver"), registerDriverProfile);
router.patch("/drivers/status",  authenticateUser, authorizeRole("driver"), updateDriverStatus);
router.get("/drivers/earnings",  authenticateUser, authorizeRole("driver"), getDriverEarnings);
router.get("/drivers/me",        authenticateUser, authorizeRole("driver"), getDriverMe);

// Wallet
router.get("/wallet",           authenticateUser, authorizeRole("driver"), getWallet);
router.post("/wallet/withdraw",  authenticateUser, authorizeRole("driver"), requestWithdrawal);

module.exports = router;
