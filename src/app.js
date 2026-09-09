import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import initializeRoutes from "./routes/routes.js";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { authenticateJWT } from "./middlewares/auth.middleware.js";
import { globalLimiter } from "./middlewares/rateLimit.middleware.js";
import { connectToMongoDB } from "./config/mongodb.js";

dotenv.config();



/**
 * Build the CORS allowlist from ALLOWED_ORIGINS ("a,b,c").
 *
 * The value comes from Google Secret Manager via loadSecrets(), which runs in
 * server.js BEFORE app.js is imported. This is called from
 * initializeMiddlewares() rather than evaluated at module scope so that simply
 * importing this module can never capture an empty allowlist and silently
 * refuse every browser request.
 */
export const parseAllowedOrigins = () => {
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || "";

  return new Set([
    ...allowedOriginsEnv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Local Vite dev server — never added in production. vite.config.ts pins
    // port 5000; 5173 is Vite's default and is kept so a default-port run
    // also works.
    ...(process.env.NODE_ENV !== "production"
      ? ["http://localhost:5000", "http://localhost:5173"]
      : []),
  ]);
};

class App {
  constructor() {
    this.app = express();

    // These must be set before the first route or middleware is registered:
    // Express builds its router lazily and reads both settings once, at that
    // moment. Case-sensitive routing is what stops `/ADMIN/users` from being
    // matched by the `/admin` mount after skipping a case-sensitive guard.
    this.app.set("case sensitive routing", true);
    this.app.set("strict routing", false);

    // App Engine terminates TLS and proxies one hop upstream. Trust exactly
    // that hop so the rate limiter keys on the real client IP rather than the
    // front end's — `true` here would let a client spoof X-Forwarded-For.
    this.app.set("trust proxy", 1);

    this.port = process.env.PORT || 8080;
    this.env = process.env.NODE_ENV || "development";
    this.__dirname = path.dirname(fileURLToPath(import.meta.url));
  }

  // Connect to MySQL using Sequelize
  async connectToDatabase() {
    await connectToMongoDB(); // ✅ Connect to MongoDB first
    if (this.env === "development") {
      this.app.use(morgan("dev"));
    }
  }

  // Middleware setup
  initializeMiddlewares() {
    const ALLOWED_ORIGINS = parseAllowedOrigins();

    // An empty allowlist in production would refuse every browser request
    // while still answering curl, so the storefront would look broken with no
    // obvious cause. Fail at boot with a message that says how to fix it.
    if (this.env === "production" && ALLOWED_ORIGINS.size === 0) {
      throw new Error(
        "ALLOWED_ORIGINS is empty in production — every browser request would " +
          "be refused by CORS. Set the ALLOWED_ORIGINS secret to a " +
          "comma-separated origin list and redeploy."
      );
    }

    console.log(
      `CORS allowlist (${ALLOWED_ORIGINS.size}): ${[...ALLOWED_ORIGINS].join(", ") || "(empty)"}`
    );

    this.app.use(
      cors({
        origin: (origin, cb) => {
          // No Origin header means same-origin, curl, or server-to-server —
          // CORS is a browser control and does not apply to those.
          if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
          return cb(new Error("Not allowed by CORS"));
        },
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        // The client authenticates with a Bearer header, not cookies, so
        // credentials stay off — which is also what makes an allowlist safe.
        maxAge: 86400,
      })
    );
    this.app.use(express.json());

    // Broad ceiling first, so it also covers the static image tree below.
    this.app.use(globalLimiter);

    this.app.use(
      "/images",
      express.static(path.join(this.__dirname, "images"))
    );

    // ✅ Apply JWT middleware globally (excluding public routes)
    this.app.use(authenticateJWT);

    // ✅ Load routes after auth middleware
    initializeRoutes(this.app);
  }

  // Start server
  listen() {
    this.app.listen(this.port, "0.0.0.0", () => {
      console.log(`🚀 Server is running on port ${this.port}`);
    });
  }

  getServer() {
    return this.app;
  }
}

export default App;
