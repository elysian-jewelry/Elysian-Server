// models/Sale.js
//
// A storewide sale: one percentage off every product and option, from
// starts_at until ends_at. The admin controller refuses overlapping sales,
// so at any moment exactly one sale or none is running.
//
// Ending a sale early moves ends_at to "now" instead of deleting it, so past
// sales stay listed for the admin. Orders keep their own copy of the sale's
// title and percentage, so editing or removing a sale never changes an order.
//
// Regular prices are never stored or changed here: they stay on the product
// and its options. `price_overrides` only holds the admin's own sale price
// for chosen items, used instead of the percentage while this sale runs.

import mongoose from "mongoose";

const priceOverrideSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    // The option's id for a product sold by options; null otherwise.
    variant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariant",
      default: null,
    },
    // The sale price for this item. Checkout never charges more than the
    // item's regular price, even if that price is lowered after this is set.
    price: {
      type: Number,
      required: true,
      min: 0.01,
    },
  },
  { _id: false }
);

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
    price_overrides: {
      type: [priceOverrideSchema],
      default: [],
    },
    // The last time this sale was emailed to every customer ("Email
    // customers" on the admin Sales page). Test sends aren't recorded.
    announcement: {
      type: new mongoose.Schema(
        {
          sent_at: { type: Date, required: true },
          total: { type: Number, default: 0 },
          sent: { type: Number, default: 0 },
          failed: { type: Number, default: 0 },
          // Why it stopped early, or null if every email was tried.
          stopped: { type: String, default: null },
        },
        { _id: false }
      ),
      default: null,
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
