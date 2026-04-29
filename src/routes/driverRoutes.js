const express = require("express");
const { updateDriverStatus, registerDriverProfile, getDriverEarnings } = require("../controllers/driverController");
const { authenticateUser, authorizeRole } = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/drivers/register", authenticateUser, authorizeRole("driver"), registerDriverProfile);
router.patch("/drivers/status", authenticateUser, authorizeRole("driver"), updateDriverStatus);
router.get("/drivers/earnings", authenticateUser, authorizeRole("driver"), getDriverEarnings);

module.exports = router;
