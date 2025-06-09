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
  },
  {
    collection: "product_images",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

const ProductImage = mongoose.model("ProductImage", productImageSchema);
export default ProductImage;
