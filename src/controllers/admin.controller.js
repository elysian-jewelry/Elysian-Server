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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Where images live (default: src/images)
const IMAGES_ROOT =
  process.env.IMAGES_DIR_ABS || path.join(__dirname, "..", "images");

// Public base url (default to your prod API)
const BASE_URL = (process.env.PUBLIC_BASE_URL || "https://elysian-api.oa.r.appspot.com").replace(/\/$/, "");

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
  "Bags",
]);

// Helpers
function urlJoinEncoded(...parts) {
  return parts
    .filter(Boolean)
    .map(p => p.split("/").map(encodeURIComponent).join("/"))
    .join("/")
    .replace(/\/{2,}/g, "/");
}
const looksPrimary = (f) =>
  ["img_1", "main", "cover", "primary"].some(k => f.toLowerCase().includes(k));

/**
 * POST /admin/rebuild-product-images
 * 1) DELETE ALL docs from product_images
 * 2) Clear images array on all products
 * 3) Scan disk, insert ALL images, set IMG_1 (or first) primary, and link to products
 */
export const rebuildAllProductImages = async (req, res) => {
  const summary = {
    imagesRoot: IMAGES_ROOT,
    baseUrl: BASE_URL,
    clearedProductImages: 0,
    productsCleared: 0,
    processedProducts: 0,
    createdImages: 0,
    updatedProducts: 0,
    missingProducts: [],
    skippedTypes: [],
    errors: [],
  };

  try {
    // Sanity: images root
    const st = await fs.stat(IMAGES_ROOT).catch(() => null);
    if (!st?.isDirectory()) {
      return res.status(400).json({
        success: false,
        message: `Images root not found: ${IMAGES_ROOT}`,
      });
    }

    // 1) Delete all from product_images
    const delRes = await ProductImage.deleteMany({});
    summary.clearedProductImages = delRes.deletedCount || 0;

    // 2) Clear images array on all products
    const clearRes = await Product.updateMany({}, { $set: { images: [] } });
    summary.productsCleared = clearRes.modifiedCount || 0;

    // 3) Walk folders: <images>/<Type>/<ProductName>/*
    const typeDirs = await fs.readdir(IMAGES_ROOT, { withFileTypes: true });

    for (const t of typeDirs) {
      if (!t.isDirectory()) continue;
      const typeName = t.name;
      if (!PRODUCT_TYPES.has(typeName)) {
        summary.skippedTypes.push(typeName);
        continue;
      }

      const typePath = path.join(IMAGES_ROOT, typeName);
      const productDirs = await fs.readdir(typePath, { withFileTypes: true });

      for (const p of productDirs) {
        if (!p.isDirectory()) continue;
        const productName = p.name;
        const productPath = path.join(typePath, productName);

        // Find product by (name, type)
        const product = await Product.findOne({ name: productName, type: typeName });
        if (!product) {
          summary.missingProducts.push(`${typeName} / ${productName}`);
          continue;
        }

        // Collect image files
        const entries = await fs.readdir(productPath, { withFileTypes: true });
        const files = entries
          .filter(e => e.isFile())
          .map(e => e.name)
          .filter(n => ALLOWED.has(path.extname(n).toLowerCase()))
          .sort();

        if (files.length === 0) continue;

        const primaryFile = files.find(looksPrimary) || files[0];

        // Build docs for insertMany
        const toInsert = files.map((filename) => {
          const rel = urlJoinEncoded("images", typeName, productName, filename);
          const image_url = `${BASE_URL}/${rel}`;
          return {
            product_id: product._id,
            image_url,
            is_primary: filename === primaryFile,
          };
        });

        // Insert all images for this product
        const created = await ProductImage.insertMany(toInsert, { ordered: true });
        summary.createdImages += created.length;

        // Link back to product.images (replace entire array)
        product.images = created.map(doc => doc._id);
        await product.save();

        summary.processedProducts += 1;
        summary.updatedProducts += 1;
      }
    }

    return res.status(200).json({ success: true, ...summary });
  } catch (err) {
    summary.errors.push(err.message);
    return res.status(500).json({ success: false, ...summary });
  }
};



