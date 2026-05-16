// models/ProductImage.js
import mongoose from "mongoose";

const productImageSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    image_url: {
      type: String,
      required: true,
    },
    is_primary: {
      type: Boolean,
      default: false,
    },
    sort_order: {
      type: Number,
      default: 1,
    },
  },
  {
    collection: "product_images",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Ensure images are fetched in admin-defined order by default.
productImageSchema.index({ product_id: 1, sort_order: 1 });

const ProductImage = mongoose.model("ProductImage", productImageSchema);
export default ProductImage;
