// models/ProductVariant.js
//
// A variant of a product is identified by its `attributes` map — a flexible
// key/value bag of option values (e.g. {color: "Gold"}).
// Each product declares a single `option_type` (e.g. "color", "size", "charm")
// so the admin UI and the cart can drive themselves dynamically.
//
// Uniqueness within a product is enforced via `attributes_key`, a stable
// canonical string ("color=gold|size=m") computed by the pre-save hook from
// the attributes map. This lets us index the variant uniquely regardless of
// which option keys the product happens to use.

import mongoose from "mongoose";

/**
 * Canonicalize the attributes map into a stable string:
 *   - keys & values trimmed and lowercased
 *   - keys sorted alphabetically
 *   - empty values dropped
 * The result is what we put in the unique index.
 */
export const buildAttributesKey = (attrs) => {
  if (!attrs) return "";
  // Mongoose Map and plain object both support entries()
  const entries =
    typeof attrs.entries === "function" && !Array.isArray(attrs)
      ? Array.from(attrs.entries())
      : Object.entries(attrs);

  return entries
    .map(([k, v]) => [
      String(k || "").trim().toLowerCase(),
      String(v || "").trim().toLowerCase(),
    ])
    .filter(([k, v]) => k && v)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
};

const productVariantSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    // The option value for this variant. The key MUST match the parent
    // product's `option_type`. Stored as a Map for flexibility.
    attributes: {
      type: Map,
      of: String,
      default: () => new Map(),
    },
    // Canonical key derived from attributes. Auto-managed by the pre-save
    // hook below. Used for the per-product unique index.
    attributes_key: {
      type: String,
      required: true,
      default: "",
    },
    description: {
      type: String,
      maxlength: 500,
      default: "",
    },
    price: {
      type: Number,
      required: true,
    },
    stock_quantity: {
      type: Number,
      default: 0,
    },
  },
  {
    collection: "product_variants",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Keep `attributes_key` in sync with `attributes` on every save and
// findOneAndUpdate.
productVariantSchema.pre("save", function (next) {
  this.attributes_key = buildAttributesKey(this.attributes);
  next();
});

productVariantSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  // Pull the candidate attributes from either $set or the top-level update.
  const setBlock = update.$set || update;
  if (setBlock.attributes) {
    setBlock.attributes_key = buildAttributesKey(setBlock.attributes);
    if (update.$set) update.$set = setBlock;
    else this.setUpdate(setBlock);
  }
  next();
});

// One unique variant per (product, attribute-fingerprint).
productVariantSchema.index(
  { product_id: 1, attributes_key: 1 },
  { unique: true }
);

const ProductVariant =
  mongoose.models.ProductVariant ||
  mongoose.model("ProductVariant", productVariantSchema);

export default ProductVariant;
