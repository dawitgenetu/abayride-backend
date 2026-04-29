const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/authRoutes");
const rideRoutes = require("./routes/rideRoutes");
const driverRoutes = require("./routes/driverRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const ratingRoutes = require("./routes/ratingRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(null, true); // allow all in dev — tighten in production
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "bypass-tunnel-reminder",
    "X-Requested-With",
    "Accept",
  ],
  exposedHeaders: ["Content-Disposition"],
  optionsSuccessStatus: 204,
};

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // handle all preflight requests
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", authRoutes);
app.use("/api", rideRoutes);
app.use("/api", driverRoutes);
app.use("/api", paymentRoutes);
app.use("/api", ratingRoutes);
app.use("/api", adminRoutes);

app.use((err, _req, res, _next) => {
  return res.status(500).json({ message: "Internal server error", error: err.message });
});

module.exports = app;
