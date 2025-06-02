import express from "express";
import { getAllProducts, getProductsByType } from "../controllers/user/product.controller.js";

const router = express.Router();

// Get all products
router.get("/products", getAllProducts);

// Get products by type (expects ?type=Hand Chains)
router.get("/products/type", getProductsByType);

export default router;
