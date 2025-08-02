import express from "express";
import { updateProductQuantity, createPublicPromo, updateProductSortOrder, getAllUsersWithOrderStats, addProductWithVariants } from "../controllers/admin.controller.js";

const router = express.Router();

// Update product quantity by name and type
router.put("/admin/update-quantity", updateProductQuantity);


router.post("/admin/update-sort-order", updateProductSortOrder);

// New route to get all users and their order stats
router.get("/admin/users-with-orders", getAllUsersWithOrderStats);

// 🔥 New route to add a product (with or without variants)
router.post("/admin/add-product", addProductWithVariants);

router.post("/admin/create-public", createPublicPromo);

export default router;