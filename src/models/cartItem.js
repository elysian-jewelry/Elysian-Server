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

// One line per product/option/note in a cart. addItemToCart relies on this to
// add to an existing line atomically, so two quick adds of the same item end
// up on one line instead of two. The note is part of the key so the same
// custom-size option in two different sizes stays on two lines. (variant_id
// and notes are null when unused; the index treats those nulls as equal,
// which is what we want.)
cartItemSchema.index(
  { cart_id: 1, product_id: 1, variant_id: 1, notes: 1 },
  { unique: true }
);

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

// The key used to be product/option only. MongoDB keeps an index until it is
// dropped, and that one would refuse a second size of the same custom option,
// so drop it once the new index is built. Every later start finds nothing to
// drop, which is fine.
const OLD_LINE_INDEX = "cart_id_1_product_id_1_variant_id_1";
CartItem.init()
  .catch(() => {}) // a failed build is already reported by the listener above
  .then(() => CartItem.collection.dropIndex(OLD_LINE_INDEX))
  .then(() => console.log(`✅ Dropped old cart_items index ${OLD_LINE_INDEX}`))
  .catch((err) => {
    // 27 IndexNotFound / 26 NamespaceNotFound: already gone, nothing to do.
    if (err?.code === 27 || err?.code === 26) return;
    console.error(`❌ Could not drop old cart_items index ${OLD_LINE_INDEX}:`, err.message);
  });

export default CartItem;
