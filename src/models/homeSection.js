// models/HomeSection.js
//
// Singleton document that stores the admin-curated product lists shown on
// the home page. There is exactly ONE document in this collection identified
// by `key: "home"`. Reads and writes use upsert so the document is created
// lazily on first access.

import mongoose from "mongoose";

const homeSectionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "home",
    },
    featured: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 5,
        message: "featured can contain at most 5 products.",
      },
    },
    new_arrivals: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 5,
        message: "new_arrivals can contain at most 5 products.",
      },
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "home_sections",
  }
);

const HomeSection =
  mongoose.models.HomeSection || mongoose.model("HomeSection", homeSectionSchema);

export default HomeSection;
