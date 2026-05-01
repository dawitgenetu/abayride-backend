const { supabaseAdmin } = require("../config/supabase");

// Default values used as fallback if the DB row is missing
const DEFAULTS = { price_per_km: 100, standby_fee: 100 };

/**
 * Fetch the single fare_settings row.
 * Returns the defaults if the row doesn't exist yet.
 */
const getFareSettings = async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("fare_settings")
    .select("price_per_km, standby_fee, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) return res.status(400).json({ message: error.message });
  return res.json(data ?? DEFAULTS);
};

/**
 * Upsert the fare_settings row (admin only).
 * Accepts: { price_per_km, standby_fee }
 */
const updateFareSettings = async (req, res) => {
  const price_per_km = parseFloat(req.body?.price_per_km);
  const standby_fee  = parseFloat(req.body?.standby_fee);

  if (isNaN(price_per_km) || price_per_km <= 0) {
    return res.status(400).json({ message: "price_per_km must be a positive number." });
  }
  if (isNaN(standby_fee) || standby_fee < 0) {
    return res.status(400).json({ message: "standby_fee must be zero or a positive number." });
  }

  const { data, error } = await supabaseAdmin
    .from("fare_settings")
    .upsert(
      { id: 1, price_per_km, standby_fee, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    )
    .select("price_per_km, standby_fee, updated_at")
    .single();

  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

/**
 * Internal helper — used by rideController to get live fare settings.
 * Returns plain object (not an HTTP response).
 */
const fetchFareSettingsInternal = async () => {
  const { data } = await supabaseAdmin
    .from("fare_settings")
    .select("price_per_km, standby_fee")
    .eq("id", 1)
    .maybeSingle();
  return {
    price_per_km: Number(data?.price_per_km ?? DEFAULTS.price_per_km),
    standby_fee:  Number(data?.standby_fee  ?? DEFAULTS.standby_fee),
  };
};

module.exports = { getFareSettings, updateFareSettings, fetchFareSettingsInternal };
