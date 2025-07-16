import Product from "../models/product.js";
import User from "../models/user.js";
import Order from "../models/order.js";
import ProductVariant from "../models/productVariant.js";
import fs from "fs";
import path from "path";
import ProductImage from "../models/productImage.js";

const baseFolder = "C:/Users/samir/Downloads/Elysian-Client/public/assets/Images";
const baseURL = "https://elysianjewelry.store/assets/images";
const necklacesBaseURL = "https://elysian-images.netlify.app/assets/images"; // Different URL for Necklaces


export const setPrimaryImageByNumber = async (req, res) => {
  const { productName, productType, imageNumber } = req.body;

  try {
    // Find the product by name and type
    const product = await Product.findOne({ name: productName, type: productType }).populate("images");

    if (!product) {
      return res.status(404).json({ message: "❌ Product not found." });
    }

    // Construct the expected image file name
    const targetFileName = `IMG_${imageNumber}.JPG`;

    // Find the target image by matching its URL
    const targetImage = product.images.find(img =>
      img.image_url.includes(targetFileName)
    );

    if (!targetImage) {
      return res.status(404).json({
        message: `❌ Image IMG_${imageNumber}.JPG not found for product.`,
      });
    }

    // Set all images to is_primary = false
    await ProductImage.updateMany(
      { product_id: product._id },
      { $set: { is_primary: false } }
    );

    // Set the target image to is_primary = true
    targetImage.is_primary = true;
    await targetImage.save();

    return res.status(200).json({
      message: `✅ Image IMG_${imageNumber}.JPG is now the primary image.`,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "❌ Failed to set primary image.",
      error: error.message,
    });
  }
};


export const swapProductOrder = async (req, res) => {
  const { productName1, productName2, productType } = req.body;

  try {
    // Fetch the two products by name and type
    const product1 = await Product.findOne({ name: productName1, type: productType });
    const product2 = await Product.findOne({ name: productName2, type: productType });

    if (!product1 || !product2) {
      return res.status(404).json({ message: "One or both products not found." });
    }

    // Swap their sort_order values
    const tempOrder = product1.sort_order;
    product1.sort_order = product2.sort_order;
    product2.sort_order = tempOrder;

    // Save changes
    await product1.save();
    await product2.save();

    return res.status(200).json({ message: "Products order swapped successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error swapping product order." });
  }
};


export const checkAndAddProductImages = async (req, res) => {
  try {
    const products = await Product.find();
    const results = [];

    for (const product of products) {
      const categoryFolder = path.join(baseFolder, product.type);
      const productFolder = path.join(categoryFolder, product.name);

      // Check if category and product folder exist
      if (!fs.existsSync(productFolder)) {
        results.push({
          product: product.name,
          status: "❌ Missing product folder",
        });
        continue;
      }

      // Read images in product folder
      const files = fs
        .readdirSync(productFolder)
        .filter((f) => f.toLowerCase().endsWith(".jpg") || f.toLowerCase().endsWith(".png") || f.toLowerCase().endsWith(".jpeg"));

      if (files.length === 0) {
        results.push({
          product: product.name,
          status: "⚠️ No images found in folder",
        });
        continue;
      }

      // Step 1: Remove existing ProductImages for this product
      await ProductImage.deleteMany({ product_id: product._id });

      // Step 2: Rename and add new images
      const savedImages = [];
      for (let i = 0; i < files.length; i++) {
        const ext = path.extname(files[i]).toUpperCase();
        const newName = `IMG_${i + 1}${ext}`;
        const oldPath = path.join(productFolder, files[i]);
        const newPath = path.join(productFolder, newName);

        // Rename file if needed
        if (files[i] !== newName) {
          fs.renameSync(oldPath, newPath);
        }

        // Use a different baseURL for Necklaces
        const currentBaseURL = product.type === "Necklaces" ? necklacesBaseURL : baseURL;

        const imageURL = `${currentBaseURL}/${encodeURIComponent(product.type)}/${encodeURIComponent(product.name)}/${newName}`;

        const imgDoc = await ProductImage.create({
          product_id: product._id,
          image_url: imageURL,
          is_primary: i === 0, // Set first image as primary
        });

        savedImages.push(imgDoc._id);
      }

      // Link images to product
      product.images = savedImages;
      await product.save();

      results.push({
        product: product.name,
        status: "✅ Images added successfully",
        imageCount: files.length,
      });
    }

    return res.status(200).json({
      message: "✅ Product images processed",
      details: results,
    });
  } catch (error) {
    console.error("❌ Error in checkAndAddProductImages:", error);
    res.status(500).json({ message: "Server error", error });
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

    // Step 3: Calculate total orders
    const totalOrders = ordersPerUser.reduce((sum, entry) => sum + entry.orderCount, 0);

    // Step 4: Map order counts by user_id for quick lookup
    const orderMap = {};
    ordersPerUser.forEach(entry => {
      orderMap[entry._id.toString()] = entry.orderCount;
    });

    // Step 5: Get all users and append order count
    const users = await User.find().lean(); // use .lean() to get plain objects

    const usersWithOrders = users.map(user => ({
      ...user,
      orderCount: orderMap[user._id.toString()] || 0
    }));

    res.status(200).json({
      totalUsers,
      totalOrders,
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
