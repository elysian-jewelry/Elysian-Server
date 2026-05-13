import express from "express";
import { getAllProducts, getProductsByType, getFeaturedProducts, getNewArrivalProducts, getCategories } from "../controllers/product.controller.js";

const router = express.Router();

router.get("/products/categories", getCategories);

router.get("/products", getAllProducts);

router.get("/products/type", getProductsByType);

router.get("/products/featured", getFeaturedProducts);

router.get("/products/new-arrivals", getNewArrivalProducts);

export default router;
