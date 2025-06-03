import express from "express";
import { getAllProducts, getProductsByType, updateProductQuantity } from "../controllers/user/product.controller.js";

const router = express.Router();

// Update product quantity by name and type
router.put("/products/update-quantity", updateProductQuantity);

// Get all products
router.get("/products", getAllProducts);

// Get products by type (expects ?type=Hand Chains)
router.get("/products/type", getProductsByType);

export default router;
