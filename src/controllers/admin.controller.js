import mongoose from "mongoose";
import Product from "../models/product.js";
import User from "../models/user.js";
import Order from "../models/order.js";
import OrderItem from "../models/orderItem.js";
import ProductVariant from "../models/productVariant.js";
import PromoCode from "../models/promoCode.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import ProductImage from "../models/productImage.js";
import Cart from "../models/cart.js";
import CartItem from "../models/cartItem.js";
import GovOrderRate from "../models/govOrderRate.js";
import HomeSection from "../models/homeSection.js";
import Admin from "../models/admin.js";
import ProductCategory from "../models/productCategory.js";
import { buildAttributesKey } from "../models/productVariant.js";
import { invalidateAdminCache } from "../services/adminCache.service.js";
import {
  getCategoryNameSet,
  invalidateCategoryCache,
  isValidCategory,
} from "../services/categoryCache.service.js";
import {
  uploadImageBufferToGcs,
  deleteObjectsByPublicUrls,
  deleteAllObjectsInBucket,
  deleteAllGcsObjectsUnderProductPrefix,
  renameGcsProductFolder,
} from "../services/gcsImageUpload.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Where images live (default: src/images)
const IMAGES_ROOT =
  process.env.IMAGES_DIR_ABS || path.join(__dirname, "..", "images");

// Public base url (default to your prod API)
const BASE_URL = (
  process.env.PUBLIC_BASE_URL || "https://elysian-api.oa.r.appspot.com"
).replace(/\/$/, "");

// Allowed file extensions
const ALLOWED = new Set([".webp", ".jpg", ".jpeg", ".png", ".gif"]);

// Product categories are now managed in the `product_categories` collection.
// The image-sync routines load the set lazily through `getCategoryNameSet()`.

// Helpers
function urlJoinEncoded(...parts) {
  return parts
    .filter(Boolean)
    .map((p) => p.split("/").map(encodeURIComponent).join("/"))
    .join("/")
    .replace(/\/{2,}/g, "/");
}
const looksPrimary = (f) =>
  ["img_1", "main", "cover", "primary"].some((k) =>
    f.toLowerCase().includes(k)
  );

function isValidHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Pick primary image index from URL list (filename hints), else 0 */
function primaryImageIndexFromUrls(urls) {
  let idx = urls.findIndex((url) => {
    try {
      return looksPrimary(path.basename(new URL(url).pathname));
    } catch {
      return false;
    }
  });
  return idx >= 0 ? idx : 0;
}

function normalizeRemoveImageIds(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) {
    return value.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const arr = JSON.parse(value);
      return Array.isArray(arr)
        ? arr.filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function resyncProductImagePrimaryAndRefs(productId) {
  const imgs = await ProductImage.find({ product_id: productId })
    .sort({ created_at: 1 })
    .lean();
  if (!imgs.length) {
    await Product.findByIdAndUpdate(productId, { $set: { images: [] } });
    return;
  }
  const urls = imgs.map((i) => String(i.image_url || "").trim());
  const primaryIdx = primaryImageIndexFromUrls(urls);
  await Promise.all(
    imgs.map((img, idx) =>
      ProductImage.updateOne(
        { _id: img._id },
        { $set: { is_primary: idx === primaryIdx } }
      )
    )
  );
  await Product.findByIdAndUpdate(productId, {
    $set: { images: imgs.map((i) => i._id) },
  });
}

function parsePositiveInt(value, fieldLabel) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return {
      error: `${fieldLabel} must be a positive integer.`,
    };
  }
  return { value: n };
}

function parseNonNegativeCost(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return { error: "cost must be a finite number >= 0." };
  }
  return { value: n };
}

/** POST /admin/delivery-rates/governorates — create (single indexed write). */
export const createGovOrderRate = async (req, res) => {
  const idResult = parsePositiveInt(req.body.id, "id");
  if (idResult.error) {
    return res.status(400).json({ message: idResult.error });
  }

  const { name, cost } = req.body;
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "name must be a non-empty string." });
  }

  const costResult = parseNonNegativeCost(cost);
  if (costResult.error) {
    return res.status(400).json({ message: costResult.error });
  }

  try {
    const doc = await GovOrderRate.create({
      _id: idResult.value,
      name: name.trim(),
      cost: costResult.value,
    });

    return res.status(201).json({
      message: "Governorate rate created.",
      governorate: { id: doc._id, name: doc.name, cost: doc.cost },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: "A governorate with this id or name already exists.",
        keyValue: err.keyValue,
      });
    }
    console.error("createGovOrderRate:", err);
    return res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

/** PUT /admin/delivery-rates/governorates/:id — partial update by primary key. */
export const updateGovOrderRate = async (req, res) => {
  const idResult = parsePositiveInt(req.params.id, "id");
  if (idResult.error) {
    return res.status(400).json({ message: idResult.error });
  }

  const { name, cost } = req.body;
  const hasName = name !== undefined;
  const hasCost = cost !== undefined;

  if (!hasName && !hasCost) {
    return res.status(400).json({
      message: "Provide at least one of: name, cost.",
    });
  }

  const $set = {};
  if (hasName) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "name must be a non-empty string." });
    }
    $set.name = name.trim();
  }
  if (hasCost) {
    const costResult = parseNonNegativeCost(cost);
    if (costResult.error) {
      return res.status(400).json({ message: costResult.error });
    }
    $set.cost = costResult.value;
  }

  try {
    const doc = await GovOrderRate.findByIdAndUpdate(
      idResult.value,
      { $set },
      { new: true, runValidators: true }
    ).lean();

    if (!doc) {
      return res.status(404).json({ message: "Governorate rate not found." });
    }

    return res.status(200).json({
      message: "Governorate rate updated.",
      governorate: { id: doc._id, name: doc.name, cost: doc.cost },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: "name already exists for another governorate.",
        keyValue: err.keyValue,
      });
    }
    console.error("updateGovOrderRate:", err);
    return res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

/** DELETE /admin/delivery-rates/governorates/:id — delete by primary key. */
export const deleteGovOrderRate = async (req, res) => {
  const idResult = parsePositiveInt(req.params.id, "id");
  if (idResult.error) {
    return res.status(400).json({ message: idResult.error });
  }

  try {
    const doc = await GovOrderRate.findByIdAndDelete(idResult.value).lean();
    if (!doc) {
      return res.status(404).json({ message: "Governorate rate not found." });
    }

    return res.status(200).json({
      message: "Governorate rate deleted.",
      deleted: { id: doc._id, name: doc.name, cost: doc.cost },
    });
  } catch (err) {
    console.error("deleteGovOrderRate:", err);
    return res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

export const deleteUserOrdersByEmail = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "email is required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const orders = await Order.find({ user_id: user._id }).select("_id");
    const orderIds = orders.map((o) => o._id);

    if (orderIds.length === 0) {
      return res.status(200).json({
        message: "User has no orders",
      });
    }

    const orderItemsResult = await OrderItem.deleteMany({
      order_id: { $in: orderIds },
    });

    const ordersResult = await Order.deleteMany({
      _id: { $in: orderIds },
    });

    return res.status(200).json({
      message: "Orders deleted successfully",
      deleted: {
        orders: ordersResult.deletedCount,
        order_items: orderItemsResult.deletedCount,
      },
    });
  } catch (error) {
    console.error("Delete user orders error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * POST /admin/products/images/sync/local-folders
 * 1) Delete all product_images docs and clear images[] on every product (no duplicate URLs).
 * 2) Scan disk and attach images per folder; primary = first file after sort.
 */
export const syncFolderImagesToProducts = async (req, res) => {
  const PRODUCT_TYPES = await getCategoryNameSet();
  const orphanByCategory = Object.fromEntries(
    [...PRODUCT_TYPES].map((t) => [t, 0])
  );

  const summary = {
    success: true,
    imagesRoot: IMAGES_ROOT,
    baseUrl: BASE_URL,
    cleared_product_images: 0,
    products_cleared_image_refs: 0,
    products_synced_from_disk: 0,
    images_inserted: 0,
    products_cleared_empty_folders: 0,
    products_with_images: 0,
    products_without_images: 0,
    orphan_disk_images_by_category: orphanByCategory,
    orphan_disk_images_total: 0,
    missing_product_folders: [],
    skipped_top_level_types: [],
    errors: [],
  };

  try {
    const st = await fs.stat(IMAGES_ROOT).catch(() => null);
    if (!st?.isDirectory()) {
      return res.status(400).json({
        success: false,
        message: `Images root not found: ${IMAGES_ROOT}`,
      });
    }

    const delRes = await ProductImage.deleteMany({});
    summary.cleared_product_images = delRes.deletedCount || 0;

    const clearRes = await Product.updateMany({}, { $set: { images: [] } });
    summary.products_cleared_image_refs = clearRes.modifiedCount || 0;

    const typeDirs = await fs.readdir(IMAGES_ROOT, { withFileTypes: true });

    for (const t of typeDirs) {
      if (!t.isDirectory()) continue;
      const typeName = t.name;
      if (!PRODUCT_TYPES.has(typeName)) {
        summary.skipped_top_level_types.push(typeName);
        continue;
      }

      const typePath = path.join(IMAGES_ROOT, typeName);
      const typeEntries = await fs.readdir(typePath, { withFileTypes: true });

      const looseFiles = typeEntries.filter(
        (e) =>
          e.isFile() &&
          ALLOWED.has(path.extname(e.name).toLowerCase())
      );
      if (looseFiles.length > 0) {
        summary.orphan_disk_images_by_category[typeName] += looseFiles.length;
      }

      for (const p of typeEntries) {
        if (!p.isDirectory()) continue;
        const productName = p.name;
        const productPath = path.join(typePath, productName);

        const product = await Product.findOne({
          name: productName,
          type: typeName,
        });

        const entries = await fs.readdir(productPath, { withFileTypes: true });
        const files = entries
          .filter((e) => e.isFile())
          .map((e) => e.name)
          .filter((n) => ALLOWED.has(path.extname(n).toLowerCase()))
          .sort();

        if (!product) {
          if (files.length > 0) {
            summary.orphan_disk_images_by_category[typeName] += files.length;
            summary.missing_product_folders.push(`${typeName} / ${productName}`);
          }
          continue;
        }

        if (files.length === 0) {
          summary.products_cleared_empty_folders += 1;
          continue;
        }

        const primaryFile = files[0];

        const toInsert = files.map((filename) => {
          const rel = urlJoinEncoded("images", typeName, productName, filename);
          const image_url = `${BASE_URL}/${rel}`;
          return {
            product_id: product._id,
            image_url,
            is_primary: filename === primaryFile,
          };
        });

        const created = await ProductImage.insertMany(toInsert, {
          ordered: true,
        });
        summary.images_inserted += created.length;

        product.images = created.map((doc) => doc._id);
        await product.save();

        summary.products_synced_from_disk += 1;
      }
    }

    summary.orphan_disk_images_total = Object.values(
      summary.orphan_disk_images_by_category
    ).reduce((a, b) => a + b, 0);

    const [withImg, withoutImg] = await Promise.all([
      Product.countDocuments({
        $expr: { $gt: [{ $size: { $ifNull: ["$images", []] } }, 0] },
      }),
      Product.countDocuments({
        $expr: { $eq: [{ $size: { $ifNull: ["$images", []] } }, 0] },
      }),
    ]);

    summary.products_with_images = withImg;
    summary.products_without_images = withoutImg;

    return res.status(200).json(summary);
  } catch (err) {
    summary.success = false;
    summary.errors.push(err.message);
    return res.status(500).json(summary);
  }
};

function mimeFromImageFilename(name) {
  const ext = path.extname(name).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * POST /admin/products/images/sync/cloud-storage
 * 1) Delete all objects in the GCS bucket
 * 2) Delete all product_images rows and clear images[] on every product
 * 3) Scan IMAGES_ROOT (same layout as local-folders sync), upload each file to GCS, save URLs in MongoDB
 */
