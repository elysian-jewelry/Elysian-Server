// services/categoryCache.service.js
//
// In-process cache for the set of valid product category names.
// Used by product create / update validation. TTL'd to bound cross-process
// staleness; explicitly invalidated after admin mutations.

import ProductCategory from "../models/productCategory.js";

const TTL_MS = 60 * 1000;

let cachedSet = null;
let cachedAt = 0;
let inflight = null;

const buildSet = async () => {
  const docs = await ProductCategory.find({ is_active: true }, { name: 1 }).lean();
  return new Set(docs.map((d) => String(d.name || "")));
};

export const getCategoryNameSet = async () => {
  const now = Date.now();
  if (cachedSet && now - cachedAt < TTL_MS) return cachedSet;
  if (!inflight) {
    inflight = buildSet()
      .then((set) => {
        cachedSet = set;
        cachedAt = Date.now();
        return set;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};

export const isValidCategory = async (name) => {
  if (!name || typeof name !== "string") return false;
  const set = await getCategoryNameSet();
  return set.has(name);
};

export const invalidateCategoryCache = () => {
  cachedSet = null;
  cachedAt = 0;
};
