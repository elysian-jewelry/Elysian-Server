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
      enum: [
        "Earrings",
        "Necklaces",
        "Bracelets",
        "Hand Chains",
        "Back Chains",
        "Body Chains",
        "Waist Chains",
        "Sets",
        "Rings",
        "Bags"
      ],
    },
    stock_quantity: {
      type: Number,
      default: 0,
    },
    is_new: {
      type: Boolean,
      default: false,
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
