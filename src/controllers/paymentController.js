const { v4: uuidv4 } = require("uuid");
const { z } = require("zod");
const { supabaseAdmin } = require("../config/supabase");
const { initializeChapaPayment, verifyChapaPayment } = require("../services/chapaService");

const initSchema = z.object({
  ride_id: z.string().uuid(),
  amount: z.number().positive(),
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
});

// POST /payments/chapa/init — rider initiates Chapa payment
const initializeChapa = async (req, res) => {
  const parsed = initSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

  // Verify ride belongs to this rider
  const { data: ride } = await supabaseAdmin
    .from("rides").select("id, rider_id, driver_id, fare, payment_status").eq("id", parsed.data.ride_id).single();
  if (!ride) return res.status(404).json({ message: "Ride not found." });
  // Allow both rider and driver to initiate payment
  if (ride.rider_id !== req.user.id && ride.driver_id !== req.user.id) {
    return res.status(403).json({ message: "Not your ride." });
  }
  if (ride.payment_status === "paid") return res.status(400).json({ message: "Ride already paid." });

  const tx_ref = `abay_${uuidv4()}`;
  const result = await initializeChapaPayment({ ...parsed.data, tx_ref });
  if (result.status !== "success") return res.status(400).json({ message: result.message || "Chapa init failed" });

  // Record pending payment
  await supabaseAdmin.from("payments").insert({
    ride_id: parsed.data.ride_id,
    amount: parsed.data.amount,
    method: "chapa",
    status: "pending",
    tx_ref,
  });

  return res.json({ tx_ref, checkout_url: result.data.checkout_url });
};

// GET /payments/chapa/verify/:tx_ref — poll after returning from Chapa
const verifyChapa = async (req, res) => {
  const { tx_ref } = req.params;
  const result = await verifyChapaPayment(tx_ref);
  const chapaStatus = result?.data?.status;
  const paymentStatus = chapaStatus === "success" ? "completed" : "failed";

  const { data: payment, error } = await supabaseAdmin
    .from("payments").update({ status: paymentStatus }).eq("tx_ref", tx_ref).select("*").single();
  if (error) return res.status(400).json({ message: error.message });

  if (paymentStatus === "completed") {
    await supabaseAdmin.from("rides").update({ payment_status: "paid" }).eq("id", payment.ride_id);
  }

  return res.json({ tx_ref, payment_status: paymentStatus, chapa: result.data });
};

// POST /payments/chapa/webhook — Chapa server-to-server callback
const chapaWebhook = async (req, res) => {
  // Verify webhook secret
  const secret = req.headers["x-chapa-signature"] || req.headers["chapa-webhook-secret"];
  if (process.env.CHAPA_WEBHOOK_SECRET && secret !== process.env.CHAPA_WEBHOOK_SECRET) {
    return res.status(401).json({ message: "Invalid webhook signature." });
  }

  const { tx_ref, status } = req.body;
  if (!tx_ref) return res.status(400).json({ message: "tx_ref required." });

  // Verify with Chapa directly (never trust webhook body alone)
  const result = await verifyChapaPayment(tx_ref);
  const verified = result?.data?.status === "success";
  const paymentStatus = verified ? "completed" : "failed";

  const { data: payment } = await supabaseAdmin
    .from("payments").update({ status: paymentStatus }).eq("tx_ref", tx_ref).select("ride_id").single();

  if (verified && payment?.ride_id) {
    await supabaseAdmin.from("rides").update({ payment_status: "paid" }).eq("id", payment.ride_id);
  }

  return res.json({ received: true, payment_status: paymentStatus });
};

// POST /payments/cash — rider confirms cash payment
const payCash = async (req, res) => {
  const { ride_id, amount } = req.body;
  if (!ride_id || !amount) return res.status(400).json({ message: "ride_id and amount required." });

  const { data: ride } = await supabaseAdmin
    .from("rides").select("id, rider_id, driver_id, payment_status").eq("id", ride_id).single();
  if (!ride) return res.status(404).json({ message: "Ride not found." });
  if (ride.rider_id !== req.user.id && ride.driver_id !== req.user.id) {
    return res.status(403).json({ message: "Not your ride." });
  }
  if (ride.payment_status === "paid") return res.status(400).json({ message: "Already paid." });

  const { data, error } = await supabaseAdmin
    .from("payments")
    .insert({ ride_id, amount, method: "cash", status: "completed" })
    .select("*").single();
  if (error) return res.status(400).json({ message: error.message });

  await supabaseAdmin.from("rides").update({ payment_status: "paid" }).eq("id", ride_id);
  return res.status(201).json(data);
};

// POST /payments/cash/confirm — driver confirms cash received
const confirmCash = async (req, res) => {
  const { ride_id } = req.body;
  if (!ride_id) return res.status(400).json({ message: "ride_id required." });

  const { data: ride } = await supabaseAdmin
    .from("rides").select("id, driver_id, fare, payment_status").eq("id", ride_id).single();
  if (!ride) return res.status(404).json({ message: "Ride not found." });
  if (ride.driver_id !== req.user.id) return res.status(403).json({ message: "Not your ride." });
  if (ride.payment_status === "paid") return res.status(400).json({ message: "Already confirmed." });

  // Upsert payment record
  const { data: existing } = await supabaseAdmin
    .from("payments").select("id").eq("ride_id", ride_id).eq("method", "cash").maybeSingle();

  if (existing) {
    await supabaseAdmin.from("payments").update({ status: "completed" }).eq("id", existing.id);
  } else {
    await supabaseAdmin.from("payments").insert({ ride_id, amount: ride.fare, method: "cash", status: "completed" });
  }

  await supabaseAdmin.from("rides").update({ payment_status: "paid" }).eq("id", ride_id);
  return res.json({ message: "Cash payment confirmed.", ride_id });
};

// GET /payments/history — rider/driver payment history
const getPaymentHistory = async (req, res) => {
  const { data: profile } = await supabaseAdmin
    .from("users").select("role").eq("id", req.user.id).single();

  const column = profile?.role === "driver" ? "driver_id" : "rider_id";

  const { data: rides } = await supabaseAdmin
    .from("rides").select("id").eq(column, req.user.id);

  if (!rides?.length) return res.json([]);

  const rideIds = rides.map(r => r.id);
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("*, ride:rides(id, fare, status, payment_status, created_at)")
    .in("ride_id", rideIds)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
  return res.json(data || []);
};

module.exports = { initializeChapa, verifyChapa, chapaWebhook, payCash, confirmCash, getPaymentHistory };
