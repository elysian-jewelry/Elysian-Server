// Initialize express router
import express from "express";

import { createPayment} from "../controllers/user/payment.controller.js";
const router = express.Router();

router.get("/api/create-payment", createPayment);

export default router;