export const getAllUsersLatest = async (req, res) => {
  try {
    const pipeline = [
      // Prefer created_at; fallback to createdAt; if both missing, sort by _id as tie-breaker
      { $addFields: { __sortCreated: { $ifNull: ["$created_at", "$createdAt"] } } },
      { $sort: { __sortCreated: -1, _id: -1 } },
      // Hide sensitive/internal fields
      { $project: { password: 0, __v: 0 } },
    ];

    const [users, totalUsers] = await Promise.all([
      User.aggregate(pipeline),
      User.countDocuments()
    ]);

    return res.status(200).json({
      count: totalUsers,
      users
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

export const updateProductSortOrder = async (req, res) => {
  const { category, orderedNames } = req.body;

  if (!category || !Array.isArray(orderedNames)) {
    return res.status(400).json({
      success: false,
      message: "Both 'category' and 'orderedNames[]' are required.",
    });
  }

  try {
    const notFound = [];
    const alreadyCorrect = [];
    let updatedCount = 0;

    // Update products in the provided order
    for (let i = 0; i < orderedNames.length; i++) {
      const productName = orderedNames[i];
      const product = await Product.findOne({ name: productName, type: category });

      if (!product) {
        notFound.push(`❌ Not found: '${productName}' in category '${category}'`);
        continue;
      }

      if (product.sort_order === i + 1) {
        alreadyCorrect.push(productName);
        continue;
      }

      product.sort_order = i + 1;
      await product.save();
      updatedCount++;
    }

    // Get all product names in the category
    const allCategoryProducts = await Product.find({ type: category }).select("name");
    const allProductNames = allCategoryProducts.map((p) => p.name);

    // Find products not mentioned in the orderedNames list
    const notIncluded = allProductNames.filter((name) => !orderedNames.includes(name));

    return res.status(200).json({
      success: true,
      message: `✅ Updated ${updatedCount} products in '${category}' category.`,
      updatedCount,
      notFound,
      alreadyCorrect,
      notIncludedInRequest: notIncluded,
    });
  } catch (err) {
    console.error("❌ Sort update error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error while updating sort order.",
      error: err.message,
    });
  }
};

// Controller to insert product with optional variants
export const addProductWithVariants = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      type,
      stock_quantity,
      variants // array of { size, color, price, stock_quantity }
    } = req.body;

    // Validate required fields
    if (!name || !type || typeof price !== "number") {
      return res.status(400).json({ message: "name, type, and price are required." });
    }

    // Step 1: Create the main product
    const product = new Product({
      name,
      description,
      price,
      type,
      stock_quantity: stock_quantity || 0,
    });

    await product.save();

    // Step 2: If variants exist, create and link them
    if (Array.isArray(variants) && variants.length > 0) {
      const createdVariants = await ProductVariant.insertMany(
        variants.map((variant) => ({
          ...variant,
          product_id: product._id,
        }))
      );

      product.product_variants = createdVariants.map((v) => v._id);
      await product.save();
    }

    res.status(201).json({ message: "Product created successfully", product });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

export const getAllOrdersFull = async (req, res) => {
  try {
    const ORDER_ITEMS_COLL = OrderItem.collection.name; // "order_items"
    const USERS_COLL = User.collection.name;            // "users"
    const PRODUCTS_COLL = Product.collection.name;      // "products"

    const pipeline = [
      { $sort: { order_date: -1, _id: -1 } },

      // Join user
      {
        $lookup: {
          from: USERS_COLL,
          localField: "user_id",
          foreignField: "_id",
          as: "user"
        }
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
                as: "product"
              }
            },
            { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },

            // Only keep relevant product info
            {
              $addFields: {
                product_name: "$product.name",
                product_type: "$product.type"
              }
            },
            { $project: { product: 0 } } // remove full product doc if not needed
          ],
          as: "items"
        }
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
            updated_at: 1
          }
        }
      }
    ];

    let orders = await Order.aggregate(pipeline);

    // Convert Decimal128 prices to numbers
    orders = orders.map(o => ({
      ...o,
      items: o.items.map(it => ({
        ...it,
        price: it?.price ? Number(it.price) : it.price
      }))
    }));

    return res.status(200).json({
      count: orders.length,
      orders
    });
  } catch (error) {
    console.error("Error fetching all orders with details:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};


export const updateProductQuantity = async (req, res) => {
  const { name, type, quantity } = req.body;

  if (!name || !type || typeof quantity !== "number" || !Number.isFinite(quantity)) {
    return res.status(400).json({
      message: "name, type, and quantity (finite number) are required.",
    });
  }

  try {
    // 1) Find product
    const product = await Product.findOne({ name, type });
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    // 2) Update product stock
    product.stock_quantity = quantity;
    await product.save();

    // 3) Update all variants (if any) to the same quantity
    const variantUpdateResult = await ProductVariant.updateMany(
      { product_id: product._id },
      { $set: { stock_quantity: quantity } }
    );

    // 4) (Optional) fetch variants if you want to return them
    const variants =
      variantUpdateResult.matchedCount > 0
        ? await ProductVariant.find({ product_id: product._id })
        : [];

    // 5) If quantity is 0 → remove this product from all carts
    let carts_affected = 0;
    let cart_items_deleted = 0;

    if (quantity === 0) {
      // a) Find all cart items that reference this product
      const cartItemsToRemove = await CartItem.find({
        product_id: product._id,
      });

      if (cartItemsToRemove.length > 0) {
        const cartItemIds = cartItemsToRemove.map((ci) => ci._id);
        const cartIds = [
          ...new Set(cartItemsToRemove.map((ci) => ci.cart_id.toString())),
        ];

        // b) Delete those cart items
        const deleteResult = await CartItem.deleteMany({
          _id: { $in: cartItemIds },
        });
        cart_items_deleted = deleteResult.deletedCount || 0;

        // c) Remove their references from Cart.items arrays
        await Cart.updateMany(
          { _id: { $in: cartIds } },
          { $pull: { items: { $in: cartItemIds } } }
        );

        // d) Recalculate total_price for each affected cart
        for (const cartId of cartIds) {
          const cart = await Cart.findById(cartId).populate({
            path: "items",
            populate: [
              { path: "product_id", model: "Product" },
              { path: "variant_id", model: "ProductVariant" },
            ],
          });

          if (!cart) continue;

          let newTotal = 0;

          for (const item of cart.items) {
            // Prefer variant price if present, else product price
            const price =
              item.variant_id?.price ??
              item.product_id?.price ??
              0;

            newTotal += price * item.quantity;
          }

          cart.total_price = newTotal;
          await cart.save();
        }

        carts_affected = cartIds.length;
      }
    }

    return res.status(200).json({
      message: "Stock quantity updated successfully.",
      product,
      variants,
      variants_modified: variantUpdateResult.modifiedCount || 0,
      carts_affected,
      cart_items_deleted,
    });
  } catch (error) {
    console.error("Error updating product quantity:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};



export const createPublicPromo = async (req, res) => {
  try {
    const { promo_code, discount, expiry_date } = req.body;

    if (!promo_code || !discount) {
      return res.status(400).json({ message: "promo_code and discount are required." });
    }

    const formattedCode = promo_code.trim().toUpperCase();

    // ✅ Enforce exactly 6 characters
    if (formattedCode.length !== 6) {
      return res.status(400).json({ message: "Promo code must be exactly 6 characters long." });
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
      expiry_date: expiry_date ? new Date(expiry_date) : new Date("2100-01-01")
    });

    return res.status(201).json({
      message: "Public promo code created successfully",
      promo
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
    const statusParam = (req.query.status || "exclude-cancelled").trim().toLowerCase();

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
          .map(s => s.trim())
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
        }
      },

      // Truncate to month in the given time zone
      {
        $addFields: {
          monthBucket: {
            $dateTrunc: {
              date: "$order_date",
              unit: "month",
              timezone: tz
            }
          }
        }
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
              }
            },
            { $sort: { _id: 1 } },
            // Pretty month label like "2025-01"
            {
              $addFields: {
                month: {
                  $dateToString: { date: "$_id", format: "%Y-%m", timezone: tz }
                }
              }
            },
            { $project: { _id: 0 } }
          ],

          grand: [
            {
              $group: {
                _id: null,
                orders: { $sum: 1 },
                total_amount: { $sum: "$_total" },
                subtotal: { $sum: "$_subtotal" },
                shipping_cost: { $sum: "$_shipping" },
              }
            },
            { $project: { _id: 0 } }
          ]
        }
      }
    ];

    const [result] = await Order.aggregate(pipeline);
    const monthly = result.monthly || [];
    const grand = (result.grand && result.grand[0]) || { orders: 0, total_amount: 0, subtotal: 0, shipping_cost: 0 };

    return res.status(200).json({
      year,
      timezone: tz,
      status_filter: statusParam,
      monthly,    // [{ month: "2025-01", orders: N, total_amount: X, subtotal: Y, shipping_cost: Z }, ...]
      grand       // { orders, total_amount, subtotal, shipping_cost }
    });
  } catch (error) {
    console.error("Error aggregating monthly order totals:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};
