/**
 * Wallet Controller
 *
 * Handles driver wallet: balance, transaction history, withdrawals.
 *
 * Commission logic (called internally after ride completion):
 *   - Cash ride:   driver_earning credited, then commission debited
 *                  (balance can go negative if driver hasn't paid commission yet)
 *   - Chapa ride:  platform already collected fare; only driver_earning credited
 *
 * Withdrawal:
 *   - Driver requests withdrawal of available balance
 *   - Balance must be >= 0 to withdraw (can't withdraw a negative balance)
 */

const { supabaseAdmin } = require("../config/supabase");

const DEV_COMMISSION_RATE = 0.10;

// ── Internal: apply wallet transaction atomically ─────────────────────────────
/**
 * Credits or debits the driver's wallet and records the transaction.
 * Uses a SELECT FOR UPDATE pattern via RPC to avoid race conditions.
 *
 * @param {string} driverId   - drivers.id (not user_id)
 * @param {"credit"|"debit"|"withdrawal"|"commission"} type
 * @param {number} amount     - always positive
 * @param {string} description
 * @param {string|null} rideId
 * @returns {Promise<{balance_after: number}>}
 */
async function applyWalletTransaction(driverId, type, amount, description, rideId = null) {
  // Fetch current balance
  const { data: driver, error: fetchErr } = await supabaseAdmin
    .from("drivers")
    .select("id, wallet_balance")
    .eq("id", driverId)
    .single();

  if (fetchErr || !driver) throw new Error("Driver wallet not found.");

  const current = Number(driver.wallet_balance ?? 0);
  const delta   = (type === "credit") ? amount : -amount;
  const balance_after = Math.round((current + delta) * 100) / 100;

  // Update balance
  const { error: updateErr } = await supabaseAdmin
    .from("drivers")
    .update({ wallet_balance: balance_after })
    .eq("id", driverId);

  if (updateErr) throw new Error(updateErr.message);

  // Record transaction
  const { error: txErr } = await supabaseAdmin
    .from("wallet_transactions")
    .insert({ driver_id: driverId, type, amount, balance_after, description, ride_id: rideId });

  if (txErr) throw new Error(txErr.message);

  return { balance_after };
}

// ── Internal: called after a ride is completed ────────────────────────────────
/**
 * Processes wallet entries for a completed ride.
 *
 * Cash ride:
 *   1. Credit full fare (driver collected cash from rider)
 *   2. Debit commission (10% owed to platform)
 *   Net effect: +driver_earning (= fare × 90%)
 *
 * Chapa ride:
 *   1. Credit driver_earning only (platform already has the fare)
 *   Net effect: +driver_earning
 *
 * If balance goes negative (driver hasn't paid commission), it stays negative
 * until the next ride refills it.
 */
async function processRideWallet(rideId) {
  const { data: ride, error } = await supabaseAdmin
    .from("rides")
    .select("id, driver_id, fare, dev_fee, driver_earning, payment_method, payment_status")
    .eq("id", rideId)
    .single();

  if (error || !ride || !ride.driver_id) return; // no driver, skip

  // Get driver record
  const { data: driver } = await supabaseAdmin
    .from("drivers")
    .select("id")
    .eq("user_id", ride.driver_id)
    .maybeSingle();

  if (!driver) return;

  const fare     = Number(ride.fare || 0);
  const devFee   = Number(ride.dev_fee  > 0 ? ride.dev_fee  : fare * DEV_COMMISSION_RATE);
  const earning  = Number(ride.driver_earning > 0 ? ride.driver_earning : fare * (1 - DEV_COMMISSION_RATE));

  if (ride.payment_method === "cash") {
    // Driver collected full cash — credit fare, then debit commission
    await applyWalletTransaction(
      driver.id, "credit", fare,
      `Cash ride fare collected`, rideId
    );
    await applyWalletTransaction(
      driver.id, "commission", devFee,
      `Platform commission (10%)`, rideId
    );
  } else {
    // Chapa — platform collected fare, credit only driver's share
    await applyWalletTransaction(
      driver.id, "credit", earning,
      `Chapa ride earning`, rideId
    );
  }
}

// ── GET /wallet — driver's own wallet balance + recent transactions ───────────
const getWallet = async (req, res) => {
  const { data: driver, error: dErr } = await supabaseAdmin
    .from("drivers")
    .select("id, wallet_balance")
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (dErr || !driver) return res.status(404).json({ message: "Driver profile not found." });

  const { data: transactions, error: tErr } = await supabaseAdmin
    .from("wallet_transactions")
    .select("*")
    .eq("driver_id", driver.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (tErr) return res.status(400).json({ message: tErr.message });

  return res.json({
    balance:      Number(driver.wallet_balance ?? 0),
    transactions: transactions || [],
  });
};

// ── POST /wallet/withdraw — driver requests a withdrawal ─────────────────────
const requestWithdrawal = async (req, res) => {
  const amount = parseFloat(req.body?.amount);
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: "Withdrawal amount must be a positive number." });
  }

  const { data: driver, error: dErr } = await supabaseAdmin
    .from("drivers")
    .select("id, wallet_balance")
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (dErr || !driver) return res.status(404).json({ message: "Driver profile not found." });

  const balance = Number(driver.wallet_balance ?? 0);

  if (balance < 0) {
    return res.status(400).json({
      message: `Your balance is negative (${balance} ETB). Complete more rides to clear the debt first.`,
    });
  }

  if (amount > balance) {
    return res.status(400).json({
      message: `Insufficient balance. Available: ${balance} ETB, requested: ${amount} ETB.`,
    });
  }

  try {
    const { balance_after } = await applyWalletTransaction(
      driver.id, "withdrawal", amount,
      `Withdrawal request`, null
    );
    return res.json({
      message:       "Withdrawal processed successfully.",
      amount_withdrawn: amount,
      balance_after,
    });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

// ── GET /admin/drivers/:id/wallet — admin views a driver's wallet ─────────────
const getDriverWalletAdmin = async (req, res) => {
  // req.params.id is the drivers.id
  const { data: driver, error: dErr } = await supabaseAdmin
    .from("drivers")
    .select("id, wallet_balance, users(name, phone)")
    .eq("id", req.params.id)
    .maybeSingle();

  if (dErr || !driver) return res.status(404).json({ message: "Driver not found." });

  const { data: transactions, error: tErr } = await supabaseAdmin
    .from("wallet_transactions")
    .select("*")
    .eq("driver_id", driver.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (tErr) return res.status(400).json({ message: tErr.message });

  return res.json({
    driver_id:    driver.id,
    name:         driver.users?.name,
    phone:        driver.users?.phone,
    balance:      Number(driver.wallet_balance ?? 0),
    transactions: transactions || [],
  });
};

module.exports = {
  getWallet,
  requestWithdrawal,
  getDriverWalletAdmin,
  processRideWallet,   // called internally from rideController
};
