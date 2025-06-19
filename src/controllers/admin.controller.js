import Product from "../models/product.js";
import User from "../models/User.js";
import Order from "../models/Order.js";

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
