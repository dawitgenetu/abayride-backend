/**
 * Cleanup Service — removes stale ride requests from previous days.
 *
 * Safety rules:
 *  - ONLY deletes rides where status IN ('requested', 'cancelled')
 *  - NEVER touches: accepted, arrived, picked_up, ongoing, completed
 *  - Uses server UTC date — not client time
 *  - Runs automatically at midnight; can also be triggered manually via admin API
 */

const { supabaseAdmin } = require("../config/supabase");

// Statuses safe to delete — no active driver session, no revenue impact
const STALE_STATUSES = ["requested", "cancelled"];

/**
 * Delete ride requests from before today that are no longer active.
 * Returns { deleted, error }.
 */
async function cleanupStaleRides() {
  // Midnight of today in UTC — anything before this is "yesterday or older"
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabaseAdmin
    .from("rides")
    .delete()
    .lt("created_at", todayUTC.toISOString())   // created before today
    .in("status", STALE_STATUSES)               // only safe statuses
    .select("id");                               // return deleted IDs for logging

  if (error) {
    console.error("[Cleanup] Failed to delete stale rides:", error.message);
    return { deleted: 0, error: error.message };
  }

  const deleted = data?.length ?? 0;
  if (deleted > 0) {
    console.log(`[Cleanup] Removed ${deleted} stale ride(s) from previous days.`);
  } else {
    console.log("[Cleanup] No stale rides to remove.");
  }

  return { deleted, error: null };
}

/**
 * Schedule cleanup to run once every day at midnight (server local time).
 * Call this once from server.js on startup.
 */
function scheduleMidnightCleanup() {
  const runAndReschedule = async () => {
    await cleanupStaleRides();
    // Schedule next run exactly at next midnight
    const now       = new Date();
    const tomorrow  = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow - now;
    console.log(`[Cleanup] Next cleanup scheduled in ${Math.round(msUntilMidnight / 60000)} minutes.`);
    setTimeout(runAndReschedule, msUntilMidnight);
  };

  // First run: at next midnight
  const now      = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const msUntilMidnight = midnight - now;

  console.log(`[Cleanup] Midnight cleanup scheduled (in ${Math.round(msUntilMidnight / 60000)} min).`);
  setTimeout(runAndReschedule, msUntilMidnight);
}

module.exports = { cleanupStaleRides, scheduleMidnightCleanup };
