const express = require("express");
const { createRating, getDriverRatings } = require("../controllers/ratingController");
const { authenticateUser, authorizeRole } = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/ratings", authenticateUser, authorizeRole("rider"), createRating);
router.get("/ratings/driver/:driverId", authenticateUser, getDriverRatings);

module.exports = router;
