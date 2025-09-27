// models/PromoCode.js

import mongoose from "mongoose";

const promoCodeSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    promo_code: {
      type: String,
      required: true,
      unique: true,
      maxlength: 50,
    },
    expiry_date: {
      type: Date,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
     is_public: {
      type: Boolean,
      default: false, // birthday codes default to private
    },
    used_by: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }
    ]
  },
  {
    collection: "promo_codes",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

const PromoCode = mongoose.model("PromoCode", promoCodeSchema);

export default PromoCode;
