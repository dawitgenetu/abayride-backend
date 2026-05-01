const express = require("express");
const {
  requestRide,
  getMyRides,
  getAvailableRides,
  acceptRide,
  updateRideStatus,
  getActiveRide,
  deleteRide,
} = require("../controllers/rideController");
const { getFareSettings } = require("../controllers/fareController");
const { authenticateUser, authorizeRole } = require("../middlewares/authMiddleware");

const router = express.Router();

// Public (authenticated) — riders & drivers fetch live fare settings before booking
router.get("/fare-settings", authenticateUser, getFareSettings);

router.post("/rides", authenticateUser, authorizeRole("rider"), requestRide);
router.get("/rides/active", authenticateUser, authorizeRole("rider"), getActiveRide);
router.get("/rides/my", authenticateUser, getMyRides);
router.get("/rides/available", authenticateUser, authorizeRole("driver"), getAvailableRides);
router.post("/rides/:id/accept", authenticateUser, authorizeRole("driver"), acceptRide);
router.patch("/rides/:id/status", authenticateUser, authorizeRole("driver", "rider", "admin"), updateRideStatus);
router.delete("/rides/:id", authenticateUser, authorizeRole("rider"), deleteRide);

module.exports = router;
