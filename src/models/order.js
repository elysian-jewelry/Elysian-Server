// models/Order.js

import mongoose from "mongoose";
import { PAYMENT_METHODS } from "../config/payment.js";

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
    promo_code: {
      type: String,
      default: null,
    },
    total_amount: {
      type: Number,
      required: true,
    },
    shipping_cost: {
      type: Number,
      default: 0.0,
    },
    // The street line, e.g. "Sakleya Street".
    address: {
      type: String,
      required: true,
    },
    // building_no, floor_no, landmark and location are empty on orders
    // placed before checkout asked for them.
    building_no: {
      type: String,
      default: null,
    },
    floor_no: {
      type: String,
      default: null,
    },
    apartment_no: {
      type: String,
      required: true,
    },
    landmark: {
      type: String,
      default: null,
    },
    // Where the customer pinned the delivery on the checkout map.
    location: {
      type: new mongoose.Schema(
        {
          lat: { type: Number, required: true, min: -90, max: 90 },
          lng: { type: Number, required: true, min: -180, max: 180 },
        },
        { _id: false }
      ),
      default: undefined,
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
    // config/payment.js. Orders placed before checkout offered a choice have
    // no value stored and were all cash on delivery.
    payment_method: {
      type: String,
      enum: Object.values(PAYMENT_METHODS),
      default: PAYMENT_METHODS.CASH_ON_DELIVERY,
    },
    // The storewide sale (models/sale.js) running when the order was placed,
    // copied so the order keeps it however the sale is later edited.
    // `subtotal` is at sale prices; `original_subtotal` at regular prices.
    // Both are empty on orders placed outside a sale or before sales existed.
    sale: {
      type: new mongoose.Schema(
        {
          sale_id: { type: mongoose.Schema.Types.ObjectId, ref: "Sale" },
          title: { type: String, required: true },
          percent: { type: Number, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    original_subtotal: {
      type: Number,
      default: null,
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
