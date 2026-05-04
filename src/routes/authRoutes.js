const express = require("express");
const { login, getMe } = require("../controllers/authController");
const { authenticateUser } = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/auth/login", login);
// /auth/me is used by the mobile app for all roles — no role restriction
router.get("/auth/me", authenticateUser, getMe);

module.exports = router;
