import Product from "../models/product.js";
import User from "../models/user.js";
import Order from "../models/order.js";
import OrderItem from "../models/orderItem.js";
import ProductVariant from "../models/productVariant.js";
import PromoCode from "../models/promoCode.js";


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
            first_name: 1,
            last_name: 1,
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

// Update stock quantity for a product by name and type (Mongoose version)
export const updateProductQuantity = async (req, res) => {
  const { name, type, quantity } = req.body;

  if (!name || !type || typeof quantity !== "number") {
    return res.status(400).json({ message: "name, type, and quantity (number) are required." });
  }

  try {
    const product = await Product.findOne({ name, type });

    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    product.stock_quantity = quantity;
    await product.save();

    res.status(200).json({ message: "Stock quantity updated successfully.", product });
  } catch (error) {
    console.error("Error updating product quantity:", error);
    res.status(500).json({ message: "Internal server error", error });
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

