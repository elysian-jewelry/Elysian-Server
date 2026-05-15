import mongoose from "mongoose";

const visitSchema = new mongoose.Schema(
  {
    fingerprint: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      default: "Unknown",
    },
    country: {
      type: String,
      default: "Unknown",
    },
    device: {
      type: String,
      enum: ["Desktop", "Mobile", "Tablet", "Unknown"],
      default: "Unknown",
    },
    browser: {
      type: String,
      default: "Unknown",
    },
  },
  {
    collection: "visits",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

visitSchema.index({ fingerprint: 1, date: 1 }, { unique: true });
visitSchema.index({ date: 1 });

const Visit = mongoose.model("Visit", visitSchema);

export default Visit;
