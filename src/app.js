import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import initializeRoutes from "./routes/routes.js";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import sequelize from "./config/database.js";
import { authenticateJWT } from "./middlewares/auth.middleware.js";
import { connectToMongoDB } from "./config/mongodb.js";

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
    await connectToMongoDB(); // ✅ Connect to MongoDB first
    if (this.env === "development") {
      this.app.use(morgan("dev"));
    }
  }

  // Middleware setup
  initializeMiddlewares() {
    this.app.use(cors());
    this.app.use(express.json());
    // Serve only the images folder at /images
    // Serve only the images folder at /images
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
