import express from "express";
import { setPrimaryImageByNumber, swapProductOrder, checkAndAddProductImages, updateProductQuantity, getAllUsersWithOrderStats, addProductWithVariants } from "../controllers/admin.controller.js";

const router = express.Router();


router.post("/admin/products/set-primary-image", setPrimaryImageByNumber);

router.post("/admin/products/swap-order", swapProductOrder);

router.get("/admin/add-product-images", checkAndAddProductImages);

// Update product quantity by name and type
router.put("/admin/update-quantity", updateProductQuantity);

// New route to get all users and their order stats
router.get("/admin/users-with-orders", getAllUsersWithOrderStats);

// 🔥 New route to add a product (with or without variants)
router.post("/admin/add-product", addProductWithVariants);

export default router;