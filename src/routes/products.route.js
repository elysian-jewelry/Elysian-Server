import express from "express";
import { wrapRouter } from "../utils/asyncRouter.js";
import { getAllProducts, getProductsByType, getFeaturedProducts, getNewArrivalProducts, getCategories } from "../controllers/product.controller.js";
import { getCurrentSale } from "../controllers/sale.controller.js";

const router = wrapRouter(
  express.Router({ caseSensitive: true, strict: false })
);

router.get("/products/categories", getCategories);

router.get("/products", getAllProducts);

router.get("/products/type", getProductsByType);

router.get("/products/featured", getFeaturedProducts);

router.get("/products/new-arrivals", getNewArrivalProducts);

// The storewide sale running now (or null), for the site banner. Public
// because it sits under /products (auth.middleware.js).
router.get("/products/sale", getCurrentSale);

export default router;
