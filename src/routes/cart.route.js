import express from "express";
import { wrapRouter } from "../utils/asyncRouter.js";
import {
  addItemToCart,
  getUserCart,
  incrementCartItem,
  decrementCartItem,
  deleteCartItem,
} from "../controllers/cart.controller.js";

const router = wrapRouter(
  express.Router({ caseSensitive: true, strict: false })
);

// Add product to cart
router.post("/cart/add", addItemToCart);

// Get current user's cart
router.get("/cart", getUserCart);

router.put("/cart/item/increment", incrementCartItem);
router.put("/cart/item/decrement", decrementCartItem);
router.delete("/cart/item/delete", deleteCartItem);

export default router;
