import App from "./app.js";
import { birthdayPromoCron } from "./controllers/cron.controller.js";

const startServer = async () => {
  const app = new App();
  await app.connectToDatabase(); 
  app.initializeMiddlewares();
  app.listen(); 
  birthdayPromoCron(); // ✅ Cron can run now
};

startServer();
