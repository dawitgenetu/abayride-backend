const PDFDocument = require("pdfkit");
const { supabaseAdmin } = require("../config/supabase");
const { parsePagination, sanitizeIlike } = require("../utils/pagination");

const getUsers = async (req, res) => {
  const { page, limit, from, to } = parsePagination(req.query);
  const role = req.query.role;
  const q = sanitizeIlike(req.query.q);

  let query = supabaseAdmin.from("users").select("*", { count: "exact" });
  if (role && ["rider", "driver", "admin"].includes(role)) query = query.eq("role", role);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ message: error.message });
  return res.json({ data: data || [], page, limit, total: count ?? 0 });
};

const updateUserProfile = async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.slice(0, 200).trim() : null;
  const phone = typeof req.body?.phone === "string" ? req.body.phone.slice(0, 30).trim() : null;
  if (!name && !phone) {
    return res.status(400).json({ message: "Provide at least one field: name or phone." });
  }

  const patch = {};
  if (name) patch.name = name;
  if (phone) patch.phone = phone;

  const { data, error } = await supabaseAdmin
    .from("users")
    .update(patch)
    .eq("id", req.params.id)
    .select("*")
    .single();

  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

const setUserBlocked = async (req, res) => {
  const blocked = req.body?.blocked === true || req.body?.blocked === "true";

  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ is_blocked: blocked })
    .eq("id", req.params.id)
    .select("*")
    .single();

  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

const getDrivers = async (req, res) => {
  const { page, limit, from, to } = parsePagination(req.query);
  const approval = req.query.approval_status;
  const q = sanitizeIlike(req.query.q);

  let query = supabaseAdmin
    .from("drivers")
    .select("*, users ( id, name, phone, role, is_blocked, created_at )", { count: "exact" });
  if (approval && ["pending", "approved", "rejected"].includes(approval)) {
    query = query.eq("approval_status", approval);
  }
  if (q) query = query.or(`car_info.ilike.%${q}%,license_number.ilike.%${q}%`);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ message: error.message });
  return res.json({ data: data || [], page, limit, total: count ?? 0 });
};

const approveDriver = async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("drivers")
    .update({
      is_approved: true,
      approval_status: "approved",
      rejection_reason: null,
    })
    .eq("id", req.params.id)
    .select("*")
    .single();
  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

const rejectDriver = async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : "";
  const { data, error } = await supabaseAdmin
    .from("drivers")
    .update({
      is_approved: false,
      approval_status: "rejected",
      rejection_reason: reason || null,
      is_online: false,
    })
    .eq("id", req.params.id)
    .select("*")
    .single();
  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

const getRides = async (req, res) => {
  const { page, limit, from, to } = parsePagination(req.query);
  const status = req.query.status;
  const fromDate = req.query.from;
  const toDate = req.query.to;

  // Fetch rides without join first, then manually attach user names
  let query = supabaseAdmin
    .from("rides")
    .select("*", { count: "exact" });

  if (status && ["requested", "accepted", "ongoing", "completed", "cancelled"].includes(status)) {
    query = query.eq("status", status);
  }
  if (fromDate) query = query.gte("created_at", fromDate);
  if (toDate) query = query.lte("created_at", toDate);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data: rides, error, count } = await query;
  if (error) return res.status(400).json({ message: error.message });

  if (!rides || rides.length === 0) {
    return res.json({ data: [], page, limit, total: count ?? 0 });
  }

  // Collect unique user IDs and fetch them in one query
  const userIds = [...new Set([
    ...rides.map(r => r.rider_id).filter(Boolean),
    ...rides.map(r => r.driver_id).filter(Boolean),
  ])];

  const { data: users } = await supabaseAdmin
    .from("users")
    .select("id, name, phone, role")
    .in("id", userIds);

  const userMap = {};
  (users || []).forEach(u => { userMap[u.id] = u; });

  const data = rides.map(r => ({
    ...r,
    rider: userMap[r.rider_id] || null,
    driver: userMap[r.driver_id] || null,
  }));

  return res.json({ data, page, limit, total: count ?? 0 });
};

const getRidesMap = async (req, res) => {
  const n = Math.min(200, Math.max(10, parseInt(String(req.query.limit || "80"), 10) || 80));
  const { data, error } = await supabaseAdmin.from("rides").select("id,status,pickup_location,destination_location,created_at").order("created_at", { ascending: false }).limit(n);
  if (error) return res.status(400).json({ message: error.message });
  return res.json({ data: data || [] });
};

