const { z } = require("zod");
const { supabaseAdmin } = require("../config/supabase");

const statusSchema = z.object({
  is_online: z.boolean(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const registerDriverSchema = z.object({
  car_info: z.string().min(3),
  license_number: z.string().min(5),
});

const updateDriverStatus = async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

  const update = {
    is_online: parsed.data.is_online,
    last_location: parsed.data.lat && parsed.data.lng ? { lat: parsed.data.lat, lng: parsed.data.lng } : null,
  };

  const { data, error } = await supabaseAdmin
    .from("drivers")
    .update(update)
    .eq("user_id", req.user.id)
    .select("*")
    .single();

  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

const registerDriverProfile = async (req, res) => {
  const parsed = registerDriverSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

  const { data, error } = await supabaseAdmin
    .from("drivers")
    .upsert({
      user_id: req.user.id,
      car_info: parsed.data.car_info,
      license_number: parsed.data.license_number,
      is_approved: false,
      is_online: false,
      approval_status: "pending",
      rejection_reason: null,
    })
    .select("*")
    .single();

  if (error) return res.status(400).json({ message: error.message });
  return res.status(201).json(data);
};

const getDriverEarnings = async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("rides")
    .select("fare, driver_earning, dev_fee, status, payment_status")
    .eq("driver_id", req.user.id)
    .eq("status", "completed");

  if (error) return res.status(400).json({ message: error.message });

  const totalCompletedRides = data.length;
  // Use driver_earning if available (new column), fall back to 90% of fare
  const totalEarnings = data.reduce((sum, ride) => {
    const earning = Number(ride.driver_earning) > 0
      ? Number(ride.driver_earning)
      : Number(ride.fare || 0) * 0.9;
    return sum + earning;
  }, 0);
  const paidRides = data.filter((ride) => ride.payment_status === "paid").length;

  return res.json({ totalCompletedRides, totalEarnings: Math.round(totalEarnings * 100) / 100, paidRides });
};

module.exports = { updateDriverStatus, registerDriverProfile, getDriverEarnings };
