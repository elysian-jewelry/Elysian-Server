import App from "./app.js";
import { birthdayPromoCron, missingBirthdayReminderCronTest, missingBirthdayReminderCron } from "./controllers/cron.controller.js";

const startServer = async () => {
  const app = new App();
  await app.connectToDatabase(); // ✅ Wait for DB connection
  app.initializeMiddlewares();
  app.listen(); // ✅ Now it's safe to start the server
  birthdayPromoCron(); // ✅ Cron can run now
  // missingBirthdayReminderCronTest(); // ✅ Test cron can run now
  // missingBirthdayReminderCron(); // ✅ Production cron can run now
};

startServer();
