import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Visit from "../models/visit.js";
import Order from "../models/order.js";
import Product from "../models/product.js";
import { getClientIp, resolveRequestLocation } from "../utils/geo.js";

const getToday = () => new Date().toISOString().slice(0, 10);

const hashFingerprint = (ip, ua) =>
  crypto.createHash("sha256").update(`${ip}||${ua}`).digest("hex");

const parseDevice = (ua) => {
  if (!ua) return { device: "Unknown", os: "Unknown", browser: "Unknown" };

  let device = "Desktop";
  if (/tablet|ipad|playbook|silk/i.test(ua)) device = "Tablet";
  else if (/mobile|iphone|ipod|android.*mobile|blackberry|opera mini|iemobile/i.test(ua)) device = "Mobile";

  let os = "Unknown";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/cros/i.test(ua)) os = "ChromeOS";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";

  // Social apps open links in their own browser, which says so in its name.
  let browser = "Unknown";
  if (/instagram/i.test(ua)) browser = "Instagram app";
  else if (/musical_ly|tiktok|bytedancewebview/i.test(ua)) browser = "TikTok app";
  else if (/fban|fbav|fb_iab/i.test(ua)) browser = "Facebook app";
  else if (/snapchat/i.test(ua)) browser = "Snapchat app";
  else if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";
  else if (/samsungbrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/chrome\/|crios\//i.test(ua) && !/chromium/i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/firefox\/|fxios\//i.test(ua)) browser = "Firefox";

  return { device, os, browser };
};

/** Where the visit came from: a social app, the site that linked here, or "Direct". */
const visitSource = (browser, ref) => {
  if (browser.endsWith(" app")) return browser.replace(/ app$/, "");
  const host = typeof ref === "string" ? ref.trim().toLowerCase().slice(0, 100) : "";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return "Direct";
  const site = host.replace(/^(www|m|l|lm|web)\./, "");
  if (/(^|\.)instagram\.com$/.test(site)) return "Instagram";
  if (/(^|\.)tiktok\.com$/.test(site)) return "TikTok";
  if (/(^|\.)facebook\.com$/.test(site)) return "Facebook";
  if (/(^|\.)google\./.test(site)) return "Google";
  return site;
};

// The website sends the page it opened, e.g. "/item/6650…" or "/products?category=Rings".
const MAX_PAGES_PER_DAY = 30;
const cleanPath = (raw) => {
  if (typeof raw !== "string") return null;
  const path = raw.trim().slice(0, 200);
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (/^\/admin(\/|\?|$)/i.test(path)) return null;
  return path;
};

/** The signed-in customer, if the request carries a valid login token. */
const signedInUserId = (req) => {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  try {
    const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    return mongoose.isValidObjectId(decoded?.user_id) ? String(decoded.user_id) : null;
  } catch {
    return null; // expired or invalid: counted as a guest
  }
};

/**
 * GET /track-visit?path=…&ref=… — called by the website on every page it
 * opens. The first page of the day creates the visitor's day (with their
 * approximate location, device and where they came from); later pages add
 * to it. A signed-in visitor's day is linked to their account.
 */
export const trackVisit = async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    const ua = req.headers["user-agent"] || "";
    const fingerprint = hashFingerprint(ip, ua);
    const date = getToday();
    const userId = signedInUserId(req);
    const path = cleanPath(req.query.path);
    const now = new Date();

    const update = {
      $inc: { views: 1 },
      $set: { last_seen: now, ...(userId && { user_id: userId }) },
      ...(path && { $push: { pages: { $each: [{ path, at: now }], $slice: -MAX_PAGES_PER_DAY } } }),
    };
    const seen = await Visit.updateOne({ fingerprint, date }, update);
    if (seen.matchedCount > 0) return res.status(200).json({ tracked: true });

    // First page today: find where they are (once a day; it can be slow).
    const { device, os, browser } = parseDevice(ua);
    let location = { country: "Unknown", governorate: "Unknown", city: "Unknown" };
    try {
      location = await resolveRequestLocation(req);
    } catch {
      // unknown location is fine
    }

    try {
      await Visit.create({
        fingerprint,
        date,
        user_id: userId,
        ...location,
        device,
        os,
        browser,
        source: visitSource(browser, req.query.ref),
        views: 1,
        last_seen: now,
        pages: path ? [{ path, at: now }] : [],
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      // Another page of the same visitor got there first: add to it instead.
      await Visit.updateOne({ fingerprint, date }, update);
    }

    res.status(200).json({ tracked: true });
  } catch (err) {
    next(err);
  }
};

