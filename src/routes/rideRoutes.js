const express = require("express");
const {
  requestRide,
  getMyRides,
  getAvailableRides,
  acceptRide,
  updateRideStatus,
  getActiveRide,
} = require("../controllers/rideController");
const { authenticateUser, authorizeRole } = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/rides", authenticateUser, authorizeRole("rider"), requestRide);
router.get("/rides/active", authenticateUser, authorizeRole("rider"), getActiveRide);
router.get("/rides/my", authenticateUser, getMyRides);
router.get("/rides/available", authenticateUser, authorizeRole("driver"), getAvailableRides);
router.post("/rides/:id/accept", authenticateUser, authorizeRole("driver"), acceptRide);
router.patch("/rides/:id/status", authenticateUser, authorizeRole("driver", "rider", "admin"), updateRideStatus);

module.exports = router;
