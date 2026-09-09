import authRoute from "./auth.route.js"; // Default import
import productsRoute from "./products.route.js"; // Default import
import visitRoute from "./visit.route.js"; // Default import
import cartRoute from "./cart.route.js"; // Default import
import orderRoute from "./order.route.js"; // Default import
import profileRoute from "./profile.route.js"; // Default import
import AdminRoute from "./admin.route.js"; // Default import
import { requireAdmin } from "../middlewares/auth.middleware.js";


export default (app) => {
  app.use(authRoute);
  app.use(productsRoute);
  app.use(visitRoute);
  app.use(cartRoute);
  app.use(orderRoute);
  app.use(profileRoute);

  // Admin surface. The gate sits on the mount, so authorization is a property
  // of the routing tree rather than a string test any URL spelling can dodge:
  // nothing inside AdminRoute is reachable without passing requireAdmin, and
  // routes added there in future are covered automatically.
  app.use("/admin", requireAdmin, AdminRoute);
};
