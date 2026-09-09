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

// Last-resort net. asyncHandler routes rejections from route handlers into
// ErrorMiddleware, but a rejection from outside the request cycle (a cron
// tick, a background task) has nowhere else to go — and since Node 15 an
// unhandled rejection terminates the process by default, which on a
// single-instance service is a full outage. Log it and keep serving.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

// An uncaught exception leaves the process in an undefined state, so unlike
// the above this one logs and then exits so App Engine restarts it cleanly.
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception — exiting so the instance restarts:", err);
  process.exit(1);
});

startServer().catch((err) => {
  // A startup failure (e.g. a secret that can't be read) would otherwise
  // surface as an opaque unhandled rejection. Log it clearly so it shows
  // up in `gcloud app logs`, then exit so App Engine restarts the instance.
  console.error("❌ Fatal startup error:", err);
  process.exit(1);
});
