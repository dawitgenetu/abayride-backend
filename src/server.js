require("dotenv").config();
const app = require("./app");
const { scheduleMidnightCleanup, cleanupStaleRides, scheduleExpiryCheck } = require("./services/cleanupService");

const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Backend running on http://0.0.0.0:${port} (LAN: http://192.168.43.116:${port})`);

  // Expire accepted rides that have been idle for > 1 hour (runs every 5 min)
  scheduleExpiryCheck();

  // Hard-delete old stale rides at midnight
  cleanupStaleRides();
  scheduleMidnightCleanup();
});

// Keep localtunnel alive — ping self every 20s to prevent idle timeout
setInterval(() => {
  const http = require("http");
  http.get(`http://localhost:${port}/health`, () => {}).on("error", () => {});
}, 20000);
