import mongoose from "mongoose";
import Sale from "../models/sale.js";
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
});

/**
 * The body's fields as stored values, or `{ error }`. saleSchema has already
 * checked their shape; this checks what only makes sense together.
 */
const readSaleBody = (body, now) => {
  const starts_at = storeTimeToDate(body.starts_at);
  const ends_at = storeTimeToDate(body.ends_at);
  if (!starts_at) return { error: "The start date is not a valid date and time." };
  if (!ends_at) return { error: "The end date is not a valid date and time." };
  if (ends_at <= starts_at) return { error: "The sale must end after it starts." };
  if (ends_at <= now) return { error: "The end date must be in the future." };
  return {
    title: String(body.title).trim(),
    percent: Number(body.percent),
    starts_at,
    ends_at,
  };
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

    const fields = readSaleBody(req.body, now);
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
