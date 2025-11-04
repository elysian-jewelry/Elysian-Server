// models/GovOrderRate.js
import mongoose from "mongoose";

const govOrderRateSchema = new mongoose.Schema(
  {
    _id: { type: Number, required: true },   // <-- numeric id you control
    name: { type: String, required: true, unique: true, trim: true },
    cost: { type: Number, required: true, min: 0 },
  },
  { collection: "gov_order_rates", timestamps: true }
);

// ❌ No plugin here
const GovOrderRate = mongoose.model("GovOrderRate", govOrderRateSchema);
export default GovOrderRate;
