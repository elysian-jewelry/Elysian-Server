// services/sale.service.js
//
// Which storewide sale (models/sale.js) is running right now.
//
// Every product list, cart and checkout asks, so the sales that haven't
// ended yet are kept in memory instead of costing a database round trip per
// request. Whether one of them is running is still decided against the
// clock on every call, so a sale starts and ends at its exact minute however
// old the copy is. Only an admin change makes the copy stale, and the admin
// controller drops it at once (invalidateSaleCache); the refresh interval
// covers a second server instance, should one ever run.

import Sale from "../models/sale.js";
import { salePriceOf } from "../utils/pricing.js";

const REFRESH_MS = 60 * 1000;
let cached = null; // { sales, loadedAt }

export const invalidateSaleCache = () => {
  cached = null;
};

const salesNotEnded = async () => {
  if (cached && Date.now() - cached.loadedAt < REFRESH_MS) return cached.sales;
  const sales = await Sale.find({ ends_at: { $gt: new Date() } })
    .sort({ starts_at: 1 })
    .lean();
  cached = { sales, loadedAt: Date.now() };
  return sales;
};

/** The sale running at `now`, or null. */
export const getActiveSale = async (now = new Date()) => {
  const sales = await salesNotEnded();
  return sales.find((s) => s.starts_at <= now && now < s.ends_at) || null;
};

/**
 * The sale as the shop's pages see it, or null. `version` changes with every
 * admin edit (percentage, dates, custom prices), so checkout can tell when
 * the prices a customer is looking at have changed under them.
 */
export const publicSale = (sale) =>
  sale
    ? {
        sale_id: String(sale._id),
        title: sale.title,
        percent: sale.percent,
        starts_at: sale.starts_at,
        ends_at: sale.ends_at,
        version: new Date(sale.updated_at ?? sale.created_at ?? 0).getTime(),
      }
    : null;

/**
 * `sale_price` for a product or option on the wire: the price during the
 * sale (the admin's own price for it, or the percentage), or null when no
 * sale is running or it doesn't lower this price.
 */
export const salePriceField = (price, sale, productId = null, variantId = null) => {
  const discounted = salePriceOf(price, sale, productId, variantId);
  return sale && discounted < price ? discounted : null;
};
