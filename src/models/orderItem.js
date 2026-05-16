// models/OrderItem.js
//
// An immutable line on a placed order. The `attributes` field is a snapshot
// of the variant's options at the time of checkout — important because
// orders must keep displaying the original variant even if the product is
// later renamed, deleted, or its attribute keys are changed.

import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
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
    // Snapshot fields for resilience against product/variant deletion.
    product_name: { type: String, default: null },
    product_type: { type: String, default: null },
    product_image_url: { type: String, default: null },
    // Snapshot of the variant's attribute values at order time.
    attributes: {
      type: Map,
      of: String,
      default: () => new Map(),
    },
    quantity: {
      type: Number,
      required: true,
    },
    price: {
      type: mongoose.Types.Decimal128,
      required: true,
    },
  },
  {
    collection: "order_items",
    timestamps: false,
  }
);

const OrderItem = mongoose.model("OrderItem", orderItemSchema);

export default OrderItem;
