// models/User.js

import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    birthday: {
      type: Date,
      default: null,
    },
    // Calendar year (Africa/Cairo) of the last birthday promo code issued to
    // this user. One code per birthday-year: the grant claims this field
    // atomically before it creates a code, so it can never send twice.
    birthday_promo_sent_year: {
      type: Number,
      default: null,
    },
    country: {
      type: String,
      default: "Unknown",
      index: true,
    },
    governorate: {
      type: String,
      default: "Unknown",
      index: true,
    },
    city: {
      type: String,
      default: "Unknown",
      index: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "users", // optional, to match the original table name
  }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
