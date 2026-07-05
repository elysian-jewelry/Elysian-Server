import dotenv from "dotenv";
dotenv.config();

import { loadSecrets } from "./config/loadSecrets.js";

const startServer = async () => {
  // Load secrets into process.env BEFORE importing the app. Some modules
  // (the mailer transporter, Google auth) read process.env at import time,
  // so app.js and cron.controller.js are imported dynamically below — after
  // secrets are in place. In production this pulls from Google Secret
  // Manager; locally it's a no-op and values come from .env.
  await loadSecrets();

  const { default: App } = await import("./app.js");
  const { birthdayPromoCron } = await import(
    "./controllers/cron.controller.js"
  );

  const app = new App();
  await app.connectToDatabase();
  app.initializeMiddlewares();
  app.listen();
  birthdayPromoCron(); // ✅ Cron can run now
};

startServer();
