const { z } = require("zod");
const { supabaseAdmin } = require("../config/supabase");

const createRatingSchema = z.object({
  driver_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

const createRating = async (req, res) => {
  const parsed = createRatingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

  const { data, error } = await supabaseAdmin
    .from("ratings")
    .insert({
      rider_id: req.user.id,
      driver_id: parsed.data.driver_id,
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
    })
    .select("*")
    .single();

  if (error) return res.status(400).json({ message: error.message });
  return res.status(201).json(data);
};

const getDriverRatings = async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("ratings")
    .select("*")
    .eq("driver_id", req.params.driverId)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

module.exports = { createRating, getDriverRatings };
