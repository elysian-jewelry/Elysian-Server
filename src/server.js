import App from "./app.js";
import { birthdayPromoCron } from "./controllers/user/birthdayPromoCron.controller.js";

const startServer = async () => {
  const app = new App();
  await app.connectToDatabase(); // ✅ Wait for DB connection
  app.initializeMiddlewares();
  app.listen(); // ✅ Now it's safe to start the server
  birthdayPromoCron(); // ✅ Cron can run now
};

startServer();
