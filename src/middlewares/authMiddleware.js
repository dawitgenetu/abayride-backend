const { supabaseAuthClient } = require("../config/supabase");

const authenticateUser = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing bearer token." });
    }

    const token = header.split(" ")[1];
    const { data, error } = await supabaseAuthClient.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ message: "Invalid or expired token. Please log in again." });
    }

    req.user = data.user;
    next();
  } catch (error) {
    return res.status(500).json({ message: "Authentication failed.", error: error.message });
  }
};

const authorizeRole = (...allowedRoles) => {
  return async (req, res, next) => {
    const { supabaseAdmin } = require("../config/supabase");
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", req.user.id)
      .single();

    if (error || !data) {
      return res.status(403).json({ message: "User role not found." });
    }

    if (!allowedRoles.includes(data.role)) {
      return res.status(403).json({ message: "Forbidden for this role." });
    }

    req.userRole = data.role;
    next();
  };
};

module.exports = { authenticateUser, authorizeRole };
