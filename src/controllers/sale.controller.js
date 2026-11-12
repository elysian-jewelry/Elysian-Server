import mongoose from "mongoose";
import Sale from "../models/sale.js";
import Product from "../models/product.js";
import { applySale, isValidPrice, toPiastres } from "../utils/pricing.js";
import { getActiveSale, invalidateSaleCache, publicSale } from "../services/sale.service.js";
import { storeTimeToDate, dateToStoreTime } from "../utils/storeTime.js";
import { STORE_TIMEZONE } from "../config/store.js";

/** "11 Nov 2026, 11:59 pm" in Cairo, for messages to the admin. */
const formatStoreTime = (date) =>
  new Date(date).toLocaleString("en-GB", {
    timeZone: STORE_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const statusOf = (sale, now) =>
  now < sale.starts_at ? "scheduled" : now < sale.ends_at ? "active" : "ended";

/** A sale as the admin page sees it: instants plus Cairo field values. */
const adminView = (sale, now = new Date()) => ({
  ...publicSale(sale),
  starts_at_local: dateToStoreTime(sale.starts_at),
  ends_at_local: dateToStoreTime(sale.ends_at),
  status: statusOf(sale, now),
  custom_prices: (sale.price_overrides || []).length,
});

/**
 * The body's fields as stored values, or `{ error }`. saleSchema has already
 * checked their shape; this checks what only makes sense together.
 * `existing` is the sale being edited (null when creating one).
 */
const readSaleBody = (body, now, existing = null) => {
  const starts_at = storeTimeToDate(body.starts_at);
  const ends_at = storeTimeToDate(body.ends_at);
  if (!starts_at) return { error: "The start date is not a valid date and time." };
  if (!ends_at) return { error: "The end date is not a valid date and time." };

  const running = existing && statusOf(existing, now) === "active";
  if (running) {
    // It has already started; when it started stays a fact.
    if (body.starts_at !== dateToStoreTime(existing.starts_at)) {
      return { error: "This sale is already running, so its start can't be changed." };
    }
  } else if (body.starts_at.slice(0, 10) < dateToStoreTime(now).slice(0, 10)) {
    // Compared as Cairo calendar dates ("YYYY-MM-DD" text sorts by date).
    return { error: "The start date must be today or later." };
  }

  if (ends_at <= starts_at) return { error: "The end date must be after the start date." };
  if (ends_at <= now) return { error: "The end date must be in the future." };
  return {
    title: String(body.title).trim(),
    percent: Number(body.percent),
    starts_at: running ? existing.starts_at : starts_at,
    ends_at,
  };
};

/** "Size: Custom" for an option's attributes, for the admin price list. */
const optionLabel = (attributes) => {
  const entries =
    attributes instanceof Map ? [...attributes.entries()] : Object.entries(attributes || {});
  return (
    entries
      .filter(([, v]) => v != null && String(v).trim())
      .map(([k, v]) => `${k.charAt(0).toUpperCase()}${k.slice(1)}: ${v}`)
      .join(", ") || null
  );
};

/** Only one sale may run at a time: the sale this one would overlap, if any. */
const findOverlap = (starts_at, ends_at, exceptId = null) =>
  Sale.findOne({
    ...(exceptId && { _id: { $ne: exceptId } }),
    starts_at: { $lt: ends_at },
    ends_at: { $gt: starts_at },
  }).lean();

const overlapMessage = (other) =>
  `These dates overlap the "${other.title}" sale (${formatStoreTime(other.starts_at)} – ` +
  `${formatStoreTime(other.ends_at)}). Only one sale can run at a time.`;

const findSaleOr404 = async (req, res) => {
  const { id } = req.params;
  const sale = mongoose.isValidObjectId(id) ? await Sale.findById(id) : null;
  if (!sale) res.status(404).json({ message: "Sale not found." });
  return sale;
};

// ─── Public ───

/**
 * GET /products/sale — the sale running now, or null. `now` is the server's
 * clock, so the banner's countdown can correct for a device clock that's off.
 */
export const getCurrentSale = async (req, res, next) => {
  try {
    const sale = await getActiveSale();
    return res.status(200).json({ sale: publicSale(sale), now: new Date() });
  } catch (error) {
    return next(error);
  }
};

// ─── Admin ───

/** GET /admin/sales — every sale, newest start first. */
export const listSales = async (req, res, next) => {
  try {
    const now = new Date();
    const sales = await Sale.find({}).sort({ starts_at: -1 }).lean();
    return res.status(200).json({
      sales: sales.map((s) => adminView(s, now)),
      timezone: STORE_TIMEZONE,
    });
  } catch (error) {
    return next(error);
  }
};

/** POST /admin/sales */
export const createSale = async (req, res, next) => {
  try {
    const now = new Date();
    const fields = readSaleBody(req.body, now);
    if (fields.error) return res.status(400).json({ message: fields.error });

    const clash = await findOverlap(fields.starts_at, fields.ends_at);
    if (clash) return res.status(409).json({ message: overlapMessage(clash) });

    const sale = await Sale.create(fields);
    invalidateSaleCache();
    return res.status(201).json({
      message: `"${sale.title}" has been scheduled.`,
      sale: adminView(sale.toObject(), now),
    });
  } catch (error) {
    return next(error);
  }
};

/** PUT /admin/sales/:id — a scheduled or running sale. */
export const updateSale = async (req, res, next) => {
  try {
    const sale = await findSaleOr404(req, res);
    if (!sale) return;

    const now = new Date();
    if (statusOf(sale, now) === "ended") {
      return res.status(409).json({
        message: "This sale has already ended and can no longer be edited.",
      });
    }

    const fields = readSaleBody(req.body, now, sale);
    if (fields.error) return res.status(400).json({ message: fields.error });

    const clash = await findOverlap(fields.starts_at, fields.ends_at, sale._id);
    if (clash) return res.status(409).json({ message: overlapMessage(clash) });

    sale.set(fields);
    await sale.save();
    invalidateSaleCache();
    return res.status(200).json({
      message: `"${sale.title}" has been updated.`,
      sale: adminView(sale.toObject(), now),
    });
  } catch (error) {
    return next(error);
  }
};

/** POST /admin/sales/:id/end — stops a running sale now; it stays listed. */
export const endSale = async (req, res, next) => {
  try {
    const sale = await findSaleOr404(req, res);
    if (!sale) return;

    const now = new Date();
    const status = statusOf(sale, now);
    if (status !== "active") {
      return res.status(409).json({
        message:
          status === "scheduled"
            ? "This sale hasn't started yet. Delete it instead."
            : "This sale has already ended.",
      });
    }

    sale.ends_at = now;
    await sale.save();
    invalidateSaleCache();
    return res.status(200).json({
      message: `"${sale.title}" has ended. Prices are back to normal.`,
      sale: adminView(sale.toObject(), now),
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * The sale whose prices the Products page edits: the one running now, or
 * else the next one scheduled (so prices can be set ahead). null if neither.
 */
const findPricingSale = async (now = new Date()) =>
  (await Sale.findOne({ starts_at: { $lte: now }, ends_at: { $gt: now } })) ||
  (await Sale.findOne({ starts_at: { $gt: now } }).sort({ starts_at: 1 }));

/**
 * GET /admin/sales/pricing — for the Products page: the sale being priced
 * (running, or else the next scheduled; null if neither) and, for every
 * product and option, its regular price (read from the product, never
 * stored in the sale), the price the sale's percentage gives, and its own
 * sale price if the admin set one.
 */
export const getSalePricing = async (req, res, next) => {
  try {
    const sale = await findPricingSale();
    if (!sale) return res.status(200).json({ sale: null, items: [] });
    const plainSale = sale.toObject();

    const products = await Product.find({})
      .select("name type price product_variants")
      .populate({ path: "product_variants", select: "attributes price" })
      .sort({ type: 1, name: 1 })
      .lean();

    const custom = new Map(
      plainSale.price_overrides.map((o) => [`${o.product_id}:${o.variant_id ?? ""}`, o.price])
    );
    const row = (product, variant) => {
      const regular = variant ? variant.price : product.price;
      if (!isValidPrice(regular)) return null; // can't be sold, so nothing to price
      return {
        product_id: String(product._id),
        variant_id: variant ? String(variant._id) : null,
        name: product.name,
        type: product.type,
        option: variant ? optionLabel(variant.attributes) : null,
        regular_price: regular,
        percent_price: applySale(regular, plainSale),
        custom_price: custom.get(`${product._id}:${variant ? variant._id : ""}`) ?? null,
      };
    };

    const items = products
      .flatMap((p) =>
        p.product_variants?.length ? p.product_variants.map((v) => row(p, v)) : [row(p, null)]
      )
      .filter(Boolean);

    return res.status(200).json({ sale: adminView(plainSale), items });
  } catch (error) {
    return next(error);
  }
};

/**
 * PUT /admin/sales/:id/product-prices — one product's own sale prices, from
 * the Products page. `prices` has the product (or each of its options) with
 * a sale price, or null to use the sale's percentage; it replaces that
 * product's custom prices and leaves every other product's alone. Only the
 * sale record is written: no regular price is ever changed here.
 */
export const updateProductSalePrices = async (req, res, next) => {
  try {
    const sale = await findSaleOr404(req, res);
    if (!sale) return;
    if (statusOf(sale, new Date()) === "ended") {
      return res.status(409).json({
        message: "This sale has already ended, so its prices can no longer be changed.",
      });
    }

    const product = await Product.findById(req.body.product_id)
      .select("name price product_variants")
      .populate({ path: "product_variants", select: "attributes price" })
      .lean();
    if (!product) return res.status(404).json({ message: "Product not found." });
    const variants = product.product_variants || [];
    const stale = "This product's options have changed. Reload the page and try again.";

    const entries = [];
    const seen = new Set();
    for (const e of req.body.prices) {
      const variantId = e.variant_id ? String(e.variant_id) : null;
      if (seen.has(variantId ?? "")) {
        return res.status(400).json({ message: "Each option can have only one sale price." });
      }
      seen.add(variantId ?? "");

      const variant = variantId ? variants.find((v) => String(v._id) === variantId) : null;
      if (variants.length ? !variant : variantId) return res.status(400).json({ message: stale });
      if (e.price == null) continue; // uses the sale's percentage

      // Checked against the item's regular price as it is now.
      const regular = variant ? variant.price : product.price;
      const label = variant
        ? `${product.name} (${optionLabel(variant.attributes) ?? "option"})`
        : product.name;
      if (!isValidPrice(regular)) {
        return res.status(400).json({
          message: `"${label}" has no regular price, so it can't have a sale price.`,
        });
      }
      if (toPiastres(e.price) > toPiastres(regular)) {
        return res.status(400).json({
          message: `"${label}": the sale price (${e.price} EGP) can't be higher than its regular price (${regular} EGP).`,
        });
      }
      entries.push({ product_id: product._id, variant_id: variant ? variant._id : null, price: e.price });
    }

    sale.price_overrides = [
      ...sale.price_overrides.filter((o) => String(o.product_id) !== String(product._id)),
      ...entries,
    ];
    await sale.save();
    invalidateSaleCache();

    const n = entries.length;
    return res.status(200).json({
      message:
        n === 0
          ? `"${product.name}" uses the ${sale.percent}% discount in "${sale.title}".`
          : `Saved the sale price${n === 1 ? "" : "s"} of "${product.name}" in "${sale.title}".`,
      sale: adminView(sale.toObject()),
    });
  } catch (error) {
    return next(error);
  }
};

/** DELETE /admin/sales/:id — only a sale that hasn't started. */
export const deleteSale = async (req, res, next) => {
  try {
    const sale = await findSaleOr404(req, res);
    if (!sale) return;

    if (statusOf(sale, new Date()) !== "scheduled") {
      return res.status(409).json({
        message:
          "A sale that has started can't be deleted; it stays in the list as a record. Use End now to stop a running sale.",
      });
    }

    await sale.deleteOne();
    invalidateSaleCache();
    return res.status(200).json({ message: `"${sale.title}" has been deleted.` });
  } catch (error) {
    return next(error);
  }
};
