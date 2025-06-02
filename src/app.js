import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import initializeRoutes from "./routes/routes.js";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import sequelize from "./config/database.js";
import { authenticateJWT } from "./middlewares/auth.middleware.js"; 



dotenv.config();

class App {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 8080;
    this.env = process.env.NODE_ENV || "development";
    this.__dirname = path.dirname(fileURLToPath(import.meta.url));
  }

  // Connect to MySQL using Sequelize
  async connectToDatabase() {
    if (this.env === "development") {
      this.app.use(morgan("dev"));
    }

    // ✅ Load models & associations BEFORE syncing
  import('./models/product.js');
  import('./models/productImage.js');
  import('./models/associations.js');


    try {
      await sequelize.authenticate();
      console.log("✅ MySQL connected successfully!");
      await sequelize.sync();
      console.log("📦 Models synced successfully.");
    } catch (err) {
      console.error("❌ MySQL connection error:", err);
    }
  }

  // Middleware setup
  initializeMiddlewares() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use("/uploads", express.static(path.join(this.__dirname, "uploads")));

    // ✅ Apply JWT middleware globally (excluding public routes)
    this.app.use(authenticateJWT);

    // ✅ Load routes after auth middleware
    initializeRoutes(this.app);
  }

  // Start server
  listen() {
    this.app.listen(this.port, '0.0.0.0', () => {
      console.log(`🚀 Server is running on port ${this.port}`);
    });
  }

  getServer() {
    return this.app;
  }
}

export default App;
