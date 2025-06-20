import Product from "../models/product.js";
import User from "../models/user.js";
import Order from "../models/order.js";
import ProductVariant from "../models/productVariant.js";

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


export const getAllUsersWithOrderStats = async (req, res) => {
  try {
    // Step 1: Get user count
    const totalUsers = await User.countDocuments();

    // Step 2: Aggregate orders per user
    const ordersPerUser = await Order.aggregate([
      {
        $group: {
          _id: "$user_id",
          orderCount: { $sum: 1 }
        }
      }
    ]);

    // Step 3: Map order counts by user_id for quick lookup
    const orderMap = {};
    ordersPerUser.forEach(entry => {
      orderMap[entry._id.toString()] = entry.orderCount;
    });

    // Step 4: Get all users and append order count
    const users = await User.find().lean(); // use .lean() to get plain objects

    const usersWithOrders = users.map(user => ({
      ...user,
      orderCount: orderMap[user._id.toString()] || 0
    }));

    res.status(200).json({
      totalUsers,
      users: usersWithOrders
    });
  } catch (error) {
    console.error("Error fetching users with order stats:", error);
    res.status(500).json({ message: "Internal server error", error });
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
