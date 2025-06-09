import userRoute from "./auth.route.js"; // Default import
import productsRoute from "./products.route.js"; // Default import
import cartRoute from "./cart.route.js"; // Default import
import orderRoute from "./order.route.js"; // Default import
import profileRoute from "./profile.route.js"; // Default import
import uploadRoute from "./upload.route.js"; // Default import


export default (app) => {
  app.use(userRoute);
  app.use(productsRoute);
  app.use(cartRoute);
  app.use(orderRoute);
  app.use(profileRoute);
  app.use(uploadRoute);
};
