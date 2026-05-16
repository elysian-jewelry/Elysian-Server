// models/ProductCategory.js
//
// Admin-managed list of product types. The `Product.type` field stores the
// canonical name of one of these categories. We do NOT use a Mongoose enum
// here because enums must be static at schema-definition time — admins need
// to add/remove categories at runtime. Validation lives in the product
// create/update controllers (against this collection).

import mongoose from "mongoose";

const productCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 64,
      validate: {
        validator: (v) => typeof v === "string" && v.trim().length > 0,
        message: "name must be a non-empty string.",
      },
    },
    // Display ordering — lower comes first. Defaults to created_at otherwise.
    sort_order: {
      type: Number,
      default: 0,
    },
    // Soft-disable a category without deleting it (e.g. seasonal).
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "product_categories",
  }
);

const ProductCategory =
  mongoose.models.ProductCategory ||
  mongoose.model("ProductCategory", productCategorySchema);

export default ProductCategory;
