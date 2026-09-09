import express from "express";
import { wrapRouter } from "../utils/asyncRouter.js";
import {
  addItemToCart,
  getUserCart,
  incrementCartItem,
  decrementCartItem,
  deleteCartItem,
} from "../controllers/cart.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
  addToCartSchema,
  cartItemSchema,
} from "../validation/cart.validation.js";

const router = wrapRouter(
  express.Router({ caseSensitive: true, strict: false })
);

// Add product to cart
router.post("/cart/add", validate(addToCartSchema), addItemToCart);

// Get current user's cart — no request body to validate.
router.get("/cart", getUserCart);

router.put("/cart/item/increment", validate(cartItemSchema), incrementCartItem);
router.put("/cart/item/decrement", validate(cartItemSchema), decrementCartItem);
router.delete("/cart/item/delete", validate(cartItemSchema), deleteCartItem);

export default router;
