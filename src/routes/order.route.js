import express from "express";
import { updateGoogleSheet, checkout, getUserOrders, validatePromoCode } from "../controllers/user/order.controller.js";
import { checkoutSchema } from "../validation/order.validation.js";
import { validate } from "../middlewares/validation.middleware.js";


const router = express.Router();

// Add product to cart
router.post("/update/google-sheet", updateGoogleSheet);

router.post('/validate', validatePromoCode);


router.post("/checkout", validate(checkoutSchema), checkout);

router.get("/user/orders", getUserOrders);

export default router;