export const syncLocalImagesToGcsAndMongo = async (req, res) => {
  const PRODUCT_TYPES = await getCategoryNameSet();
  const orphanByCategory = Object.fromEntries(
    [...PRODUCT_TYPES].map((t) => [t, 0])
  );

  const summary = {
    success: true,
    imagesRoot: IMAGES_ROOT,
    bucket: process.env.GCS_BUCKET_NAME || "elysian-images",
    gcs_bucket_cleared: false,
    cleared_product_images: 0,
    products_cleared_image_refs: 0,
    products_synced: 0,
    images_inserted: 0,
    products_cleared_empty_folders: 0,
    products_with_images: 0,
    products_without_images: 0,
    orphan_disk_images_by_category: orphanByCategory,
    orphan_disk_images_total: 0,
    missing_product_folders: [],
    skipped_top_level_types: [],
    errors: [],
  };

  try {
    const st = await fs.stat(IMAGES_ROOT).catch(() => null);
    if (!st?.isDirectory()) {
      return res.status(400).json({
        success: false,
        message: `Images root not found: ${IMAGES_ROOT}`,
      });
    }

    await deleteAllObjectsInBucket();
    summary.gcs_bucket_cleared = true;

    const delRes = await ProductImage.deleteMany({});
    summary.cleared_product_images = delRes.deletedCount || 0;

    const clearRes = await Product.updateMany({}, { $set: { images: [] } });
    summary.products_cleared_image_refs = clearRes.modifiedCount || 0;

    const typeDirs = await fs.readdir(IMAGES_ROOT, { withFileTypes: true });

    for (const t of typeDirs) {
      if (!t.isDirectory()) continue;
      const typeName = t.name;
      if (!PRODUCT_TYPES.has(typeName)) {
        summary.skipped_top_level_types.push(typeName);
        continue;
      }

      const typePath = path.join(IMAGES_ROOT, typeName);
      const typeEntries = await fs.readdir(typePath, { withFileTypes: true });

      const looseFiles = typeEntries.filter(
        (e) =>
          e.isFile() &&
          ALLOWED.has(path.extname(e.name).toLowerCase())
      );
      if (looseFiles.length > 0) {
        summary.orphan_disk_images_by_category[typeName] += looseFiles.length;
      }

      for (const p of typeEntries) {
        if (!p.isDirectory()) continue;
        const productName = p.name;
        const productPath = path.join(typePath, productName);

        const product = await Product.findOne({
          name: productName,
          type: typeName,
        });

        const entries = await fs.readdir(productPath, { withFileTypes: true });
        const files = entries
          .filter((e) => e.isFile())
          .map((e) => e.name)
          .filter((n) => ALLOWED.has(path.extname(n).toLowerCase()))
          .sort();

        if (!product) {
          if (files.length > 0) {
            summary.orphan_disk_images_by_category[typeName] += files.length;
            summary.missing_product_folders.push(`${typeName} / ${productName}`);
          }
          continue;
        }

        if (files.length === 0) {
          summary.products_cleared_empty_folders += 1;
          continue;
        }

        const primaryFile = files[0];
        const imageUrls = [];

        for (const filename of files) {
          const fullPath = path.join(productPath, filename);
          const buffer = await fs.readFile(fullPath);
          const mimetype = mimeFromImageFilename(filename);
          const image_url = await uploadImageBufferToGcs(
            buffer,
            filename,
            mimetype,
            typeName,
            productName
          );
          imageUrls.push({ image_url, filename });
        }

        const toInsert = imageUrls.map(({ image_url, filename }) => ({
          product_id: product._id,
          image_url,
          is_primary: filename === primaryFile,
        }));

        const created = await ProductImage.insertMany(toInsert, {
          ordered: true,
        });
        summary.images_inserted += created.length;

        product.images = created.map((doc) => doc._id);
        await product.save();

        summary.products_synced += 1;
      }
    }

    summary.orphan_disk_images_total = Object.values(
      summary.orphan_disk_images_by_category
    ).reduce((a, b) => a + b, 0);

    const [withImg, withoutImg] = await Promise.all([
      Product.countDocuments({
        $expr: { $gt: [{ $size: { $ifNull: ["$images", []] } }, 0] },
      }),
      Product.countDocuments({
        $expr: { $eq: [{ $size: { $ifNull: ["$images", []] } }, 0] },
      }),
    ]);

    summary.products_with_images = withImg;
    summary.products_without_images = withoutImg;

    return res.status(200).json(summary);
  } catch (err) {
    summary.success = false;
    summary.errors.push(err.message);
    return res.status(500).json(summary);
  }
};

