import express from "express";
import { listGovernorates, updateGoogleSheet, checkout, getUserOrders, validatePromoCode } from "../controllers/order.controller.js";
import { checkoutSchema } from "../validation/order.validation.js";
import { validate } from "../middlewares/validation.middleware.js";


const router = express.Router();

// Public endpoint to fetch all governorates with id/name/cost
router.get("/get/governorates/rates", listGovernorates);
// Add product to cart
router.post("/update/google-sheet", updateGoogleSheet);

router.post('/validate', validatePromoCode);

router.post("/checkout", validate(checkoutSchema), checkout);

router.get("/user/orders", getUserOrders);



export default router;