export const getVisitStats = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const today = getToday();
    const dateFrom = from || today;
    const dateTo = to || today;

    const matchStage = { date: { $gte: dateFrom, $lte: dateTo } };

    const [daily, byCountry, byCity, byDevice, byBrowser, todayCountResult] = await Promise.all([
      Visit.aggregate([
        { $match: matchStage },
        { $group: { _id: "$date", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: "$_id", count: 1 } },
      ]),
      Visit.aggregate([
        { $match: matchStage },
        { $group: { _id: "$country", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
        { $project: { _id: 0, name: "$_id", count: 1 } },
      ]),
      Visit.aggregate([
        { $match: matchStage },
        { $group: { _id: { city: "$city", country: "$country" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
        { $project: { _id: 0, city: "$_id.city", country: "$_id.country", count: 1 } },
      ]),
      Visit.aggregate([
        { $match: matchStage },
        { $group: { _id: "$device", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, name: "$_id", count: 1 } },
      ]),
      Visit.aggregate([
        { $match: matchStage },
        { $group: { _id: "$browser", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, name: "$_id", count: 1 } },
      ]),
      Visit.countDocuments({ date: today }),
    ]);

    const totalRange = daily.reduce((sum, d) => sum + d.count, 0);

    res.status(200).json({
      today: todayCountResult,
      total: totalRange,
      daily,
      byCountry,
      byCity,
      byDevice,
      byBrowser,
    });
  } catch (err) {
    next(err);
  }
};

// ─── The visitors list (admin dashboard) ───

const VISITORS_PAGE_SIZE = 50;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PRODUCT_PAGE = /^\/item\/([a-f0-9]{24})(?:[/?#]|$)/i;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** "Product: The OG Drop", "Category: Rings", "Checkout", … for a page path. */
const pageLabel = (path, productNames) => {
  const product = PRODUCT_PAGE.exec(path);
  if (product) return `Product: ${productNames.get(product[1].toLowerCase()) ?? "(no longer in the shop)"}`;
  const [pathname, query = ""] = path.split("?");
  const p = pathname.replace(/\/+$/, "").toLowerCase() || "/";
  if (p === "/") return "Home";
  if (p === "/products") {
    const params = new URLSearchParams(query);
    const category = params.get("category") || params.get("type");
    return category ? `Category: ${titleCase(category)}` : "All products";
  }
  if (p === "/pay") return "Checkout";
  if (p === "/profile") return "Profile & orders";
  if (p === "/auth") return "Sign in";
  return pathname;
};

/**
 * GET /admin/dashboard/visitors?from=YYYY-MM-DD&to=YYYY-MM-DD&type=all|customers|guests&q=…&page=1
 *
 * Each visitor in the date range, most recently seen first: where they are
 * (approximately), their device, where they came from, the days and pages
 * they visited, and, for signed-in customers, who they are (email, and the
 * name, phone, delivery area and order count from their orders).
 */
export const getVisitors = async (req, res, next) => {
  try {
    const today = getToday();
    const from = DATE_PATTERN.test(req.query.from) ? req.query.from : today;
    const to = DATE_PATTERN.test(req.query.to) ? req.query.to : today;
    const page = Math.max(1, Math.min(1000, parseInt(req.query.page, 10) || 1));
    const type = ["customers", "guests"].includes(req.query.type) ? req.query.type : "all";
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";

    const typeMatch =
      type === "customers"
        ? [{ $match: { user_id: { $ne: null } } }]
        : type === "guests"
          ? [{ $match: { user_id: null } }]
          : [];
    const search = q ? new RegExp(escapeRegex(q), "i") : null;

    const [result] = await Visit.aggregate([
      { $match: { date: { $gte: from, $lte: to } } },
      { $sort: { date: 1, created_at: 1 } },
      {
        $group: {
          _id: "$fingerprint",
          user_id: { $max: "$user_id" },
          first_seen: { $min: "$created_at" },
          last_seen: { $max: { $ifNull: ["$last_seen", "$created_at"] } },
          days: { $sum: 1 },
          views: { $sum: { $ifNull: ["$views", 1] } },
          city: { $last: "$city" },
          governorate: { $last: "$governorate" },
          country: { $last: "$country" },
          device: { $last: "$device" },
          os: { $last: "$os" },
          browser: { $last: "$browser" },
          source: { $first: "$source" },
          pages: { $push: "$pages" },
        },
      },
      { $lookup: { from: "users", localField: "user_id", foreignField: "_id", as: "user" } },
      { $set: { user: { $arrayElemAt: ["$user", 0] } } },
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { "user.email": search },
                  { city: search },
                  { governorate: search },
                  { country: search },
                ],
              },
            },
          ]
        : []),
      { $sort: { last_seen: -1 } },
      {
        $facet: {
          all: [{ $count: "n" }],
          customers: [{ $match: { user_id: { $ne: null } } }, { $count: "n" }],
          matching: [...typeMatch, { $count: "n" }],
          rows: [
            ...typeMatch,
            { $skip: (page - 1) * VISITORS_PAGE_SIZE },
            { $limit: VISITORS_PAGE_SIZE },
            {
              $project: {
                "user.sale_email_log": 0,
                "user.birthday_promo_sent_year": 0,
                "user.password": 0,
                "user.__v": 0,
              },
            },
          ],
        },
      },
    ]).allowDiskUse(true);

    const rows = result?.rows ?? [];
    const count = (facet) => facet?.[0]?.n ?? 0;

    // The customers' orders: name, phone and delivery area from the latest.
    const userIds = rows.map((r) => r.user_id).filter(Boolean);
    const orderStats = userIds.length
      ? await Order.aggregate([
          { $match: { user_id: { $in: userIds } } },
          { $sort: { order_date: -1 } },
          {
            $group: {
              _id: "$user_id",
              orders: { $sum: 1 },
              spent: { $sum: "$total_amount" },
              last_order_at: { $first: "$order_date" },
              phone: { $first: "$phone_number" },
              city: { $first: "$city" },
              governorate: { $first: "$governorate" },
              names: { $push: { first: "$first_name", last: "$last_name" } },
            },
          },
        ])
      : [];
    const ordersByUser = new Map(orderStats.map((o) => [String(o._id), o]));

    // Product names for the product pages they opened.
    const pageLists = rows.map((r) => (r.pages || []).flat().filter((p) => p?.path));
    const productIds = [
      ...new Set(pageLists.flat().map((p) => PRODUCT_PAGE.exec(p.path)?.[1]?.toLowerCase()).filter(Boolean)),
    ];
    const products = productIds.length
      ? await Product.find({ _id: { $in: productIds } }, { name: 1 }).lean()
      : [];
    const productNames = new Map(products.map((p) => [String(p._id), p.name]));

    const visitors = rows.map((r, i) => {
      const orders = r.user_id ? ordersByUser.get(String(r.user_id)) : null;
      const named = orders?.names.find((n) => n.first || n.last);
      const user = r.user;
      return {
        visitor_id: String(r._id).slice(0, 8),
        location: { city: r.city, governorate: r.governorate || "Unknown", country: r.country },
        device: r.device,
        os: r.os || "Unknown",
        browser: r.browser,
        source: r.source || null,
        first_seen: r.first_seen,
        last_seen: r.last_seen,
        days: r.days,
        views: r.views,
        // Newest first, at most 30.
        pages: pageLists[i]
          .sort((a, b) => new Date(b.at) - new Date(a.at))
          .slice(0, MAX_PAGES_PER_DAY)
          .map((p) => ({ label: pageLabel(p.path, productNames), at: p.at })),
        customer: user
          ? {
              user_id: String(user._id),
              email: user.email,
              name: named ? [named.first, named.last].filter(Boolean).join(" ") : null,
              phone: orders?.phone ?? null,
              orders: orders?.orders ?? 0,
              spent: orders?.spent ?? 0,
              last_order_at: orders?.last_order_at ?? null,
              delivery_area: orders ? { city: orders.city, governorate: orders.governorate } : null,
              account_location: {
                city: user.city || "Unknown",
                governorate: user.governorate || "Unknown",
                country: user.country || "Unknown",
              },
              birthday: user.birthday ?? null,
              joined_at: user.created_at ?? null,
            }
          : null,
      };
    });

    const all = count(result?.all);
    const customers = count(result?.customers);
    res.status(200).json({
      from,
      to,
      page,
      page_size: VISITORS_PAGE_SIZE,
      total: count(result?.matching),
      summary: { visitors: all, customers, guests: all - customers },
      visitors,
    });
  } catch (err) {
    next(err);
  }
};
