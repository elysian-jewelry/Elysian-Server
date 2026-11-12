// models/Sale.js
//
// A storewide sale: one percentage off every product and option, from
// starts_at until ends_at. The admin controller refuses overlapping sales,
// so at any moment exactly one sale or none is running.
//
// Ending a sale early moves ends_at to "now" instead of deleting it, so past
// sales stay listed for the admin. Orders keep their own copy of the sale's
// title and percentage, so editing or removing a sale never changes an order.

import mongoose from "mongoose";

const saleSchema = new mongoose.Schema(
  {
    // Shown to customers, e.g. "11.11 Sale" or "Valentine's Sale".
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    // Whole percent off, e.g. 20.
    percent: {
      type: Number,
      required: true,
      min: 1,
      max: 90,
      validate: {
        validator: Number.isInteger,
        message: "percent must be a whole number",
      },
    },
    starts_at: {
      type: Date,
      required: true,
    },
    ends_at: {
      type: Date,
      required: true,
    },
  },
  {
    collection: "sales",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Pricing looks up the sales that haven't ended yet.
saleSchema.index({ ends_at: 1 });

const Sale = mongoose.models.Sale || mongoose.model("Sale", saleSchema);

export default Sale;
