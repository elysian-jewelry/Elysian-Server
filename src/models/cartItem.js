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

// One line per product/option in a cart. addItemToCart relies on this to add
// to an existing line atomically, so two quick adds of the same item end up
// on one line instead of two. (variant_id is null for products without
// variants; the index treats those nulls as equal, which is what we want.)
cartItemSchema.index({ cart_id: 1, product_id: 1, variant_id: 1 }, { unique: true });

const CartItem = mongoose.model("CartItem", cartItemSchema);

// If the collection already holds duplicate lines, MongoDB refuses to build
// the index. Nothing breaks (adds just aren't protected against duplicates),
// but say so loudly so the duplicates get merged.
CartItem.on("index", (err) => {
  if (err) {
    console.error(
      "❌ cart_items unique index was not built — merge duplicate cart lines, then restart:",
      err.message
    );
  }
});

export default CartItem;
