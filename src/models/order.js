// models/Order.js

import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    order_date: {
      type: Date,
      default: Date.now,
    },
    subtotal: {
      type: Number,
      required: true,
    },
    discount_percent: {
      type: Number,
      default: 0,
    },
    total_amount: {
      type: Number,
      required: true,
    },
    shipping_cost: {
      type: Number,
      default: 0.0,
    },
    address: {
      type: String,
      required: true,
    },
    apartment_no: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    governorate: {
      type: String,
      required: true,
    },
    phone_number: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Shipped", "Delivered", "Cancelled"],
      default: "Pending",
    },
  },
  {
    collection: "orders",
    timestamps: false,
  }
);

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

export default Order;