export const getAllUsersLatest = async (req, res) => {
  try {
    const pipeline = [
      // Prefer created_at; fallback to createdAt; if both missing, sort by _id as tie-breaker
      {
        $addFields: {
          __sortCreated: { $ifNull: ["$created_at", "$createdAt"] },
        },
      },
      { $sort: { __sortCreated: -1, _id: -1 } },
      // Hide sensitive/internal fields
      { $project: { password: 0, __v: 0 } },
    ];

    const [users, totalUsers] = await Promise.all([
      User.aggregate(pipeline),
      User.countDocuments(),
    ]);

    return res.status(200).json({
      count: totalUsers,
      users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// ─────────────────────────────────────────────────────────
// HOME SECTIONS (admin-curated featured + new arrivals)
// ─────────────────────────────────────────────────────────

const HOME_SECTION_MAX = 5;
const HOME_SECTION_KEYS = ["featured", "new_arrivals"];

/**
 * Populates a list of product ObjectIds with the minimal fields needed
 * for the admin picker UI. Preserves curator ordering; drops missing rows.
 */
const populateHomeProducts = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const products = await Product.find({ _id: { $in: ids } })
    .populate({ path: "images", select: "image_url is_primary" })
    .select("_id name type price stock_quantity images");
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return ids
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((p) => {
      const obj = p.toObject();
      const imgs = obj.images || [];
      const primary = imgs.find((i) => i.is_primary) || imgs[0] || null;
      return {
        product_id: obj._id,
        name: obj.name,
        type: obj.type,
        price: obj.price,
        stock_quantity: obj.stock_quantity,
        image_url: primary?.image_url || null,
      };
    });
};

/** GET /admin/home-sections — return curated lists + every product available to pick from. */
export const getHomeSections = async (req, res) => {
  try {
    const home = await HomeSection.findOne({ key: "home" }).lean();
    const featuredIds = home?.featured || [];
    const newArrivalsIds = home?.new_arrivals || [];

    const [featured, new_arrivals, allProducts] = await Promise.all([
      populateHomeProducts(featuredIds),
      populateHomeProducts(newArrivalsIds),
      Product.find({})
        .populate({ path: "images", select: "image_url is_primary" })
        .select("_id name type price stock_quantity images sort_order")
        .sort({ type: 1, sort_order: 1, name: 1 })
        .lean(),
    ]);

    const available = allProducts.map((p) => {
      const imgs = p.images || [];
      const primary = imgs.find((i) => i.is_primary) || imgs[0] || null;
      return {
        product_id: p._id,
        name: p.name,
        type: p.type,
        price: p.price,
        stock_quantity: p.stock_quantity,
        image_url: primary?.image_url || null,
      };
    });

    return res.status(200).json({
      max_per_section: HOME_SECTION_MAX,
      featured,
      new_arrivals,
      available_products: available,
    });
  } catch (error) {
    console.error("getHomeSections error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/** PUT /admin/home-sections/:section — body { product_ids: ObjectId[] } */
export const updateHomeSection = async (req, res) => {
  try {
    const section = String(req.params.section || "").trim();
    if (!HOME_SECTION_KEYS.includes(section)) {
      return res.status(400).json({
        message: `Invalid section. Must be one of: ${HOME_SECTION_KEYS.join(", ")}.`,
      });
    }

    const { product_ids } = req.body || {};
    if (!Array.isArray(product_ids)) {
      return res.status(400).json({ message: "product_ids must be an array of product IDs." });
    }
    if (product_ids.length > HOME_SECTION_MAX) {
      return res.status(400).json({
        message: `A maximum of ${HOME_SECTION_MAX} products can be selected per section.`,
      });
    }

    // Deduplicate while preserving the admin's chosen order.
    const seen = new Set();
    const cleanIds = [];
    for (const raw of product_ids) {
      const s = String(raw || "").trim();
      if (!mongoose.Types.ObjectId.isValid(s)) {
        return res.status(400).json({ message: `Invalid product id: ${s}` });
      }
      if (seen.has(s)) continue;
      seen.add(s);
      cleanIds.push(s);
    }

    // Verify every id actually points at an existing product.
    if (cleanIds.length > 0) {
      const found = await Product.find({ _id: { $in: cleanIds } }).select("_id").lean();
      if (found.length !== cleanIds.length) {
        return res.status(400).json({
          message: "One or more product IDs do not exist.",
        });
      }
    }

    const update = { $set: { [section]: cleanIds, key: "home" } };
    const updated = await HomeSection.findOneAndUpdate(
      { key: "home" },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    const populated = await populateHomeProducts(updated[section] || []);
    return res.status(200).json({
      message: `${section.replace("_", " ")} updated.`,
      section,
      products: populated,
    });
  } catch (error) {
    console.error("updateHomeSection error:", error);
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/**
 * GET /admin/dashboard/users-by-location
 * Returns registered-user counts grouped by country, governorate, and city.
 * Only counts users captured with a known value for each dimension.
 */
export const getUsersByLocation = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 100);

    const [byCountry, byGovernorate, byCity, totalUsers, knownCountryCount] = await Promise.all([
      User.aggregate([
        { $match: { country: { $exists: true, $ne: null, $nin: ["", "Unknown"] } } },
        { $group: { _id: "$country", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
        { $project: { _id: 0, name: "$_id", count: 1 } },
      ]),
      User.aggregate([
        { $match: { governorate: { $exists: true, $ne: null, $nin: ["", "Unknown"] } } },
        { $group: { _id: { governorate: "$governorate", country: "$country" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
        { $project: { _id: 0, name: "$_id.governorate", country: "$_id.country", count: 1 } },
      ]),
      User.aggregate([
        { $match: { city: { $exists: true, $ne: null, $nin: ["", "Unknown"] } } },
        { $group: { _id: { city: "$city", country: "$country" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
        { $project: { _id: 0, city: "$_id.city", country: "$_id.country", count: 1 } },
      ]),
      User.countDocuments(),
      User.countDocuments({ country: { $exists: true, $ne: null, $nin: ["", "Unknown"] } }),
    ]);

    return res.status(200).json({
      total_users: totalUsers,
      known_location_users: knownCountryCount,
      unknown_location_users: Math.max(totalUsers - knownCountryCount, 0),
      byCountry,
      byGovernorate,
      byCity,
    });
  } catch (error) {
    console.error("Users by location error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

export const updateProductSortOrder = async (req, res) => {
  const { name, category, sort_order } = req.body;

  if (!name || !category || sort_order == null) {
    return res.status(400).json({
      success: false,
      message: "'name', 'category', and 'sort_order' are all required.",
    });
  }

  const newOrder = Number(sort_order);
  if (!Number.isInteger(newOrder) || newOrder < 1) {
    return res.status(400).json({
      success: false,
      message: "'sort_order' must be a positive integer (1, 2, 3, ...).",
    });
  }

  try {
    const product = await Product.findOne({ name, type: category });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Product '${name}' not found in category '${category}'.`,
      });
    }

    const oldOrder = product.sort_order;

    if (oldOrder === newOrder) {
      return res.status(200).json({
        success: true,
        message: `Product '${name}' is already at position ${newOrder}.`,
      });
    }

    if (!oldOrder || oldOrder <= 0) {
      // Product was never ordered — insert at the desired position
      await Product.updateMany(
        { type: category, sort_order: { $gte: newOrder }, _id: { $ne: product._id } },
        { $inc: { sort_order: 1 } }
      );
    } else if (oldOrder < newOrder) {
      await Product.updateMany(
        { type: category, sort_order: { $gt: oldOrder, $lte: newOrder }, _id: { $ne: product._id } },
        { $inc: { sort_order: -1 } }
      );
    } else {
      await Product.updateMany(
        { type: category, sort_order: { $gte: newOrder, $lt: oldOrder }, _id: { $ne: product._id } },
        { $inc: { sort_order: 1 } }
      );
    }

    product.sort_order = newOrder;
    await product.save();

    return res.status(200).json({
      success: true,
      message: `Product '${name}' moved to position ${newOrder} in '${category}'.`,
      product: {
        name: product.name,
        category: product.type,
        sort_order: product.sort_order,
      },
    });
  } catch (err) {
    console.error("Sort update error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error while updating sort order.",
      error: err.message,
    });
  }
};

export const deleteProductsByNameAndType = async (req, res) => {
  try {
    let { products } = req.body;

    if (!products) {
      return res.status(400).json({
        message: "products is required",
      });
    }

    // Normalize to array
    if (!Array.isArray(products)) {
      products = [products];
    }

    // Validate input
    for (const p of products) {
      if (!p.name || !p.type) {
        return res.status(400).json({
          message: "Each product must have name and type",
        });
      }
    }

    // Build OR query (exact match)
    const matchQuery = products.map((p) => ({
      name: p.name,
      type: p.type,
    }));

    // Find matching products
    const matchedProducts = await Product.find({
      $or: matchQuery,
    }).select("_id name type sort_order");

    if (matchedProducts.length === 0) {
      return res.status(404).json({
        message: "No matching products found",
      });
    }

    const matchedIds = matchedProducts.map((p) => p._id);

    const imageDocs = await ProductImage.find({
      product_id: { $in: matchedIds },
    })
      .select("image_url")
      .lean();
    const imageUrls = imageDocs.map((d) => d.image_url).filter(Boolean);

    const folderDeletes = await Promise.allSettled(
      matchedProducts.map((mp) =>
        deleteAllGcsObjectsUnderProductPrefix(mp.type, mp.name)
      )
    );
    const folderFailed = folderDeletes.filter((r) => r.status === "rejected");
    if (folderFailed.length > 0) {
      console.error(
        "GCS product folder delete failures:",
        folderFailed.map((r) => r.reason?.message || r.reason)
      );
    }

    await deleteObjectsByPublicUrls(imageUrls);

    // 1️⃣ Delete variants
    await ProductVariant.deleteMany({
      product_id: { $in: matchedIds },
    });

    // 2️⃣ Delete images
    await ProductImage.deleteMany({
      product_id: { $in: matchedIds },
    });

    // 3️⃣ Collect affected categories before deleting
    const affectedTypes = [...new Set(matchedProducts.map((p) => p.type))];

    // 4️⃣ Remove from all users' carts
    const orphanedCartItems = await CartItem.find({
      product_id: { $in: matchedIds },
    }).select("_id cart_id");
    if (orphanedCartItems.length > 0) {
      const orphanedIds = orphanedCartItems.map((ci) => ci._id);
      const affectedCartIds = [...new Set(orphanedCartItems.map((ci) => String(ci.cart_id)))];
      await CartItem.deleteMany({ _id: { $in: orphanedIds } });
      await Cart.updateMany(
        { _id: { $in: affectedCartIds } },
        { $pull: { items: { $in: orphanedIds } } }
      );
    }

    // 5️⃣ Delete products
    const deleteResult = await Product.deleteMany({
      _id: { $in: matchedIds },
    });

    // 6️⃣ Re-sequence sort_order per affected category + auto-delete empty categories
    for (const type of affectedTypes) {
      const remaining = await Product.find({ type })
        .sort({ sort_order: 1 })
        .select("_id");
      if (remaining.length === 0) {
        // Last product in this category was deleted — remove the category.
        await ProductCategory.deleteOne({ name: type });
      } else {
        for (let i = 0; i < remaining.length; i++) {
          await Product.updateOne(
            { _id: remaining[i]._id },
            { $set: { sort_order: i + 1 } }
          );
        }
      }
    }

    // Re-sequence category sort_orders to fill gaps.
    const allCats = await ProductCategory.find({}).sort({ sort_order: 1 }).select("_id");
    for (let i = 0; i < allCats.length; i++) {
      await ProductCategory.updateOne({ _id: allCats[i]._id }, { $set: { sort_order: i + 1 } });
    }
    invalidateCategoryCache();

    return res.status(200).json({
      message: "Products deleted successfully",
      deletedCount: deleteResult.deletedCount,
      deletedProducts: matchedProducts,
    });
  } catch (error) {
    console.error("Delete by name+type error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const addProductsWithVariants = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        message: "Invalid request body",
      });
    }

    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    if (uploadedFiles.length === 0) {
      return res.status(400).json({
        message:
          "At least one image file is required (multipart field name: images)",
      });
    }

    const rawProduct = req.body.product;
    if (rawProduct == null || String(rawProduct).trim() === "") {
      return res.status(400).json({
        message: 'Form field "product" is required (JSON object as a string)',
      });
    }
    if (typeof rawProduct !== "string") {
      return res.status(400).json({
        message: "product must be a JSON string in the multipart form",
      });
    }
    let p;
    try {
      p = JSON.parse(rawProduct);
    } catch {
      return res.status(400).json({ message: "product must be valid JSON" });
    }
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      return res.status(400).json({
        message: "product must be a single JSON object",
      });
    }

    if (typeof p.price === "string" && String(p.price).trim() !== "") {
      const n = Number(p.price);
      if (!Number.isFinite(n)) {
        return res.status(400).json({ message: "price must be a number" });
      }
      p.price = n;
    }

    if (p.stock_quantity === undefined || p.stock_quantity === null) {
      return res.status(400).json({ message: "stock_quantity is required" });
    }
    if (typeof p.stock_quantity === "string") {
      if (String(p.stock_quantity).trim() === "") {
        return res.status(400).json({ message: "stock_quantity is required" });
      }
      p.stock_quantity = Number(p.stock_quantity);
    }
    if (
      typeof p.stock_quantity !== "number" ||
      !Number.isFinite(p.stock_quantity)
    ) {
      return res.status(400).json({
        message: "stock_quantity must be a finite number",
      });
    }

    if (p.sort_order === undefined || p.sort_order === null) {
      return res.status(400).json({ message: "sort_order is required" });
    }
    if (typeof p.sort_order === "string") {
      if (String(p.sort_order).trim() === "") {
        return res.status(400).json({ message: "sort_order is required" });
      }
      p.sort_order = Number(p.sort_order);
    }
    if (typeof p.sort_order !== "number" || !Number.isFinite(p.sort_order)) {
      return res.status(400).json({
        message: "sort_order must be a finite number",
      });
    }

    if (p.is_new === undefined || p.is_new === null || p.is_new === "") {
      return res.status(400).json({ message: "is_new is required" });
    }
    if (typeof p.is_new === "string") {
      const s = p.is_new.toLowerCase().trim();
      if (s === "true" || s === "1") {
        p.is_new = true;
      } else if (s === "false" || s === "0") {
        p.is_new = false;
      } else {
        return res.status(400).json({
          message: "is_new must be a boolean (or string true/false, 1/0)",
        });
      }
    }
    if (typeof p.is_new !== "boolean") {
      return res.status(400).json({ message: "is_new must be a boolean" });
    }

    if (typeof p.variants === "string" && p.variants.trim() !== "") {
      try {
        p.variants = JSON.parse(p.variants);
      } catch {
        return res.status(400).json({ message: "variants must be valid JSON" });
      }
    }

    if (typeof p.option_types === "string" && p.option_types.trim() !== "") {
      try {
        p.option_types = JSON.parse(p.option_types);
      } catch {
        return res.status(400).json({ message: "option_types must be valid JSON" });
      }
    }
    const optionTypes = normalizeOptionTypes(p.option_types);

    // Pre-validate every supplied variant before any DB write.
    if (Array.isArray(p.variants) && p.variants.length > 0) {
      const seenKeys = new Set();
      for (const v of p.variants) {
        if (typeof v.price !== "number" || !Number.isFinite(v.price)) {
          return res.status(400).json({ message: "Each variant must have a numeric price." });
        }
        const attrs = sanitizeAttributes(v.attributes) || {};
        const err = validateVariantAttributes(attrs, optionTypes);
        if (err) return res.status(400).json({ message: err });
        const key = buildAttributesKey(attrs);
        if (seenKeys.has(key)) {
          return res.status(400).json({
            message: "Two variants share the same attribute combination.",
          });
        }
        seenKeys.add(key);
        v._cleanAttributes = attrs;
      }
    }

    delete p.image_urls;

    const gcsUrls = [];
    for (const file of uploadedFiles) {
      gcsUrls.push(
        await uploadImageBufferToGcs(
          file.buffer,
          file.originalname,
          file.mimetype,
          p.type,
          p.name
        )
      );
    }
    p.image_urls = gcsUrls;

    if (!p.name || !p.type || typeof p.price !== "number") {
      return res.status(400).json({
        message: "Product must have name, type, and price (number)",
      });
    }

    // Auto-create category if it doesn't exist yet (sort_order = max + 1).
    if (!(await isValidCategory(p.type))) {
      const max = await ProductCategory.findOne({}).sort({ sort_order: -1 }).select("sort_order").lean();
      await ProductCategory.create({
        name: p.type,
        sort_order: (max?.sort_order || 0) + 1,
        is_active: true,
      });
      invalidateCategoryCache();
    }

    const existing = await Product.findOne({
      name: p.name,
      type: p.type,
    }).select("name type");

    if (existing) {
      return res.status(409).json({
        message: "Duplicate product name in the same category",
        duplicates: [existing],
      });
    }

    const product = await Product.create({
      name: p.name,
      description: p.description,
      price: p.price,
      type: p.type,
      is_new: p.is_new,
      stock_quantity: p.stock_quantity,
      sort_order: p.sort_order,
      option_types: optionTypes,
    });

    if (Array.isArray(p.variants) && p.variants.length > 0) {
      // Create one-by-one so the pre-save hook can compute attributes_key.
      const variants = [];
      for (const v of p.variants) {
        const doc = await ProductVariant.create({
          product_id: product._id,
          attributes: v._cleanAttributes,
          description: String(v.description || "").trim(),
          price: v.price,
          stock_quantity: v.stock_quantity || 0,
        });
        variants.push(doc);
      }
      product.product_variants = variants.map((v) => v._id);
      await product.save();
    }

    if (Array.isArray(p.image_urls) && p.image_urls.length > 0) {
      const urls = p.image_urls.map((s) => s.trim());
      const primaryI = primaryImageIndexFromUrls(urls);
      const toInsert = urls.map((image_url, i) => ({
        product_id: product._id,
        image_url,
        is_primary: i === primaryI,
      }));
      const createdImgs = await ProductImage.insertMany(toInsert, {
        ordered: true,
      });
      product.images = createdImgs.map((doc) => doc._id);
      await product.save();
    }

    return res.status(201).json({
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    console.error("Add product error:", error);

    // Handle unique index error nicely
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Duplicate product name detected in the same category",
        error: error.keyValue,
      });
    }

    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getAllOrdersFull = async (req, res) => {
  try {
    const ORDER_ITEMS_COLL = OrderItem.collection.name; // "order_items"
    const USERS_COLL = User.collection.name; // "users"
    const PRODUCTS_COLL = Product.collection.name; // "products"

    const pipeline = [
      { $sort: { order_date: -1, _id: -1 } },

      // Join user
      {
        $lookup: {
          from: USERS_COLL,
          localField: "user_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

      // Join order items with product details
      {
        $lookup: {
          from: ORDER_ITEMS_COLL,
          let: { orderId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$order_id", "$$orderId"] } } },

            // ✅ Join product name & type
            {
              $lookup: {
                from: PRODUCTS_COLL,
                localField: "product_id",
                foreignField: "_id",
                as: "product",
              },
            },
            { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },

            // Only keep relevant product info
            {
              $addFields: {
                product_name: "$product.name",
                product_type: "$product.type",
              },
            },
            { $project: { product: 0 } }, // remove full product doc if not needed
          ],
          as: "items",
        },
      },

      {
        $project: {
          _id: 1,
          user_id: 1,
          order_date: 1,
          subtotal: 1,
          discount_percent: 1,
          total_amount: 1,
          shipping_cost: 1,
          address: 1,
          apartment_no: 1,
          city: 1,
          governorate: 1,
          phone_number: 1,
          status: 1,
          items: 1,
          user: {
            _id: 1,
            email: 1,
            birthday: 1,
            created_at: 1,
            updated_at: 1,
          },
        },
      },
    ];

    let orders = await Order.aggregate(pipeline);

    // Convert Decimal128 prices to numbers
    orders = orders.map((o) => ({
      ...o,
      items: o.items.map((it) => ({
        ...it,
        price: it?.price ? Number(it.price) : it.price,
      })),
    }));

    return res.status(200).json({
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Error fetching all orders with details:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};


export const updateProduct = async (req, res) => {
  const isMultipart = (req.headers["content-type"] || "")
    .toLowerCase()
    .includes("multipart/form-data");

  let body = req.body;
  if (isMultipart) {
    const raw = req.body.payload;
    if (raw == null || String(raw).trim() === "") {
      return res.status(400).json({
        message:
          'multipart/form-data requires a "payload" field: JSON string with at least name and type (and optional remove_image_ids, etc.).',
      });
    }
    if (typeof raw !== "string") {
      return res.status(400).json({ message: "payload must be a JSON string." });
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return res.status(400).json({ message: "payload must be a JSON object." });
      }
      body = parsed;
    } catch {
      return res.status(400).json({ message: "payload must be valid JSON." });
    }
  }

  const removeIds = normalizeRemoveImageIds(body.remove_image_ids);

  if (typeof body.add_variants === "string" && body.add_variants.trim() !== "") {
    try {
      body.add_variants = JSON.parse(body.add_variants);
    } catch {
      return res.status(400).json({
        message: "add_variants must be a valid JSON array string when sent as text.",
      });
    }
  }

  const {
    name,
    type,
    product_quantity,
    price,
    is_new,
    new_name,
    option_types,
    // Variant edit by id (preferred — unambiguous):
    variant_id,
    // Variant edit by lookup (alternative):
    match_attributes, // {key: value} to find the variant
    variant_quantity,
    variant_price,
    variant_description,
    new_attributes, // partial — overwrites the variant's attributes map
    add_variants,
  } = body;

  if (!name || !type) {
    return res.status(400).json({
      message: "name and type are required.",
    });
  }

  if (new_name !== undefined) {
    if (typeof new_name !== "string" || !new_name.trim()) {
      return res.status(400).json({
        message: "new_name must be a non-empty string if provided.",
      });
    }
  }

  if (
    product_quantity !== undefined &&
    (typeof product_quantity !== "number" ||
      !Number.isFinite(product_quantity))
  ) {
    return res.status(400).json({
      message: "product_quantity must be a finite number if provided.",
    });
  }

  if (
    price !== undefined &&
    (typeof price !== "number" || !Number.isFinite(price))
  ) {
    return res.status(400).json({
      message: "price must be a finite number if provided.",
    });
  }

  if (is_new !== undefined && typeof is_new !== "boolean") {
    return res.status(400).json({
      message: "is_new must be a boolean if provided.",
    });
  }

  if (
    variant_price !== undefined &&
    (typeof variant_price !== "number" || !Number.isFinite(variant_price))
  ) {
    return res.status(400).json({
      message: "variant_price must be a finite number if provided.",
    });
  }

  if (add_variants !== undefined && !Array.isArray(add_variants)) {
    return res.status(400).json({
      message: "add_variants must be an array.",
    });
  }

  try {
    const product = await Product.findOne({ name, type });
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    // 1️⃣ Update product-level fields
    if (new_name !== undefined) product.name = new_name.trim();
    if (product_quantity !== undefined)
      product.stock_quantity = product_quantity;
    if (price !== undefined) product.price = price;
    if (is_new !== undefined) product.is_new = is_new;
    if (option_types !== undefined) {
      const normalized = normalizeOptionTypes(option_types);
      // Refuse to drop an option_type while existing variants still use it.
      const inUse = await ProductVariant.find({ product_id: product._id }).lean();
      const stillUsed = new Set();
      for (const v of inUse) {
        if (v.attributes) {
          // Mongoose returns Map as plain object in .lean()
          for (const k of Object.keys(v.attributes)) stillUsed.add(k);
        }
      }
      for (const k of stillUsed) {
        if (!normalized.includes(k)) {
          return res.status(400).json({
            message: `Cannot remove option_type '${k}': existing variants still use it.`,
          });
        }
      }
      product.option_types = normalized;
    }

    await product.save();

    // 1.5 Rename GCS folder & update image URLs in DB
    if (new_name !== undefined) {
      const urlMap = await renameGcsProductFolder(type, name, new_name.trim());
      if (urlMap.size > 0) {
        const images = await ProductImage.find({ product_id: product._id });
        await Promise.all(
          images.map((img) => {
            const newUrl = urlMap.get(img.image_url);
            if (newUrl) {
              img.image_url = newUrl;
              return img.save();
            }
            return Promise.resolve();
          })
        );
      }
    }

    // 2️⃣ Update ONE existing variant — identified by variant_id (preferred)
    //    or by match_attributes.
    let updatedVariant = null;
    let carts_affected = 0;
    let cart_items_deleted = 0;

    const wantsVariantUpdate =
      variant_quantity !== undefined ||
      variant_price !== undefined ||
      variant_description !== undefined ||
      new_attributes !== undefined;

    if (wantsVariantUpdate) {
      if (variant_quantity !== undefined) {
        if (
          typeof variant_quantity !== "number" ||
          !Number.isFinite(variant_quantity)
        ) {
          return res.status(400).json({
            message: "variant_quantity must be a finite number.",
          });
        }
      }

      let variantDoc = null;
      if (variant_id) {
        if (!mongoose.Types.ObjectId.isValid(String(variant_id))) {
          return res.status(400).json({ message: "Invalid variant_id." });
        }
        variantDoc = await ProductVariant.findOne({
          _id: variant_id,
          product_id: product._id,
        });
      } else if (match_attributes && typeof match_attributes === "object") {
        const lookupAttrs = sanitizeAttributes(match_attributes) || {};
        const lookupKey = buildAttributesKey(lookupAttrs);
        variantDoc = await ProductVariant.findOne({
          product_id: product._id,
          attributes_key: lookupKey,
        });
      } else {
        return res.status(400).json({
          message: "Provide variant_id or match_attributes to identify the variant.",
        });
      }

      if (!variantDoc) {
        return res.status(404).json({ message: "Product variant not found." });
      }

      if (variant_quantity !== undefined) variantDoc.stock_quantity = variant_quantity;
      if (variant_price !== undefined) variantDoc.price = variant_price;
      if (variant_description !== undefined) {
        variantDoc.description = String(variant_description || "").trim();
      }
      if (new_attributes !== undefined) {
        const cleanAttrs = sanitizeAttributes(new_attributes);
        if (!cleanAttrs) {
          return res.status(400).json({ message: "new_attributes must be an object." });
        }
        const attrErr = validateVariantAttributes(cleanAttrs, product.option_types);
        if (attrErr) return res.status(400).json({ message: attrErr });
        variantDoc.attributes = new Map(Object.entries(cleanAttrs));
      }

      await variantDoc.save();
      updatedVariant = variantDoc;

      if (variant_quantity === 0) {
        const cartItemsToRemove = await CartItem.find({
          product_id: product._id,
          variant_id: updatedVariant._id,
        });

        if (cartItemsToRemove.length > 0) {
          const cartItemIds = cartItemsToRemove.map((ci) => ci._id);
          const cartIds = [
            ...new Set(
              cartItemsToRemove.map((ci) => ci.cart_id.toString())
            ),
          ];

          const deleteResult = await CartItem.deleteMany({
            _id: { $in: cartItemIds },
          });
          cart_items_deleted = deleteResult.deletedCount || 0;

          await Cart.updateMany(
            { _id: { $in: cartIds } },
            { $pull: { items: { $in: cartItemIds } } }
          );

          for (const cartId of cartIds) {
            const cart = await Cart.findById(cartId).populate({
              path: "items",
              populate: [
                { path: "product_id" },
                { path: "variant_id" },
              ],
            });

            if (!cart) continue;

            cart.total_price = cart.items.reduce((sum, item) => {
              const itemPrice =
                item.variant_id?.price ??
                item.product_id?.price ??
                0;
              return sum + itemPrice * item.quantity;
            }, 0);

            await cart.save();
          }

          carts_affected = cartIds.length;
        }
      }
    }

    // 3️⃣ Add new variants
    let addedVariants = [];

    if (Array.isArray(add_variants) && add_variants.length > 0) {
      const cleaned = [];
      for (const v of add_variants) {
        if (typeof v.price !== "number" || !Number.isFinite(v.price)) {
          return res.status(400).json({
            message: "Each new variant must have a numeric price.",
          });
        }
        const attrs = sanitizeAttributes(v.attributes) || {};
        const err = validateVariantAttributes(attrs, product.option_types);
        if (err) return res.status(400).json({ message: err });
        cleaned.push({
          attributes: attrs,
          description: String(v.description || "").trim(),
          price: v.price,
          stock_quantity: v.stock_quantity || 0,
        });
      }

      // Pre-save hook computes attributes_key; create one-by-one.
      const newDocs = [];
      for (const c of cleaned) {
        const doc = await ProductVariant.create({
          product_id: product._id,
          attributes: c.attributes,
          description: c.description,
          price: c.price,
          stock_quantity: c.stock_quantity,
        });
        newDocs.push(doc);
      }
      addedVariants = newDocs;

      product.product_variants.push(...newDocs.map((d) => d._id));
      await product.save();
    }

    const variants = [
      ...(updatedVariant ? [updatedVariant] : []),
      ...addedVariants,
    ];

    let images_deleted = 0;
    let images_added = 0;
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];

    let productDoc = await Product.findById(product._id);
    if (!productDoc) {
      return res.status(404).json({ message: "Product not found." });
    }

    let toRemoveList = [];
    let objectIds = [];
    if (removeIds.length > 0) {
      const uniqueRemove = [...new Set(removeIds.map((id) => String(id)))];
      objectIds = uniqueRemove.map((id) => new mongoose.Types.ObjectId(id));
      toRemoveList = await ProductImage.find({
        _id: { $in: objectIds },
        product_id: productDoc._id,
      }).lean();
      if (toRemoveList.length !== uniqueRemove.length) {
        return res.status(400).json({
          message:
            "One or more remove_image_ids are invalid or do not belong to this product.",
        });
      }
    }

    const imageMutation =
      removeIds.length > 0 || uploadedFiles.length > 0;
    if (imageMutation) {
      const currentCount = await ProductImage.countDocuments({
        product_id: productDoc._id,
      });
      const finalCount =
        currentCount - toRemoveList.length + uploadedFiles.length;
      if (finalCount < 1) {
        return res.status(400).json({
          message:
            "The product must keep at least one image. Upload new image(s) before removing the last one(s), or remove fewer images.",
        });
      }
    }

    if (toRemoveList.length > 0) {
      const urls = toRemoveList.map((d) => d.image_url).filter(Boolean);
      await deleteObjectsByPublicUrls(urls);
      await ProductImage.deleteMany({ _id: { $in: objectIds } });
      images_deleted = toRemoveList.length;
    }

    if (uploadedFiles.length > 0) {
      const newDocs = [];
      for (const file of uploadedFiles) {
        const image_url = await uploadImageBufferToGcs(
          file.buffer,
          file.originalname,
          file.mimetype,
          productDoc.type,
          productDoc.name
        );
        newDocs.push({
          product_id: productDoc._id,
          image_url,
          is_primary: false,
        });
      }
      await ProductImage.insertMany(newDocs, { ordered: true });
      images_added = newDocs.length;
    }

    if (removeIds.length > 0 || uploadedFiles.length > 0) {
      await resyncProductImagePrimaryAndRefs(productDoc._id);
    }

    const productOut = await Product.findById(productDoc._id);

    return res.status(200).json({
      message: "Product updated successfully.",
      product: productOut,
      variants,
      variants_modified: updatedVariant ? 1 : 0,
      variants_added: addedVariants.length,
      carts_affected,
      cart_items_deleted,
      images_deleted,
      images_added,
    });
  } catch (error) {
    console.error("Error updating product:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Duplicate variant (same size/color already exists).",
        error: error.keyValue,
      });
    }

    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const deleteVariant = async (req, res) => {
  const { name, type, variant_id, attributes } = req.body;

  if (!name || !type) {
    return res.status(400).json({
      message: "name and type are required to identify the product.",
    });
  }

  if (!variant_id && (!attributes || typeof attributes !== "object")) {
    return res.status(400).json({
      message: "Provide variant_id or attributes to identify the variant to delete.",
    });
  }

  try {
    const product = await Product.findOne({ name, type });
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    let variant = null;
    if (variant_id) {
      if (!mongoose.Types.ObjectId.isValid(String(variant_id))) {
        return res.status(400).json({ message: "Invalid variant_id." });
      }
      variant = await ProductVariant.findOne({
        _id: variant_id,
        product_id: product._id,
      });
    } else {
      const cleanAttrs = sanitizeAttributes(attributes) || {};
      const key = buildAttributesKey(cleanAttrs);
      variant = await ProductVariant.findOne({
        product_id: product._id,
        attributes_key: key,
      });
    }
    if (!variant) {
      return res.status(404).json({ message: "Variant not found." });
    }

    // Remove from carts first
    const cartItemsToRemove = await CartItem.find({
      product_id: product._id,
      variant_id: variant._id,
    });

    let cart_items_deleted = 0;
    let carts_affected = 0;

    if (cartItemsToRemove.length > 0) {
      const cartItemIds = cartItemsToRemove.map((ci) => ci._id);
      const cartIds = [
        ...new Set(cartItemsToRemove.map((ci) => ci.cart_id.toString())),
      ];

      const deleteResult = await CartItem.deleteMany({
        _id: { $in: cartItemIds },
      });
      cart_items_deleted = deleteResult.deletedCount || 0;

      await Cart.updateMany(
        { _id: { $in: cartIds } },
        { $pull: { items: { $in: cartItemIds } } }
      );

      for (const cartId of cartIds) {
        const cart = await Cart.findById(cartId).populate({
          path: "items",
          populate: [{ path: "product_id" }, { path: "variant_id" }],
        });
        if (!cart) continue;
        cart.total_price = cart.items.reduce((sum, item) => {
          const itemPrice =
            item.variant_id?.price ?? item.product_id?.price ?? 0;
          return sum + itemPrice * item.quantity;
        }, 0);
        await cart.save();
      }

      carts_affected = cartIds.length;
    }

    await ProductVariant.deleteOne({ _id: variant._id });

    product.product_variants.pull(variant._id);
    await product.save();

    return res.status(200).json({
      message: "Variant deleted successfully.",
      deleted_variant: variant,
      carts_affected,
      cart_items_deleted,
    });
  } catch (error) {
    console.error("Error deleting variant:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const createPublicPromo = async (req, res) => {
  try {
    const { promo_code, discount, expiry_date } = req.body;

    const expiryMissing =
      expiry_date === undefined ||
      expiry_date === null ||
      (typeof expiry_date === "string" && !String(expiry_date).trim());

    if (!promo_code || discount === undefined || discount === null || expiryMissing) {
      return res.status(400).json({
        message: "promo_code, discount, and expiry_date are required.",
      });
    }

    const formattedCode = promo_code.trim().toUpperCase();

    // ✅ Enforce exactly 6 characters
    if (formattedCode.length !== 6) {
      return res
        .status(400)
        .json({ message: "Promo code must be exactly 6 characters long." });
    }

    const expiry = new Date(expiry_date);
    if (Number.isNaN(expiry.getTime())) {
      return res.status(400).json({ message: "expiry_date must be a valid date." });
    }

    const minExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (expiry.getTime() < minExpiry.getTime()) {
      return res.status(400).json({
        message: "expiry_date must be at least 24 hours from now.",
      });
    }

    const existing = await PromoCode.findOne({ promo_code: formattedCode });
    if (existing) {
      return res.status(400).json({ message: "Promo code already exists." });
    }

    const promo = await PromoCode.create({
      promo_code: formattedCode,
      discount: Number(discount),
      is_public: true,
      used_by: [],
      expiry_date: expiry,
    });

    return res.status(201).json({
      message: "Public promo code created successfully",
      promo,
    });
  } catch (error) {
    console.error("Error creating promo code:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getAllPromoCodes = async (req, res) => {
  try {
    const promos = await PromoCode.find({})
      .sort({ created_at: -1 })
      .lean();
    return res.status(200).json({
      count: promos.length,
      promo_codes: promos,
    });
  } catch (error) {
    console.error("Error listing promo codes:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const deletePromoCodeById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Valid promo code id is required." });
    }

    const deleted = await PromoCode.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Promo code not found." });
    }

    return res.status(200).json({
      message: "Promo code deleted successfully.",
      deleted,
    });
  } catch (error) {
    console.error("Error deleting promo code:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// --- NEW: Monthly order totals with grand total ---
// ─────────────────────────────────────────────────────────
// DASHBOARD APIs
// ─────────────────────────────────────────────────────────

/**
 * GET /admin/dashboard/overview
 * Single-call summary: total revenue, orders, users, new users this month,
 * average order value, orders by status, revenue compared to last month.
 */
export const getDashboardOverview = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      revenueResult,
      thisMonthRevenue,
      lastMonthRevenue,
      totalOrders,
      thisMonthOrders,
      totalUsers,
      newUsersThisMonth,
      newUsersLastMonth,
    ] = await Promise.all([
      // Total revenue (exclude cancelled)
      Order.aggregate([
        { $match: { status: { $ne: "Cancelled" } } },
        {
          $group: {
            _id: null,
            total_revenue: { $sum: { $toDouble: "$total_amount" } },
            total_subtotal: { $sum: { $toDouble: "$subtotal" } },
            total_shipping: { $sum: { $toDouble: "$shipping_cost" } },
          },
        },
      ]),
      // This month revenue
      Order.aggregate([
        {
          $match: {
            status: { $ne: "Cancelled" },
            order_date: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: { $toDouble: "$total_amount" } },
            orders: { $sum: 1 },
          },
        },
      ]),
      // Last month revenue
      Order.aggregate([
        {
          $match: {
            status: { $ne: "Cancelled" },
            order_date: { $gte: startOfLastMonth, $lt: startOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: { $toDouble: "$total_amount" } },
            orders: { $sum: 1 },
          },
        },
      ]),
      // Total orders count
      Order.countDocuments({ status: { $ne: "Cancelled" } }),
      // This month orders count
      Order.countDocuments({
        status: { $ne: "Cancelled" },
        order_date: { $gte: startOfMonth },
      }),
      // Total users
      User.countDocuments(),
      // New users this month
      User.countDocuments({ created_at: { $gte: startOfMonth } }),
      // New users last month
      User.countDocuments({
        created_at: { $gte: startOfLastMonth, $lt: startOfMonth },
      }),
    ]);

    const rev = revenueResult[0] || {
      total_revenue: 0,
      total_subtotal: 0,
      total_shipping: 0,
    };
    const thisMonth = thisMonthRevenue[0] || { revenue: 0, orders: 0 };
    const lastMonth = lastMonthRevenue[0] || { revenue: 0, orders: 0 };

    const revenueGrowth =
      lastMonth.revenue > 0
        ? (((thisMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100).toFixed(1)
        : null;
    const ordersGrowth =
      lastMonth.orders > 0
        ? (((thisMonth.orders - lastMonth.orders) / lastMonth.orders) * 100).toFixed(1)
        : null;
    const usersGrowth =
      newUsersLastMonth > 0
        ? (((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 100).toFixed(1)
        : null;

    return res.status(200).json({
      total_revenue: rev.total_revenue,
      total_subtotal: rev.total_subtotal,
      total_shipping: rev.total_shipping,
      total_orders: totalOrders,
      average_order_value:
        totalOrders > 0
          ? Math.round((rev.total_revenue / totalOrders) * 100) / 100
          : 0,
      this_month: {
        revenue: thisMonth.revenue,
        orders: thisMonth.orders,
        new_users: newUsersThisMonth,
      },
      last_month: {
        revenue: lastMonth.revenue,
        orders: lastMonth.orders,
        new_users: newUsersLastMonth,
      },
      growth: {
        revenue_percent: revenueGrowth,
        orders_percent: ordersGrowth,
        users_percent: usersGrowth,
      },
      total_users: totalUsers,
      new_users_this_month: newUsersThisMonth,
    });
  } catch (error) {
    console.error("Dashboard overview error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/**
 * GET /admin/dashboard/top-products
 * Top selling products ranked by total quantity sold.
 * Query params: ?limit=10&year=2026&status=exclude-cancelled
 */
export const getTopSellingProducts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit ?? 20, 10);
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    const statusParam = (req.query.status || "exclude-cancelled").trim().toLowerCase();

    const orderMatch = {};
    if (year) {
      orderMatch.order_date = {
        $gte: new Date(Date.UTC(year, 0, 1)),
        $lt: new Date(Date.UTC(year + 1, 0, 1)),
      };
    }
    if (statusParam === "exclude-cancelled") {
      orderMatch.status = { $ne: "Cancelled" };
    } else if (statusParam !== "all") {
      const statuses = statusParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length) orderMatch.status = { $in: statuses };
    }

    const pipeline = [
      { $match: orderMatch },
      {
        $lookup: {
          from: "order_items",
          localField: "_id",
          foreignField: "order_id",
          as: "items",
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product_id",
          total_quantity_sold: { $sum: "$items.quantity" },
          total_revenue: {
            $sum: {
              $multiply: [
                { $toDouble: "$items.price" },
                "$items.quantity",
              ],
            },
          },
          total_orders: { $sum: 1 },
        },
      },
      { $sort: { total_quantity_sold: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "product_images",
          let: { pid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$product_id", "$$pid"] }, is_primary: true } },
            { $limit: 1 },
          ],
          as: "primary_image",
        },
      },
      {
        $project: {
          _id: 0,
          product_id: "$_id",
          name: { $ifNull: ["$product.name", "Deleted Product"] },
          type: { $ifNull: ["$product.type", "Unknown"] },
          image_url: { $arrayElemAt: ["$primary_image.image_url", 0] },
          total_quantity_sold: 1,
          total_revenue: { $round: ["$total_revenue", 2] },
          total_orders: 1,
        },
      },
    ];

    const products = await Order.aggregate(pipeline);

    return res.status(200).json({
      count: products.length,
      limit,
      year: year || "all-time",
      products,
    });
  } catch (error) {
    console.error("Top selling products error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/**
 * GET /admin/dashboard/monthly-users
 * New user registrations per month for a given year.
 * Query params: ?year=2026
 */
export const getMonthlyUsers = async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year ?? now.getFullYear(), 10);
    const tz = req.query.tz || "Africa/Cairo";

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    const pipeline = [
      { $match: { created_at: { $gte: start, $lt: end } } },
      {
        $addFields: {
          monthBucket: {
            $dateTrunc: { date: "$created_at", unit: "month", timezone: tz },
          },
        },
      },
      {
        $facet: {
          monthly: [
            {
              $group: {
                _id: "$monthBucket",
                new_users: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
            {
              $addFields: {
                month: {
                  $dateToString: { date: "$_id", format: "%Y-%m", timezone: tz },
                },
              },
            },
            { $project: { _id: 0 } },
          ],
          total: [
            { $group: { _id: null, total_new_users: { $sum: 1 } } },
            { $project: { _id: 0 } },
          ],
        },
      },
    ];

    const [result] = await User.aggregate(pipeline);
    const monthly = result.monthly || [];
    const total = (result.total && result.total[0]) || { total_new_users: 0 };

    return res.status(200).json({
      year,
      timezone: tz,
      total_new_users: total.total_new_users,
      monthly,
    });
  } catch (error) {
    console.error("Monthly users error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/**
 * GET /admin/dashboard/sales-by-category
 * Total sales broken down by product category (type).
 * Query params: ?year=2026&status=exclude-cancelled
 */
export const getSalesByCategory = async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    const statusParam = (req.query.status || "exclude-cancelled").trim().toLowerCase();

    const orderMatch = {};
    if (year) {
      orderMatch.order_date = {
        $gte: new Date(Date.UTC(year, 0, 1)),
        $lt: new Date(Date.UTC(year + 1, 0, 1)),
      };
    }
    if (statusParam === "exclude-cancelled") {
      orderMatch.status = { $ne: "Cancelled" };
    } else if (statusParam !== "all") {
      const statuses = statusParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length) orderMatch.status = { $in: statuses };
    }

    const pipeline = [
      { $match: orderMatch },
      {
        $lookup: {
          from: "order_items",
          localField: "_id",
          foreignField: "order_id",
          as: "items",
        },
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$product.type", "Unknown"] },
          total_quantity_sold: { $sum: "$items.quantity" },
          total_revenue: {
            $sum: {
              $multiply: [
                { $toDouble: "$items.price" },
                "$items.quantity",
              ],
            },
          },
          total_orders: { $sum: 1 },
        },
      },
      { $sort: { total_revenue: -1 } },
      {
        $project: {
          _id: 0,
          category: "$_id",
          total_quantity_sold: 1,
          total_revenue: { $round: ["$total_revenue", 2] },
          total_orders: 1,
        },
      },
    ];

    const categories = await Order.aggregate(pipeline);

    return res.status(200).json({
      year: year || "all-time",
      categories,
    });
  } catch (error) {
    console.error("Sales by category error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

export const getMonthlyOrderTotals = async (req, res) => {
  try {
    // Query params (all optional)
    const now = new Date();
    const year = parseInt(req.query.year ?? now.getFullYear(), 10);
    const tz = req.query.tz || "Africa/Cairo"; // your default
    // status can be: "all" to include everything, or a CSV like "Pending,Shipped"
    // default excludes Cancelled
    const statusParam = (req.query.status || "exclude-cancelled")
      .trim()
      .toLowerCase();

    const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

    // Build match stage
    const match = {
      order_date: { $gte: start, $lt: end },
    };

    if (statusParam !== "all") {
      if (statusParam === "exclude-cancelled") {
        match.status = { $ne: "Cancelled" };
      } else {
        const statuses = statusParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (statuses.length) match.status = { $in: statuses };
      }
    }

    const pipeline = [
      { $match: match },

      // Normalize numeric fields if needed (they are Numbers in your schema already, but safe cast)
      {
        $addFields: {
          _total: { $toDouble: "$total_amount" },
          _subtotal: { $toDouble: "$subtotal" },
          _shipping: { $toDouble: "$shipping_cost" },
        },
      },

      // Truncate to month in the given time zone
      {
        $addFields: {
          monthBucket: {
            $dateTrunc: {
              date: "$order_date",
              unit: "month",
              timezone: tz,
            },
          },
        },
      },

      // Use a facet so we get both monthly and grand totals in one pass
      {
        $facet: {
          monthly: [
            {
              $group: {
                _id: "$monthBucket",
                orders: { $sum: 1 },
                total_amount: { $sum: "$_total" },
                subtotal: { $sum: "$_subtotal" },
                shipping_cost: { $sum: "$_shipping" },
              },
            },
            { $sort: { _id: 1 } },
            // Pretty month label like "2025-01"
            {
              $addFields: {
                month: {
                  $dateToString: {
                    date: "$_id",
                    format: "%Y-%m",
                    timezone: tz,
                  },
                },
              },
            },
            { $project: { _id: 0 } },
          ],

          grand: [
            {
              $group: {
                _id: null,
                orders: { $sum: 1 },
                total_amount: { $sum: "$_total" },
                subtotal: { $sum: "$_subtotal" },
                shipping_cost: { $sum: "$_shipping" },
              },
            },
            { $project: { _id: 0 } },
          ],
        },
      },
    ];

    const [result] = await Order.aggregate(pipeline);
    const monthly = result.monthly || [];
    const grand = (result.grand && result.grand[0]) || {
      orders: 0,
      total_amount: 0,
      subtotal: 0,
      shipping_cost: 0,
    };

    return res.status(200).json({
      year,
      timezone: tz,
      status_filter: statusParam,
      monthly, // [{ month: "2025-01", orders: N, total_amount: X, subtotal: Y, shipping_cost: Z }, ...]
      grand, // { orders, total_amount, subtotal, shipping_cost }
    });
  } catch (error) {
    console.error("Error aggregating monthly order totals:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

// ─────────────────────────────────────────────────────────
// ADMIN ALLOWLIST MANAGEMENT
// ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─────────────────────────────────────────────────────────
// VARIANT ATTRIBUTE HELPERS
// ─────────────────────────────────────────────────────────

/** Normalize an option-type list ("Size", "color ", "Charm") to ["size","color","charm"]. */
const normalizeOptionTypes = (raw) => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const k = String(item || "").trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
};

/**
 * Coerce a free-form attributes object into a clean {key: value} map where
 * keys are lower-cased and trimmed and values are trimmed strings.
 * Returns null if input is not an object.
 */
const sanitizeAttributes = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k || "").trim().toLowerCase();
    const val = String(v ?? "").trim();
    if (!key || !val) continue;
    out[key] = val;
  }
  return out;
};

/**
 * Verify every attribute key on a variant belongs to the product's
 * `option_types`. Returns an error string or null when OK.
 */
const validateVariantAttributes = (attributes, optionTypes) => {
  const allowed = new Set(optionTypes || []);
  if (allowed.size === 0) {
    if (Object.keys(attributes).length > 0) {
      return "Product has no option_types declared; variants cannot have attributes.";
    }
    return null;
  }
  if (Object.keys(attributes).length === 0) {
    return "Variant attributes are required when the product declares option_types.";
  }
  for (const key of Object.keys(attributes)) {
    if (!allowed.has(key)) {
      return `Attribute '${key}' is not part of this product's option_types.`;
    }
  }
  return null;
};

/** GET /admin/admins — list every admin email. */
export const listAdmins = async (req, res) => {
  try {
    const docs = await Admin.find({}).sort({ created_at: 1 }).lean();
    return res.status(200).json({
      count: docs.length,
      admins: docs.map((d) => ({
        id: d._id,
        email: d.email,
        added_by: d.added_by,
        created_at: d.created_at,
      })),
    });
  } catch (error) {
    console.error("listAdmins error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/** POST /admin/admins — body { email }. */
export const createAdmin = async (req, res) => {
  try {
    const rawEmail = String(req.body?.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(rawEmail)) {
      return res.status(400).json({ message: "email must be a valid email address." });
    }

    const doc = await Admin.create({
      email: rawEmail,
      added_by: req.user?.email || "unknown",
    });
    invalidateAdminCache();

    return res.status(201).json({
      message: "Admin added.",
      admin: { id: doc._id, email: doc.email, added_by: doc.added_by, created_at: doc.created_at },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Admin already exists." });
    }
    console.error("createAdmin error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/** DELETE /admin/admins/:id — refuses to delete the last remaining admin. */
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid admin id." });
    }

    const total = await Admin.countDocuments();
    if (total <= 1) {
      return res.status(400).json({
        message: "Cannot remove the last admin. Add another admin first.",
      });
    }

    const target = await Admin.findById(id);
    if (!target) {
      return res.status(404).json({ message: "Admin not found." });
    }

    // Prevent operator from locking themselves out.
    if (req.user?.email && req.user.email.toLowerCase() === target.email) {
      return res.status(400).json({
        message: "You cannot remove your own admin access.",
      });
    }

    await target.deleteOne();
    invalidateAdminCache();

    return res.status(200).json({
      message: "Admin removed.",
      deleted: { id: target._id, email: target.email },
    });
  } catch (error) {
    console.error("deleteAdmin error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/**
 * GET /me/admin-status — used by the frontend gate. Authenticated; returns
 * `{ is_admin: bool, email }` for the JWT-bearing user.
 */
export const myAdminStatus = async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) {
      return res.status(200).json({ is_admin: false, email: null });
    }
    const { isAdminEmail } = await import("../services/adminCache.service.js");
    const ok = await isAdminEmail(email);
    return res.status(200).json({ is_admin: !!ok, email });
  } catch (error) {
    console.error("myAdminStatus error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// ─────────────────────────────────────────────────────────
// PRODUCT CATEGORY MANAGEMENT
// ─────────────────────────────────────────────────────────

const normalizeCategoryName = (raw) =>
  String(raw || "")
    .trim()
    .replace(/\s+/g, " ");

/** GET /admin/categories — list every category (active or not), with product counts. */
export const listCategories = async (req, res) => {
  try {
    const [cats, counts] = await Promise.all([
      ProductCategory.find({}).sort({ sort_order: 1, name: 1 }).lean(),
      Product.aggregate([
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
    ]);
    const countByName = new Map(counts.map((c) => [String(c._id), c.count]));
    return res.status(200).json({
      count: cats.length,
      categories: cats.map((c) => ({
        id: c._id,
        name: c.name,
        sort_order: c.sort_order,
        is_active: c.is_active,
        product_count: countByName.get(c.name) || 0,
        created_at: c.created_at,
      })),
    });
  } catch (error) {
    console.error("listCategories error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/** POST /admin/categories — body { name, sort_order?, is_active? }. */

/** PUT /admin/categories/:id — body { name?, sort_order?, is_active? }. */
/** PUT /admin/categories/:id — only sort_order and is_active are editable. */
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category id." });
    }

    const current = await ProductCategory.findById(id);
    if (!current) {
      return res.status(404).json({ message: "Category not found." });
    }

    const updates = {};

    if (req.body?.sort_order !== undefined) {
      const n = Number(req.body.sort_order);
      if (!Number.isInteger(n) || n < 0) {
        return res.status(400).json({ message: "sort_order must be a non-negative integer." });
      }
      updates.sort_order = n;
    }

    if (req.body?.is_active !== undefined) {
      updates.is_active = Boolean(req.body.is_active);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    Object.assign(current, updates);
    await current.save();
    invalidateCategoryCache();

    return res.status(200).json({
      message: "Category updated.",
      category: {
        id: current._id,
        name: current.name,
        sort_order: current.sort_order,
        is_active: current.is_active,
      },
    });
  } catch (error) {
    console.error("updateCategory error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

/**
 * DELETE /admin/categories/:id — refuses to delete a category that still
 * has products attached to it (admin must move/delete those first).
 */

// ─────────────────────────────────────────────────────────
// ONE-TIME MIGRATION: legacy size/color → attributes Map
// ─────────────────────────────────────────────────────────

/**
 * POST /admin/maintenance/migrate-variant-attributes
 *
 * Backfills the new attribute-based variant schema from the legacy
 * size/color columns:
 *   1. For each ProductVariant: read raw size/color from the DB
 *      (mongoose strips them after the schema change, so we use the
 *      collection driver directly), build `attributes`, compute
 *      `attributes_key`, save.
 *   2. For each Product: derive `option_types` from the union of
 *      its variants' attribute keys.
 *   3. For each CartItem with variant_id: copy variant attributes
 *      onto cart_item.attributes (snapshot).
 *   4. For each OrderItem with variant_id (or legacy size/color):
 *      build attributes from the OrderItem's own legacy columns.
 *   5. After step 1 succeeds, $unset the legacy size/color columns
 *      from product_variants so they don't shadow future writes.
 *
 * Idempotent — running twice is a no-op.
 */
export const migrateVariantAttributes = async (req, res) => {
  const summary = {
    variants_examined: 0,
    variants_updated: 0,
    products_updated_option_types: 0,
    cart_items_updated: 0,
    order_items_updated: 0,
    legacy_fields_unset: 0,
    errors: [],
  };

  try {
    // ── 1. Variants ──
    const variantsColl = ProductVariant.collection;
    const rawVariants = await variantsColl
      .find({}, { projection: { product_id: 1, size: 1, color: 1, attributes: 1, attributes_key: 1, description: 1 } })
      .toArray();

    for (const v of rawVariants) {
      summary.variants_examined += 1;

      const hasAttrs = v.attributes && Object.keys(v.attributes).length > 0;
      const built = {};
      if (v.size) built.size = String(v.size).trim();
      if (v.color) built.color = String(v.color).trim();

      // Skip when there's nothing legacy to convert and attributes are already set.
      if (hasAttrs && Object.keys(built).length === 0) continue;

      // Merge new keys into existing attributes (don't overwrite).
      const merged = { ...(v.attributes || {}) };
      for (const [k, val] of Object.entries(built)) {
        if (!merged[k]) merged[k] = val;
      }
      const cleanAttrs = sanitizeAttributes(merged) || {};
      const key = buildAttributesKey(cleanAttrs);

      try {
        await variantsColl.updateOne(
          { _id: v._id },
          {
            $set: {
              attributes: cleanAttrs,
              attributes_key: key,
              description: v.description || "",
            },
          }
        );
        summary.variants_updated += 1;
      } catch (err) {
        summary.errors.push(`variant ${v._id}: ${err.message}`);
      }
    }

    // ── 2. Product.option_types ──
    const productsToInspect = await Product.find({}).select("_id option_types").lean();
    for (const p of productsToInspect) {
      const vDocs = await ProductVariant.find({ product_id: p._id }).select("attributes").lean();
      const keys = new Set();
      for (const v of vDocs) {
        if (v.attributes) for (const k of Object.keys(v.attributes)) keys.add(k);
      }
      const existing = Array.isArray(p.option_types) ? p.option_types : [];
      const next = [...new Set([...existing, ...keys])];
      // Sort by traditional order if recognised, then alphabetical.
      const priority = ["size", "color", "charm"];
      next.sort((a, b) => {
        const ai = priority.indexOf(a);
        const bi = priority.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      });
      if (existing.join(",") !== next.join(",")) {
        await Product.updateOne({ _id: p._id }, { $set: { option_types: next } });
        summary.products_updated_option_types += 1;
      }
    }

    // ── 3. CartItem snapshots ──
    const cartItemsColl = CartItem.collection;
    const rawCart = await cartItemsColl
      .find({}, { projection: { variant_id: 1, size: 1, color: 1, attributes: 1 } })
      .toArray();
    for (const ci of rawCart) {
      const hasAttrs = ci.attributes && Object.keys(ci.attributes).length > 0;
      let attrs = {};
      if (hasAttrs) attrs = { ...ci.attributes };
      if (ci.variant_id) {
        const v = await ProductVariant.findById(ci.variant_id).lean();
        if (v?.attributes) {
          for (const [k, val] of Object.entries(v.attributes)) {
            if (!attrs[k]) attrs[k] = val;
          }
        }
      }
      if (ci.size && !attrs.size) attrs.size = String(ci.size).trim();
      if (ci.color && !attrs.color) attrs.color = String(ci.color).trim();
      const cleanAttrs = sanitizeAttributes(attrs) || {};
      if (Object.keys(cleanAttrs).length === 0 && hasAttrs) continue;
      try {
        await cartItemsColl.updateOne({ _id: ci._id }, { $set: { attributes: cleanAttrs } });
        summary.cart_items_updated += 1;
      } catch (err) {
        summary.errors.push(`cart_item ${ci._id}: ${err.message}`);
      }
    }

    // ── 4. OrderItem snapshots ──
    const orderItemsColl = OrderItem.collection;
    const rawOrder = await orderItemsColl
      .find({}, { projection: { variant_id: 1, size: 1, color: 1, attributes: 1 } })
      .toArray();
    for (const oi of rawOrder) {
      const hasAttrs = oi.attributes && Object.keys(oi.attributes).length > 0;
      let attrs = hasAttrs ? { ...oi.attributes } : {};
      if (oi.size && !attrs.size) attrs.size = String(oi.size).trim();
      if (oi.color && !attrs.color) attrs.color = String(oi.color).trim();
      const cleanAttrs = sanitizeAttributes(attrs) || {};
      if (Object.keys(cleanAttrs).length === 0 && hasAttrs) continue;
      try {
        await orderItemsColl.updateOne({ _id: oi._id }, { $set: { attributes: cleanAttrs } });
        summary.order_items_updated += 1;
      } catch (err) {
        summary.errors.push(`order_item ${oi._id}: ${err.message}`);
      }
    }

    // ── 5. Drop legacy size/color from product_variants (and indexes) ──
    try {
      const u = await variantsColl.updateMany({}, { $unset: { size: "", color: "" } });
      summary.legacy_fields_unset = u.modifiedCount || 0;
    } catch (err) {
      summary.errors.push(`unset legacy fields: ${err.message}`);
    }
    try {
      const idx = await variantsColl.indexes();
      for (const i of idx) {
        if (i.name && i.name.includes("size_1") && i.name.includes("color_1")) {
          await variantsColl.dropIndex(i.name);
        }
      }
    } catch (err) {
      summary.errors.push(`drop legacy index: ${err.message}`);
    }

    return res.status(200).json({ message: "Migration complete.", ...summary });
  } catch (error) {
    console.error("Variant migration error:", error);
    return res.status(500).json({
      message: "Variant migration failed",
      error: error.message,
      partial: summary,
    });
  }
};
