const express = require("express");
const {
  getUsers,
  updateUserProfile,
  setUserBlocked,
  getDrivers,
  approveDriver,
  rejectDriver,
  getRides,
  getRidesMap,
  assignRide,
  getPayments,
  exportPaymentsCsv,
  exportPaymentsPdf,
  getAnalytics,
  getAnalyticsCharts,
  getNotificationsSummary,
} = require("../controllers/adminController");
const { getFareSettings, updateFareSettings } = require("../controllers/fareController");
const { getDriverWalletAdmin } = require("../controllers/walletController");
const { authenticateUser, authorizeRole } = require("../middlewares/authMiddleware");
const { cleanupStaleRides, expireStaleRides } = require("../services/cleanupService");

const router = express.Router();

router.use(authenticateUser, authorizeRole("admin"));

router.get("/admin/users", getUsers);
router.patch("/admin/users/:id", updateUserProfile);
router.patch("/admin/users/:id/block", setUserBlocked);
router.get("/admin/drivers", getDrivers);
router.patch("/admin/drivers/:id/approve", approveDriver);
router.patch("/admin/drivers/:id/reject", rejectDriver);

router.get("/admin/rides", getRides);
router.get("/admin/rides/map", getRidesMap);
router.patch("/admin/rides/:id/assign", assignRide);

router.get("/admin/payments", getPayments);
router.get("/admin/payments/export/csv", exportPaymentsCsv);
router.get("/admin/payments/export/pdf", exportPaymentsPdf);

router.get("/admin/analytics", getAnalytics);
router.get("/admin/analytics/charts", getAnalyticsCharts);
router.get("/admin/notifications/summary", getNotificationsSummary);

// Fare settings
router.get("/admin/fare-settings", getFareSettings);
router.put("/admin/fare-settings", updateFareSettings);

// Driver wallet (admin view)
router.get("/admin/drivers/:id/wallet", getDriverWalletAdmin);

// Manual cleanup trigger — admin only
router.post("/admin/cleanup/stale-rides", async (_req, res) => {
  const result = await cleanupStaleRides();
  if (result.error) return res.status(500).json({ message: result.error });
  return res.json({ message: `Deleted ${result.deleted} stale ride(s).`, deleted: result.deleted });
});

// Manual expiry trigger — admin only
router.post("/admin/cleanup/expire-rides", async (_req, res) => {
  const result = await expireStaleRides();
  if (result.error) return res.status(500).json({ message: result.error });
  return res.json({ message: `Expired ${result.expired} ride(s).`, expired: result.expired });
});

module.exports = router;
