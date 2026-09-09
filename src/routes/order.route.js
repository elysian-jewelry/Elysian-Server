import express from "express";
import { listGovernorates, checkout, getUserOrders, validatePromoCode } from "../controllers/order.controller.js";
import { checkoutSchema } from "../validation/order.validation.js";
import { validate } from "../middlewares/validation.middleware.js";


const router = express.Router({ caseSensitive: true, strict: false });

// Public endpoint to fetch all governorates with id/name/cost
router.get("/governorates/rates", listGovernorates);

// NOTE: there is deliberately no route for updateGoogleSheet. It is an
// internal helper called by checkout(), not an endpoint — registering it as
// one passed the Express `req` object in place of its row array, producing an
// unhandled rejection that terminated the worker process.

router.post('/validate', validatePromoCode);

router.post("/checkout", validate(checkoutSchema), checkout);

router.get("/user/orders", getUserOrders);



export default router;
