/**
 * Cleanup Service
 *
 * Two jobs run automatically:
 *
 * 1. expireStaleRides()  — every 5 minutes
 *    Marks rides as 'expired' when a driver accepted but no progress
 *    was made within RIDE_TIMEOUT_MS (default 1 hour).
 *    Affected statuses: 'accepted', 'arrived'
 *    (picked_up / ongoing are excluded — the trip is physically in progress)
 *
 * 2. cleanupStaleRides() — every midnight
 *    Hard-deletes old 'requested' and 'cancelled' rides from previous days.
 */

const { supabaseAdmin } = require("../config/supabase");

// ── Constants ─────────────────────────────────────────────────────────────────
const RIDE_TIMEOUT_MS   = 60 * 60 * 1000;   // 1 hour in milliseconds
const EXPIRY_INTERVAL   = 5  * 60 * 1000;   // check every 5 minutes

// Statuses where a driver has accepted but the ride hasn't truly started yet.
// 'picked_up' and 'ongoing' are excluded — the rider is physically in the car.
const EXPIRABLE_STATUSES = ["accepted", "arrived"];

// Statuses safe to hard-delete (no active driver session, no revenue impact)
const STALE_STATUSES = ["requested", "cancelled"];

// ── 1. Expire stale accepted rides ───────────────────────────────────────────
/**
 * Find rides in 'accepted' or 'arrived' state whose accepted_at is older
 * than RIDE_TIMEOUT_MS and mark them as 'expired'.
 *
 * Returns { expired, error }.
 */
async function expireStaleRides() {
  const cutoff = new Date(Date.now() - RIDE_TIMEOUT_MS).toISOString();

  // Find candidates
  const { data: candidates, error: fetchErr } = await supabaseAdmin
    .from("rides")
    .select("id, status, accepted_at, rider_id, driver_id")
    .in("status", EXPIRABLE_STATUSES)
    .lt("accepted_at", cutoff);   // accepted more than 1 hour ago

  if (fetchErr) {
    console.error("[Expiry] Failed to fetch candidates:", fetchErr.message);
    return { expired: 0, error: fetchErr.message };
  }

  if (!candidates || candidates.length === 0) {
    return { expired: 0, error: null };
  }

  const ids = candidates.map(r => r.id);

  // Bulk-update to 'expired'
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("rides")
    .update({
      status:     "expired",
      updated_at: new Date().toISOString(),
    })
    .in("id", ids)
    .select("id");

  if (updateErr) {
    console.error("[Expiry] Failed to expire rides:", updateErr.message);
    return { expired: 0, error: updateErr.message };
  }

  const count = updated?.length ?? 0;
  if (count > 0) {
    console.log(`[Expiry] Marked ${count} ride(s) as expired:`, ids);
  }

  return { expired: count, error: null };
}

/**
 * Start the expiry loop — runs expireStaleRides() every EXPIRY_INTERVAL ms.
 * Call once from server.js on startup.
 */
function scheduleExpiryCheck() {
  // Run immediately on startup to catch anything that expired while server was down
  expireStaleRides();
  const id = setInterval(expireStaleRides, EXPIRY_INTERVAL);
  console.log(`[Expiry] Ride expiry check scheduled every ${EXPIRY_INTERVAL / 60000} minutes.`);
  return id; // return so tests can clearInterval
}

// ── 2. Midnight hard-delete of old stale rides ────────────────────────────────
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
    .lt("created_at", todayUTC.toISOString())
    .in("status", STALE_STATUSES)
    .select("id");

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
 * Call once from server.js on startup.
 */
function scheduleMidnightCleanup() {
  const runAndReschedule = async () => {
    await cleanupStaleRides();
    const now      = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const ms = tomorrow - now;
    console.log(`[Cleanup] Next midnight cleanup in ${Math.round(ms / 60000)} minutes.`);
    setTimeout(runAndReschedule, ms);
  };

  const now      = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const ms = midnight - now;

  console.log(`[Cleanup] Midnight cleanup scheduled (in ${Math.round(ms / 60000)} min).`);
  setTimeout(runAndReschedule, ms);
}

module.exports = {
  expireStaleRides,
  scheduleExpiryCheck,
  cleanupStaleRides,
  scheduleMidnightCleanup,
  RIDE_TIMEOUT_MS,
};
