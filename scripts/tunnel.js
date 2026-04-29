/**
 * Auto-restarting localtunnel wrapper.
 * Run: node scripts/tunnel.js
 */
const { spawn } = require("child_process");

const SUBDOMAIN = "abayride-backend";
const PORT = 5000;

function start() {
  console.log(`[tunnel] Starting lt --port ${PORT} --subdomain ${SUBDOMAIN}`);
  const proc = spawn("lt", ["--port", String(PORT), "--subdomain", SUBDOMAIN], {
    stdio: "inherit",
    shell: true,
  });

  proc.on("exit", (code) => {
    console.log(`[tunnel] Exited (code ${code}). Restarting in 3s…`);
    setTimeout(start, 3000);
  });

  proc.on("error", (err) => {
    console.error("[tunnel] Error:", err.message, "— restarting in 3s…");
    setTimeout(start, 3000);
  });
}

start();
