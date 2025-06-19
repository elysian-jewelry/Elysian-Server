import express from "express";
import { updateProductQuantity, getAllUsersWithOrderStats } from "../controllers/admin.controller.js";

const router = express.Router();

// Update product quantity by name and type
router.put("/admin/update-quantity", updateProductQuantity);

// New route to get all users and their order stats
router.get("/admin/users-with-orders", getAllUsersWithOrderStats);

export default router;