const { z } = require("zod");
const { supabaseAdmin } = require("../config/supabase");

const DEV_COMMISSION_RATE = 0.10;
const DRIVER_RATE         = 0.90;

const pointSchema = z.object({ lat: z.number(), lng: z.number() });

const requestRideSchema = z.object({
  pickup_location:      pointSchema,
  destination_location: pointSchema,
  total_fare:           z.number().positive(),
  distance_km:          z.number().min(0),
  payment_method:       z.enum(["cash", "chapa"]).default("cash"),
});

const updateRideStatusSchema = z.object({
  status: z.enum(["accepted", "arrived", "picked_up", "ongoing", "completed", "cancelled"]),
});

// ── POST /rides ───────────────────────────────────────────────────────────────
const requestRide = async (req, res) => {
  const parsed = requestRideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

  const { total_fare, distance_km, payment_method } = parsed.data;
  const dev_fee        = Math.round(total_fare * DEV_COMMISSION_RATE * 100) / 100;
  const driver_earning = Math.round(total_fare * DRIVER_RATE * 100) / 100;

  // Prevent duplicate active requests from the same rider
  const { data: existing } = await supabaseAdmin
    .from("rides")
    .select("id")
    .eq("rider_id", req.user.id)
    .in("status", ["requested", "accepted", "arrived", "picked_up", "ongoing"])
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ message: "You already have an active ride request." });
  }

  const { data, error } = await supabaseAdmin
    .from("rides")
    .insert({
      rider_id:             req.user.id,
      pickup_location:      parsed.data.pickup_location,
      destination_location: parsed.data.destination_location,
      fare:                 total_fare,   // keep fare column for backward compat
      distance_km,
      dev_fee,
      driver_earning,
      payment_method,
      status:               "requested",
    })
    .select("*")
    .single();

  if (error) return res.status(400).json({ message: error.message });
  return res.status(201).json(data);
};

// ── GET /rides/my ─────────────────────────────────────────────────────────────
const getMyRides = async (req, res) => {
  const { data: profile } = await supabaseAdmin
    .from("users").select("role").eq("id", req.user.id).single();
  const column = profile?.role === "driver" ? "driver_id" : "rider_id";

  const { data, error } = await supabaseAdmin
    .from("rides")
    .select("*")
    .eq(column, req.user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

// ── GET /rides/available — drivers see ONLY today's requested rides ────────────
const getAvailableRides = async (_req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabaseAdmin
    .from("rides")
    .select("*")
    .eq("status", "requested")
    .gte("created_at", todayStart.toISOString())
    .order("created_at", { ascending: true });

  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

// ── POST /rides/:id/accept ────────────────────────────────────────────────────
const acceptRide = async (req, res) => {
  const rideId = req.params.id;
  const { data: ride } = await supabaseAdmin
    .from("rides").select("*").eq("id", rideId).single();

  if (!ride || ride.status !== "requested") {
    return res.status(400).json({ message: "Ride not available." });
  }

  const { data, error } = await supabaseAdmin
    .from("rides")
    .update({ status: "accepted", driver_id: req.user.id })
    .eq("id", rideId)
    .select("*")
    .single();

  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

// ── PATCH /rides/:id/status ───────────────────────────────────────────────────
const updateRideStatus = async (req, res) => {
  const parsed = updateRideStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

  const { data: ride, error: fetchErr } = await supabaseAdmin
    .from("rides")
    .select("status, payment_status, driver_id, rider_id")
    .eq("id", req.params.id)
    .single();

  if (fetchErr || !ride) return res.status(404).json({ message: "Ride not found." });

  if (parsed.data.status === "completed" && ride.payment_status !== "paid") {
    return res.status(400).json({ message: "Payment required before completing the ride." });
  }

  const TRANSITIONS = {
    requested: ["accepted", "cancelled"],
    accepted:  ["arrived",  "cancelled"],
    arrived:   ["picked_up","cancelled"],
    picked_up: ["ongoing"],
    ongoing:   ["completed"],
    completed: [],
    cancelled: [],
  };

  const allowed = TRANSITIONS[ride.status] || [];
  if (!allowed.includes(parsed.data.status)) {
    return res.status(400).json({
      message: `Cannot transition from '${ride.status}' to '${parsed.data.status}'.`,
    });
  }

  const userRole = req.user?.role;
  if (userRole === "rider" && !["picked_up", "cancelled"].includes(parsed.data.status)) {
    return res.status(403).json({ message: "Riders can only confirm boarding or cancel." });
  }
  if (userRole === "driver" && parsed.data.status === "picked_up") {
    return res.status(403).json({ message: "Only the rider can confirm boarding." });
  }

  const { data, error } = await supabaseAdmin
    .from("rides")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select("*")
    .single();

  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

// ── GET /rides/active — rider's current non-terminal ride ─────────────────────
const getActiveRide = async (req, res) => {
  const ACTIVE_STATUSES = ["requested", "accepted", "arrived", "picked_up", "ongoing"];
  const { data, error } = await supabaseAdmin
    .from("rides")
    .select("*")
    .eq("rider_id", req.user.id)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

module.exports = {
  requestRide,
  getMyRides,
  getAvailableRides,
  acceptRide,
  updateRideStatus,
  getActiveRide,
};
