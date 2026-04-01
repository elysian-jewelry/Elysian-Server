// models/ProductVariant.js

import mongoose from "mongoose";

const productVariantSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    size: {
      type: String,
      maxlength: 50,
    },
    color: {
      type: String,
      maxlength: 50,
    },
    price: {
      type: Number,
      required: true,
    },
    stock_quantity: {
      type: Number,
      default: 0,
    },
  },
  {
    collection: "product_variants",
    timestamps: false,
  }
);

productVariantSchema.index(
  { product_id: 1, size: 1, color: 1 },
  { unique: true }
);

const ProductVariant = mongoose.models.ProductVariant || mongoose.model("ProductVariant", productVariantSchema);

export default ProductVariant;
