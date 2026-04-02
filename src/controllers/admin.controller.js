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

// Mirror your Product.type enum
const PRODUCT_TYPES = new Set([
  "Earrings",
  "Necklaces",
  "Bracelets",
  "Hand Chains",
  "Back Chains",
  "Body Chains",
  "Waist Chains",
  "Sets",
  "Rings",
  "Bags",
]);

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

/** POST /admin/governorates/rates — create (single indexed write). */
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

/** PUT /admin/governorates/rates/:id — partial update by primary key. */
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

/** DELETE /admin/governorates/rates/:id — delete by primary key. */
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
 * POST /admin/sync-folder-images-to-products
 * 1) Delete all product_images docs and clear images[] on every product (no duplicate URLs).
 * 2) Scan disk and attach images per folder; primary = first file after sort.
 */
export const syncFolderImagesToProducts = async (req, res) => {
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
    }).select("_id name type");

    if (matchedProducts.length === 0) {
      return res.status(404).json({
        message: "No matching products found",
      });
    }

    const matchedIds = matchedProducts.map((p) => p._id);

    // 1️⃣ Delete variants
    await ProductVariant.deleteMany({
      product_id: { $in: matchedIds },
    });

    // 2️⃣ Delete images
    await ProductImage.deleteMany({
      product_id: { $in: matchedIds },
    });

    // 3️⃣ Delete products
    const deleteResult = await Product.deleteMany({
      _id: { $in: matchedIds },
    });

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

const ALLOWED_TYPES = [
  "Earrings",
  "Necklaces",
  "Bracelets",
  "Hand Chains",
  "Back Chains",
  "Body Chains",
  "Waist Chains",
  "Sets",
  "Bags",
  "Rings",
];