const assignRide = async (req, res) => {
  const driverUserId = req.body?.driver_user_id;
  if (!driverUserId) return res.status(400).json({ message: "driver_user_id is required." });

  const { data: user, error: uErr } = await supabaseAdmin.from("users").select("role").eq("id", driverUserId).single();
  if (uErr || !user || user.role !== "driver") {
    return res.status(400).json({ message: "Target user must be a driver." });
  }

  const { data: driver, error: dErr } = await supabaseAdmin.from("drivers").select("is_approved, approval_status").eq("user_id", driverUserId).single();
  if (dErr || !driver) return res.status(400).json({ message: "Driver profile not found." });
  const approved =
    driver.approval_status === "approved" || (driver.is_approved && driver.approval_status !== "rejected");
  if (!approved) return res.status(400).json({ message: "Driver is not approved." });

  const { data: ride, error: rErr } = await supabaseAdmin.from("rides").select("id,status").eq("id", req.params.id).single();
  if (rErr || !ride) return res.status(400).json({ message: "Ride not found." });
  if (ride.status === "completed" || ride.status === "cancelled") {
    return res.status(400).json({ message: "Cannot assign a completed or cancelled ride." });
  }

  const { data, error } = await supabaseAdmin
    .from("rides")
    .update({ driver_id: driverUserId, status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select("*")
    .single();
  if (error) return res.status(400).json({ message: error.message });
  return res.json(data);
};

const getPayments = async (req, res) => {
  const { page, limit, from, to } = parsePagination(req.query);
  const method = req.query.method;
  const status = req.query.status;
  const fromDate = req.query.from;
  const toDate = req.query.to;

  let query = supabaseAdmin
    .from("payments")
    .select("*, ride:rides ( id, status, fare, pickup_location, destination_location, rider_id, driver_id )", { count: "exact" });

  if (method && ["cash", "chapa"].includes(method)) query = query.eq("method", method);
  if (status && ["pending", "completed", "failed"].includes(status)) query = query.eq("status", status);
  if (fromDate) query = query.gte("created_at", fromDate);
  if (toDate) query = query.lte("created_at", toDate);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data: payments, error, count } = await query;
  if (error) return res.status(400).json({ message: error.message });

  if (!payments || payments.length === 0) {
    return res.json({ data: [], page, limit, total: count ?? 0 });
  }

  // Attach rider/driver names
  const userIds = [...new Set([
    ...payments.map(p => p.ride?.rider_id).filter(Boolean),
    ...payments.map(p => p.ride?.driver_id).filter(Boolean),
  ])];

  const { data: users } = userIds.length
    ? await supabaseAdmin.from("users").select("id, name, phone").in("id", userIds)
    : { data: [] };

  const userMap = {};
  (users || []).forEach(u => { userMap[u.id] = u; });

  const data = payments.map(p => ({
    ...p,
    ride: p.ride ? {
      ...p.ride,
      rider: userMap[p.ride.rider_id] || null,
      driver: userMap[p.ride.driver_id] || null,
    } : null,
  }));

  return res.json({ data, page, limit, total: count ?? 0 });
};

const fetchPaymentsForExport = async (query) => {
  const method = query.method;
  const status = query.status;
  const fromDate = query.from;
  const toDate = query.to;
  const cap = Math.min(5000, Math.max(1, parseInt(String(query.max || "2000"), 10) || 2000));

  let q = supabaseAdmin.from("payments").select("*").order("created_at", { ascending: false }).limit(cap);
  if (method && ["cash", "chapa"].includes(method)) q = q.eq("method", method);
  if (status && ["pending", "completed", "failed"].includes(status)) q = q.eq("status", status);
  if (fromDate) q = q.gte("created_at", fromDate);
  if (toDate) q = q.lte("created_at", toDate);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
};

const exportPaymentsCsv = async (req, res) => {
  try {
    const rows = await fetchPaymentsForExport(req.query);
    const header = ["id", "ride_id", "amount", "method", "status", "tx_ref", "created_at"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const line = header.map((k) => JSON.stringify(r[k] ?? "")).join(",");
      lines.push(line);
    }
    const body = lines.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="payments-export.csv"');
    return res.send(body);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

const exportPaymentsPdf = async (req, res) => {
  try {
    const rows = await fetchPaymentsForExport(req.query);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="payments-export.pdf"');

    const doc = new PDFDocument({ margin: 36 });
    doc.pipe(res);
    doc.fontSize(16).text("Payments report", { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toISOString()} — rows: ${rows.length}`);
    doc.moveDown();

    rows.slice(0, 500).forEach((r, i) => {
      doc.fontSize(9).text(
        `${i + 1}. ${r.id} | ride:${r.ride_id} | ${r.amount} ETB | ${r.method} | ${r.status} | ${r.tx_ref || "-"} | ${r.created_at}`
      );
    });
    if (rows.length > 500) doc.fontSize(9).text(`... and ${rows.length - 500} more (narrow filters or use CSV).`);
    doc.end();
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

const getAnalytics = async (_req, res) => {
  const [
    { count: usersCount },
    { count: driversCount },
    { count: ridesCount },
    { count: completedRidesCount },
    { count: activeDriversCount },
    { data: completedRides },
    { data: payments },
  ] = await Promise.all([
    supabaseAdmin.from("users").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("drivers").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("rides").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("rides").select("*", { count: "exact", head: true }).eq("status", "completed"),
    supabaseAdmin.from("drivers").select("*", { count: "exact", head: true }).eq("approval_status", "approved").eq("is_online", true),
    supabaseAdmin.from("rides").select("fare, dev_fee, driver_earning").eq("status", "completed"),
    supabaseAdmin.from("payments").select("amount,status,method"),
  ]);

  // Platform revenue = sum of dev_fee from completed rides
  const platformRevenue = (completedRides || []).reduce((sum, r) => {
    const fee = Number(r.dev_fee) > 0 ? Number(r.dev_fee) : Number(r.fare || 0) * 0.1;
    return sum + fee;
  }, 0);

  // Total driver earnings
  const totalDriverEarnings = (completedRides || []).reduce((sum, r) => {
    const earning = Number(r.driver_earning) > 0 ? Number(r.driver_earning) : Number(r.fare || 0) * 0.9;
    return sum + earning;
  }, 0);

  // Total gross revenue (all completed fares)
  const grossRevenue = (completedRides || []).reduce((sum, r) => sum + Number(r.fare || 0), 0);

  // Legacy: payment-based revenue
  const paymentRevenue = (payments || []).filter((p) => p.status === "completed").reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return res.json({
    usersCount:           usersCount || 0,
    driversCount:         driversCount || 0,
    ridesCount:           ridesCount || 0,
    completedRidesCount:  completedRidesCount || 0,
    activeDriversOnline:  activeDriversCount || 0,
    completedRevenue:     Math.round(paymentRevenue * 100) / 100,
    platformRevenue:      Math.round(platformRevenue * 100) / 100,
    totalDriverEarnings:  Math.round(totalDriverEarnings * 100) / 100,
    grossRevenue:         Math.round(grossRevenue * 100) / 100,
  });
};


const getAnalyticsCharts = async (req, res) => {
  const period = ["day", "week", "month"].includes(req.query.period) ? req.query.period : "week";
  const now = new Date();
  let start = new Date(now);
  if (period === "day") start.setUTCDate(now.getUTCDate() - 14);
  if (period === "week") start.setUTCDate(now.getUTCDate() - 56);
  if (period === "month") start.setUTCMonth(now.getUTCMonth() - 12);

  const [{ data: rides }, { data: drivers }, { data: payments }] = await Promise.all([
    supabaseAdmin.from("rides").select("created_at,status").gte("created_at", start.toISOString()),
    supabaseAdmin.from("drivers").select("is_online, approval_status, is_approved"),
    supabaseAdmin
      .from("payments")
      .select("created_at,amount,status,method")
      .gte("created_at", start.toISOString()),
  ]);

  // Rides timeseries → array of { label, count }
  const ridesByDay = {};
  (rides || []).forEach((r) => {
    const key = new Date(r.created_at).toISOString().slice(0, 10);
    ridesByDay[key] = (ridesByDay[key] || 0) + 1;
  });
  const ridesArr = Object.keys(ridesByDay)
    .sort()
    .map((date) => ({ label: date.slice(5), count: ridesByDay[date] }));

  // Revenue timeseries → array of { label, cash, chapa }
  const revByDay = {};
  (payments || [])
    .filter((p) => p.status === "completed")
    .forEach((p) => {
      const key = new Date(p.created_at).toISOString().slice(0, 10);
      if (!revByDay[key]) revByDay[key] = { cash: 0, chapa: 0 };
      const amt = Number(p.amount || 0);
      if (p.method === "cash") revByDay[key].cash += amt;
      if (p.method === "chapa") revByDay[key].chapa += amt;
    });
  const revenueArr = Object.keys(revByDay)
    .sort()
    .map((date) => ({ label: date.slice(5), ...revByDay[date] }));

  // Drivers snapshot → array of { label, active, idle }
  const approved = (drivers || []).filter(
    (d) => d.approval_status === "approved" || (d.is_approved && d.approval_status !== "rejected")
  );
  const activeOnline = approved.filter((d) => d.is_online).length;
  const idleApproved = approved.filter((d) => !d.is_online).length;
  const driversArr = [{ label: "Now", active: activeOnline, idle: idleApproved }];

  return res.json({
    period,
    rides: ridesArr,
    revenue: revenueArr,
    drivers: driversArr,
  });
};

const getNotificationsSummary = async (_req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: pendingDrivers }, { count: failedPayments24h }] = await Promise.all([
    supabaseAdmin.from("drivers").select("*", { count: "exact", head: true }).eq("approval_status", "pending"),
    supabaseAdmin.from("payments").select("*", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
  ]);

  return res.json({
    pendingDrivers: pendingDrivers || 0,
    failedPayments: failedPayments24h || 0,
  });
};

module.exports = {
  getUsers,
  updateUserProfile,
  setUserBlocked,
  getDrivers,
  approveDriver,
  rejectDriver,
  getRides,
  getRidesMap,
  assignRide,
  getPayments,
  exportPaymentsCsv,
  exportPaymentsPdf,
  getAnalytics,
  getAnalyticsCharts,
  getNotificationsSummary,
};
