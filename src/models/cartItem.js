// models/CartItem.js

import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema(
  {
    cart_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cart",
      required: true,
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    variant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariant",
      default: null,
    },
    size: {
      type: String,
      default: null,
    },
     color: {
      type: String,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
  },
  {
    collection: "cart_items",
    timestamps: true, // recommended for future features (e.g., abandoned cart cleanup)
  }
);

const CartItem = mongoose.model("CartItem", cartItemSchema);

export default CartItem;
