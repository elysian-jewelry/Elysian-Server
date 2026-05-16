// models/Admin.js
//
// Stores the set of email addresses that are allowed to access /admin/* routes.
// The `email` field is normalized to lowercase before saving, and a unique
// index enforces no duplicates regardless of letter case.

import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: "Invalid email address.",
      },
    },
    // Audit trail: who added this admin (email of the operator).
    added_by: { type: String, default: "bootstrap" },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "admins",
  }
);

const Admin = mongoose.models.Admin || mongoose.model("Admin", adminSchema);

export default Admin;