export const addProductsWithVariants = async (req, res) => {
  try {
    // 🔴 0️⃣ Ensure body is valid JSON object
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        message: "Invalid JSON body",
      });
    }
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        message: "products must be a non-empty array",
      });
    }

    // 1️⃣ Validate required fields
    for (const p of products) {
      if (!p.name || !p.type || typeof p.price !== "number") {
        return res.status(400).json({
          message: "Each product must have name, type, and price",
        });
      }

      if (!ALLOWED_TYPES.includes(p.type)) {
        return res.status(400).json({
          message: `Product ${p.name}: invalid type '${p.type}'`,
          allowedTypes: ALLOWED_TYPES,
        });
      }

      if (
        p.stock_quantity !== undefined &&
        typeof p.stock_quantity !== "number"
      ) {
        return res.status(400).json({
          message: `Product ${p.name}: 'stock_quantity' must be a number`,
        });
      }

      if (p.is_new !== undefined && typeof p.is_new !== "boolean") {
        return res.status(400).json({
          message: `Product ${p.name}: 'is_new' must be a boolean`,
        });
      }

      if (p.image_urls !== undefined) {
        if (!Array.isArray(p.image_urls)) {
          return res.status(400).json({
            message: `Product ${p.name}: 'image_urls' must be an array of URL strings`,
          });
        }
        for (let i = 0; i < p.image_urls.length; i++) {
          const u = p.image_urls[i];
          if (typeof u !== "string" || !u.trim()) {
            return res.status(400).json({
              message: `Product ${p.name}: image_urls[${i}] must be a non-empty string`,
            });
          }
          if (!isValidHttpUrl(u.trim())) {
            return res.status(400).json({
              message: `Product ${p.name}: image_urls[${i}] must be a valid http(s) URL`,
            });
          }
        }
      }
    }

    // 2️⃣ Check duplicates (name + type)
    const nameTypePairs = products.map((p) => ({
      name: p.name,
      type: p.type,
    }));

    const existingProducts = await Product.find({
      $or: nameTypePairs,
    }).select("name type");

    if (existingProducts.length > 0) {
      return res.status(409).json({
        message: "Duplicate product name in the same category",
        duplicates: existingProducts,
      });
    }

    const createdProducts = [];

    // 3️⃣ Create products one by one (variants need product_id)
    for (const p of products) {
      const product = await Product.create({
        name: p.name,
        description: p.description,
        price: p.price,
        type: p.type, // enum validates automatically
        is_new: p.is_new || false,
        stock_quantity: p.stock_quantity || 0,
        sort_order: p.sort_order || 0,
      });

      // 4️⃣ Create variants if provided
      if (Array.isArray(p.variants) && p.variants.length > 0) {
        const variants = await ProductVariant.insertMany(
          p.variants.map((v) => ({
            product_id: product._id,
            size: v.size,
            color: v.color,
            price: v.price,
            stock_quantity: v.stock_quantity || 0,
          }))
        );

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

      createdProducts.push(product);
    }

    return res.status(201).json({
      message: "Products created successfully",
      count: createdProducts.length,
      products: createdProducts,
    });
  } catch (error) {
    console.error("Bulk insert error:", error);

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
  const {
    name,
    type,
    product_quantity,
    price,
    is_new,
    new_name,
    size,
    color,
    variant_quantity,
    variant_price,
    new_size,
    new_color,
    add_variants,
  } = req.body;

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

    await product.save();

    // 2️⃣ Update ONE existing variant (find by size OR color)
    let updatedVariant = null;
    let carts_affected = 0;
    let cart_items_deleted = 0;

    const wantsVariantUpdate =
      variant_quantity !== undefined ||
      variant_price !== undefined ||
      new_size !== undefined ||
      new_color !== undefined;

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

      const hasSize = size !== undefined;
      const hasColor = color !== undefined;

      if (!hasSize && !hasColor) {
        return res.status(400).json({
          message:
            "Provide size or color to identify the variant you want to update.",
        });
      }

      const variantQuery = {
        product_id: product._id,
        ...(hasSize && { size }),
        ...(hasColor && { color }),
      };

      const setFields = {};
      if (variant_quantity !== undefined)
        setFields.stock_quantity = variant_quantity;
      if (variant_price !== undefined) setFields.price = variant_price;
      if (new_size !== undefined) setFields.size = new_size;
      if (new_color !== undefined) setFields.color = new_color;

      updatedVariant = await ProductVariant.findOneAndUpdate(
        variantQuery,
        { $set: setFields },
        { new: true }
      );

      if (!updatedVariant) {
        return res.status(404).json({
          message: "Product variant not found.",
        });
      }

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
      for (const v of add_variants) {
        if (typeof v.price !== "number" || !Number.isFinite(v.price)) {
          return res.status(400).json({
            message: "Each new variant must have a numeric price.",
          });
        }
        if (!v.size && !v.color) {
          return res.status(400).json({
            message:
              "Each new variant must have at least size or color.",
          });
        }
      }

      const newDocs = await ProductVariant.insertMany(
        add_variants.map((v) => ({
          product_id: product._id,
          size: v.size || undefined,
          color: v.color || undefined,
          price: v.price,
          stock_quantity: v.stock_quantity || 0,
        }))
      );

      addedVariants = newDocs;

      product.product_variants.push(...newDocs.map((d) => d._id));
      await product.save();
    }

    const variants = [
      ...(updatedVariant ? [updatedVariant] : []),
      ...addedVariants,
    ];

    return res.status(200).json({
      message: "Product updated successfully.",
      product,
      variants,
      variants_modified: updatedVariant ? 1 : 0,
      variants_added: addedVariants.length,
      carts_affected,
      cart_items_deleted,
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
  const { name, type, size, color } = req.body;

  if (!name || !type) {
    return res.status(400).json({
      message: "name and type are required to identify the product.",
    });
  }

  const hasSize = size !== undefined;
  const hasColor = color !== undefined;

  if (!hasSize && !hasColor) {
    return res.status(400).json({
      message: "Provide size or color to identify the variant to delete.",
    });
  }

  try {
    const product = await Product.findOne({ name, type });
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    const variantQuery = {
      product_id: product._id,
      ...(hasSize && { size }),
      ...(hasColor && { color }),
    };

    const variant = await ProductVariant.findOne(variantQuery);
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

    if (!promo_code || !discount) {
      return res
        .status(400)
        .json({ message: "promo_code and discount are required." });
    }

    const formattedCode = promo_code.trim().toUpperCase();

    // ✅ Enforce exactly 6 characters
    if (formattedCode.length !== 6) {
      return res
        .status(400)
        .json({ message: "Promo code must be exactly 6 characters long." });
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
      expiry_date: expiry_date ? new Date(expiry_date) : new Date("2100-01-01"),
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

// --- NEW: Monthly order totals with grand total ---
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
