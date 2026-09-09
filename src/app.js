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
    this.app.use(cors());
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
