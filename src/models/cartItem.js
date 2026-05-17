// models/CartItem.js
//
// A line in a user's cart. When it references a `variant_id`, the chosen
// option values are snapshotted into `attributes` so the cart UI can
// display them without an extra join, and so a later rename of the
// underlying variant attribute doesn't silently rewrite what the user
// is looking at.

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
    // Snapshot of variant attributes at the moment the item was added.
    attributes: {
      type: Map,
      of: String,
      default: () => new Map(),
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    // Optional free-text note (e.g. custom size for Hand Chains).
    notes: {
      type: String,
      default: null,
      maxlength: 500,
    },
  },
  {
    collection: "cart_items",
    timestamps: true, // recommended for future features (e.g., abandoned cart cleanup)
  }
);

const CartItem = mongoose.model("CartItem", cartItemSchema);

export default CartItem;
