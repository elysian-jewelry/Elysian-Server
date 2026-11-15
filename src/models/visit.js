import mongoose from "mongoose";

// One document per visitor per day. A visitor is a browser on a connection:
// `fingerprint` is a one-way hash of the IP address and browser, so the IP
// itself is never stored. When the visitor is signed in, `user_id` links the
// day's visit to their account.
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
    // The signed-in customer, if they were signed in at any point that day.
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Approximate: from the internet connection, not the device's GPS.
    city: {
      type: String,
      default: "Unknown",
    },
    governorate: {
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
    os: {
      type: String,
      default: "Unknown",
    },
    browser: {
      type: String,
      default: "Unknown",
    },
    // Where the first page of the day came from: "Instagram", "TikTok",
    // "google.com", … or "Direct".
    source: {
      type: String,
      default: null,
    },
    // Pages opened that day (each counted), and the last of them.
    views: {
      type: Number,
      default: 1,
    },
    last_seen: {
      type: Date,
      default: Date.now,
    },
    // The latest pages opened that day, oldest first (at most 30).
    pages: {
      type: [
        new mongoose.Schema(
          {
            path: { type: String, required: true },
            at: { type: Date, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
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
