const axios = require("axios");

// Read key lazily so it's always fresh from process.env
const getKey = () => {
  const key = process.env.CHAPA_SECRET_KEY;
  if (!key) throw new Error("CHAPA_SECRET_KEY is not set in .env");
  return key;
};

const getBase = () => process.env.CHAPA_BASE_URL || "https://api.chapa.co/v1";

const initializeChapaPayment = async ({ amount, tx_ref, email, first_name, last_name }) => {
  const payload = {
    amount: String(amount),
    currency: "ETB",
    email,
    first_name,
    last_name,
    tx_ref,
    callback_url: `${process.env.FRONTEND_SUCCESS_URL}/payment/callback`,
    return_url:   `${process.env.FRONTEND_SUCCESS_URL}/payment/return`,
  };

  const { data } = await axios.post(`${getBase()}/transaction/initialize`, payload, {
    headers: { Authorization: `Bearer ${getKey()}`, "Content-Type": "application/json" },
  });
  return data;
};

const verifyChapaPayment = async (tx_ref) => {
  const { data } = await axios.get(`${getBase()}/transaction/verify/${tx_ref}`, {
    headers: { Authorization: `Bearer ${getKey()}` },
  });
  return data;
};

module.exports = { initializeChapaPayment, verifyChapaPayment };
