// models/Product.js

import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 255,
    },
    description: {
      type: String,
    },
    price: {
      type: Number,
    },
    type: {
      type: String,
      required: true,
    },
    stock_quantity: {
      type: Number,
      default: 0,
    },
    is_new: {
      type: Boolean,
      default: false,
    },
    // The single variant attribute key this product uses (e.g. "size",
    // "color", "charm"). Drives the admin variant form and the frontend
    // variant picker. Lower-cased canonical; display label derived by title-casing.
    option_type: {
      type: String,
      default: null,
      set: (v) => (v ? String(v).trim().toLowerCase() : null),
    },
    sort_order: { type: Number, default: 1 },
    images: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ProductImage",
      }
    ],
    product_variants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ProductVariant",
      }
    ],
  },
  {
    collection: "products",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// A product is identified everywhere by (name, type) — edits, sort order,
// variant deletes, product deletes and its Cloud Storage folder all look it
// up that way — so two products may never share a name within a category.
// The controllers check first for a clear error message; this index is what
// makes it hold even for two requests at the same moment.
productSchema.index({ name: 1, type: 1 }, { unique: true });

const Product = mongoose.model("Product", productSchema);

// If the collection already holds duplicate (name, type) pairs, MongoDB
// refuses to build the index. Nothing breaks, but say so loudly so the
// duplicates get renamed.
Product.on("index", (err) => {
  if (err) {
    console.error(
      "❌ products unique (name, type) index was not built — rename duplicate products, then restart:",
      err.message
    );
  }
});

export default Product;
