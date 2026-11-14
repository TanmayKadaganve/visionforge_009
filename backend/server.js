import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIP } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import mongoose from "mongoose";
import { connectDatabase } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import locationRoutes from "./routes/locationRoutes.js";
import rideRoutes from "./routes/rideRoutes.js";
import driverRoutes from "./routes/driverRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { processExpiredAssignments } from "./controllers/driverController.js";
const app = express();
dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env"),
});
const port = Number(process.env.PORT || 5000);
const normalizeOrigin = (value) => {
  try { return new URL(value).origin; } catch { return null; }
};
const clientOrigins = new Set(
  (process.env.CLIENT_URL || "http://localhost:5173")
    .split(",")
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean),
);
if (process.env.NODE_ENV !== "production") {
  clientOrigins.add("http://localhost:5173");
  clientOrigins.add("http://127.0.0.1:5173");
}
const isPrivateDevelopmentOrigin = (origin) => {
  if (process.env.NODE_ENV === "production") return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:") return false;
    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
    if (isIP(host) !== 4) return false;
    const [first, second] = host.split(".").map(Number);
    return first === 10 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
  } catch {
    return false;
  }
};
const isAllowedOrigin = (origin) =>
  !origin || clientOrigins.has(normalizeOrigin(origin)) || isPrivateDevelopmentOrigin(origin);
app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
}));
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    req.get("origin") &&
    !isAllowedOrigin(req.get("origin"))
  )
    return res
      .status(403)
      .json({
        success: false,
        message: "Frontend origin is not allowed. Add the frontend origin to the backend CLIENT_URL setting.",
      });
  return next();
});
app.get("/api/health", (_req, res) =>
  res.json({ success: true, message: "RideFlow API is running." }),
);
app.use("/api/auth", authRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/driver", driverRoutes);
app.use("/api/admin", adminRoutes);
app.use((_req, res) =>
  res
    .status(404)
    .json({
      success: false,
      message: "The requested API endpoint was not found.",
    }),
);
app.use((err, _req, res, _next) => {
  if (mongoose.connection.readyState !== 1) {
    console.error("API request failed because MongoDB is disconnected.");
    return res
      .status(503)
      .json({
        success: false,
        message: "Database is not connected. Start MongoDB and try again.",
      });
  }
  console.error("API error:", err.name);
  res
    .status(500)
    .json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
});
try {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.includes("replace_with")
  )
    throw new Error(
      "Set JWT_SECRET in backend/.env to a strong random value of at least 32 characters",
    );
  await connectDatabase();
  const reassignmentTimer = setInterval(() => processExpiredAssignments().catch(() => {}), 5000);
  reassignmentTimer.unref();
  app.listen(port, () =>
    console.log(`RideFlow API listening on http://localhost:${port}`),
  );
} catch (error) {
  console.error(`Unable to start RideFlow API: ${error.message}`);
  process.exit(1);
}
