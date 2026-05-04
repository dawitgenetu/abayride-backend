const { supabaseAdmin, supabaseAuthClient } = require("../config/supabase");

const login = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "Email and password required." });

  const { data, error } = await supabaseAuthClient.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ message: error.message });

  // Verify the user has admin role
  const { data: profile, error: pErr } = await supabaseAdmin
    .from("users")
    .select("role, is_blocked")
    .eq("id", data.user.id)
    .single();

  if (pErr || !profile) return res.status(401).json({ message: "User profile not found." });
  if (profile.role !== "admin") return res.status(403).json({ message: "Access denied. Admin only." });
  if (profile.is_blocked) return res.status(403).json({ message: "Account is blocked." });

  return res.json({
    access_token: data.session.access_token,
    user: { id: data.user.id, email: data.user.email, role: profile.role },
  });
};

const getMe = async (req, res) => {
  const { data: profile, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", req.user.id)
    .single();

  if (error) return res.status(400).json({ message: error.message });

  // For drivers, include approval status so the mobile app
  // doesn't need a second API call
  let driverProfile = null;
  if (profile.role === "driver") {
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("id, approval_status, is_approved, rejection_reason, wallet_balance")
      .eq("user_id", req.user.id)
      .maybeSingle();
    driverProfile = driver ?? null;
  }

  return res.json({
    // Flat fields for easy access
    ...profile,
    driver: driverProfile,
    // Legacy nested shape (admin web uses this)
    auth_user: req.user,
    profile,
  });
};

module.exports = { login, getMe };
