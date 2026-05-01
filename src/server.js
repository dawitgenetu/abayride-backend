require("dotenv").config();
const app = require("./app");
const { scheduleMidnightCleanup, cleanupStaleRides, scheduleExpiryCheck } = require("./services/cleanupService");

const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Backend running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

  // Expire accepted rides that have been idle for > 1 hour (runs every 5 min)
  scheduleExpiryCheck();

  // Hard-delete old stale rides at midnight
  cleanupStaleRides();
  scheduleMidnightCleanup();
});
