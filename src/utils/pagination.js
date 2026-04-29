const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const parsePagination = (query) => {
  const page = clamp(parseInt(String(query.page || "1"), 10) || 1, 1, 10000);
  const limit = clamp(parseInt(String(query.limit || "20"), 10) || 20, 1, 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
};

const sanitizeIlike = (raw) => {
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/[%_]/g, "").trim().slice(0, 80);
};

module.exports = { parsePagination, sanitizeIlike };
