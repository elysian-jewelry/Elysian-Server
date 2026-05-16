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
    // The list of variant attribute keys this product uses (e.g. ["size",
    // "color", "charm"]). Drives the admin variant form and the frontend
    // variant picker. Lower-cased canonical keys; display labels are
    // derived by title-casing.
    option_types: {
      type: [String],
      default: [],
      set: (arr) =>
        Array.isArray(arr)
          ? Array.from(
              new Set(
                arr
                  .map((s) => String(s || "").trim().toLowerCase())
                  .filter(Boolean)
              )
            )
          : [],
    },
    sort_order: { type: Number, default: 0 },
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

const Product = mongoose.model("Product", productSchema);

export default Product;
