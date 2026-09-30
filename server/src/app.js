import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import listingRoutes from "./routes/listings.js";
import bookingRoutes from "./routes/bookings.js";
import { conversations, notifications, reviews, wishlists } from "./routes/social.js";
import { meta } from "./routes/meta.js";
import { HttpError } from "./util.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(compression());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes("*") || config.corsOrigins.includes(origin)),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/listings", listingRoutes);
  app.use("/api/bookings", bookingRoutes);
  app.use("/api/reviews", reviews);
  app.use("/api/conversations", conversations);
  app.use("/api/wishlists", wishlists);
  app.use("/api/notifications", notifications);
  app.use("/api", meta);
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  app.use("/uploads", express.static(config.uploadDir, { maxAge: "30d", immutable: true }));

  // In production the API also serves the built web app (single container deploy).
  if (fs.existsSync(path.join(config.webDist, "index.html"))) {
    app.use(express.static(config.webDist, { maxAge: "1h", index: false }));
    app.get("*", (_req, res) => res.sendFile(path.join(config.webDist, "index.html")));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.code === "LIMIT_FILE_SIZE") err = new HttpError(413, "Images must be under 10 MB");
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 && config.isProd ? "Something went wrong" : err.message, fields: err.details });
  });
  return app;
}
