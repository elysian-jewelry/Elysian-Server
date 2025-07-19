import cloudinary from '../config/cloudinaryConfig.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import Product from '../models/product.js';
import ProductImage from '../models/productImage.js';
import mongoose from "mongoose";
// ES Module style (for Node.js with "type": "module")
import { faker } from '@faker-js/faker';
import User from "../models/user.js";
import ProductVariant from "../models/productVariant.js";
import Order from "../models/order.js";
import OrderItem from "../models/orderItem.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



export const uploadProductImages = async (req, res) => {
  const { category, product, directory } = req.body;

  if (!category || !product || !directory) {
    return res.status(400).json({
      success: false,
      message: "category, product, and directory are required in request body.",
    });
  }

  const productDir = path.resolve(directory);

  if (!fs.existsSync(productDir) || !fs.statSync(productDir).isDirectory()) {
    return res.status(400).json({
      success: false,
      message: "Provided directory does not exist or is not a directory.",
    });
  }

  try {
    const uploadResults = [];
    const imageFiles = fs
      .readdirSync(productDir)
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)); // Include .webp too

    if (imageFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No image files found in the provided directory.",
      });
    }

    for (const imgFile of imageFiles) {
      const localPath = path.join(productDir, imgFile);

      // Upload to Cloudinary under assets/<category>/<product>
      const uploadResult = await cloudinary.uploader.upload(localPath, {
        folder: `assets/${category}/${product}`,
      });

      console.log(`✅ Uploaded: ${category}/${product}/${imgFile}`);

      uploadResults.push({
        fileName: imgFile,
        relativePath: `${category}/${product}/${imgFile}`.replace(/\\/g, "/"),
        cloudinaryUrl: uploadResult.secure_url,
      });
    }

    return res.status(200).json({
      success: true,
      message: `✅ All images for ${product} uploaded successfully.`,
      uploads: uploadResults,
    });
  } catch (error) {
    console.error("❌ Upload error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload product images.",
      error: error.message,
    });
  }
};

export const uploadImages = async (req, res) => {
  const { parentFolder } = req.body;

  if (!parentFolder) {
    return res.status(400).json({ success: false, message: 'parentFolder is required in request body.' });
  }

  const rootDir = path.resolve(`C:\\Users\\samir\\Downloads\\${parentFolder}`);

  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    return res.status(400).json({ success: false, message: 'Provided parent folder does not exist or is not a directory.' });
  }

  try {
    const uploadResults = [];

    // Recursive function to traverse folders
    const traverseAndUpload = async (currentDir, relativePath = "") => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const cloudinaryPath = path.join(relativePath).replace(/\\/g, "/"); // preserve folder structure

        if (entry.isDirectory()) {
          // Recursively traverse subdirectories
          await traverseAndUpload(fullPath, path.join(relativePath, entry.name));
        } else if (/\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
          // Upload file to Cloudinary preserving folder structure
          const uploadResult = await cloudinary.uploader.upload(fullPath, {
            folder: `assets/${cloudinaryPath}`, // Cloudinary folder structure
          });
          console.log(`✅ Uploaded: ${cloudinaryPath}/${entry.name}`);

          uploadResults.push({
            localPath: fullPath,
            cloudinaryUrl: uploadResult.secure_url,
            relativePath: `${cloudinaryPath}/${entry.name}`.replace(/\\/g, "/"),
          });
        }
      }
    };

    // Start recursive traversal from rootDir
    await traverseAndUpload(rootDir);

    return res.status(200).json({
      success: true,
      message: "✅ All images uploaded successfully with relative paths preserved.",
      uploads: uploadResults,
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload images from subfolders.',
      error: error.message,
    });
  }
};


// Utility: insert in batches to avoid memory issues
const chunkInsert = async (items, model, chunkSize = 500) => {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    try {
      await model.insertMany(chunk);
    } catch (err) {
      console.error(`❌ Failed inserting chunk into ${model.modelName}:`, err.message);
    }
  }
};

export const generateDummyData = async (req, res) => {
  try {
    const numUsers = 5000;
    const ordersPerUser = 10;
    const itemsPerOrder = 4;

    const products = await Product.find().populate("product_variants").limit(100);
    if (!products.length) {
      return res.status(400).json({ message: "No products found in DB" });
    }

    const bulkUsers = [];
    const bulkOrders = [];
    const bulkItems = [];

    for (let u = 0; u < numUsers; u++) {
      const userId = new mongoose.Types.ObjectId();
      bulkUsers.push({
        _id: userId,
        email: faker.internet.email(),
        first_name: faker.name.firstName(),
        last_name: faker.name.lastName(),
        birthday: faker.date.past(40, new Date(2005, 0, 1)),
        created_at: new Date(),
        updated_at: new Date()
      });

      for (let o = 0; o < ordersPerUser; o++) {
        const orderId = new mongoose.Types.ObjectId();
        let subtotal = 0;
        const orderItems = [];

        for (let i = 0; i < itemsPerOrder; i++) {
          const product = products[Math.floor(Math.random() * products.length)];
          const variant = product.product_variants?.length
            ? product.product_variants[Math.floor(Math.random() * product.product_variants.length)]
            : null;

          const price = variant?.price || product.price || faker.datatype.number({ min: 20, max: 300 });
          const quantity = 5;
          subtotal += price * quantity;

          orderItems.push({
            order_id: orderId,
            product_id: product._id,
            variant_id: variant?._id || null,
            size: variant?.size || null,
            quantity,
            price
          });
        }

        const discount = [0, 10, 15][Math.floor(Math.random() * 3)];
        const shipping = 90;
        const total = subtotal - (subtotal * discount / 100) + shipping;

        bulkOrders.push({
          _id: orderId,
          user_id: userId,
          order_date: new Date(),
          subtotal: +subtotal.toFixed(2),
          discount_percent: discount,
          total_amount: +total.toFixed(2),
          shipping_cost: shipping,
          address: faker.address.streetAddress(),
          apartment_no: "2222",
          city: "Cairo",
          governorate: "Cairo",
          phone_number: "01112510888",
          status: "Pending"
        });

        bulkItems.push(...orderItems);
      }

      if ((u + 1) % 500 === 0) {
        console.log(`Generated data for ${u + 1} users`);
      }
    }

    console.log("📦 Inserting users...");
    await chunkInsert(bulkUsers, User);

    console.log("📦 Inserting orders...");
    await chunkInsert(bulkOrders, Order);

    console.log("📦 Inserting order items...");
    await chunkInsert(bulkItems, OrderItem);

    return res.status(201).json({ message: "✅ Dummy data generated and inserted successfully" });

  } catch (error) {
    console.error("❌ Error generating dummy data:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const syncCloudinaryImages = async (req, res) => {
  const productImages = {}; // { 'Earrings/Tiffany': [url1, url2] }
  const notFoundProducts = [];
  let nextCursor = null;

  try {
    // 🗑 Step 1: Drop product_images collection
    await ProductImage.collection.drop();
    console.log("✅ Dropped existing product_images collection.");

    // Step 2: Fetch all Cloudinary images under assets/
    do {
      const result = await cloudinary.api.resources({
        type: "upload",
        resource_type: "image",
        prefix: "assets/",
        max_results: 1500,
        next_cursor: nextCursor,
      });

      for (const resource of result.resources) {
        const imageUrl = resource.secure_url;
        const publicId = resource.public_id;
        const folderPath = publicId.substring(0, publicId.lastIndexOf("/"));

        const parts = folderPath.split("/");
        if (parts.length < 3) continue; // Skip if folder structure doesn't match assets/type/name

        const type = decodeURIComponent(parts[1]);
        const name = decodeURIComponent(parts.slice(2).join("/"));
        const key = `${type}/${name}`;

        if (!productImages[key]) productImages[key] = [];
        productImages[key].push(imageUrl);
      }

      nextCursor = result.next_cursor;
    } while (nextCursor);

    console.log("✅ Fetched images from Cloudinary.");

    // Step 3: Loop over all products and link images
    const products = await Product.find();

    for (const product of products) {
      const key = `${product.type}/${product.name}`;
      const imageUrls = productImages[key];

      if (!imageUrls || imageUrls.length === 0) {
        console.warn(`⚠️ No images found for product: ${key}`);
        notFoundProducts.push({ name: product.name, type: product.type });
        continue;
      }

      const imageIds = [];

      // Create ProductImage docs for each image
      for (let i = 0; i < imageUrls.length; i++) {
        const imageDoc = await ProductImage.create({
          product_id: product._id,
          image_url: imageUrls[i],
          is_primary: i === 0, // Make first image primary
        });
        imageIds.push(imageDoc._id);
      }

      // Clear existing images and add new ones
      await Product.updateOne(
        { _id: product._id },
        {
          $set: {
            images: imageIds, // overwrite all previous image IDs
          },
        }
      );

      console.log(`✅ Replaced images for product: ${key}`);
    }

    return res.status(200).json({
      success: true,
      message:
        "Cloudinary images synced: product_images recreated and linked to products (replaced existing).",
      unmatchedProducts: notFoundProducts,
    });
  } catch (error) {
    console.error("❌ Error syncing Cloudinary images:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to sync Cloudinary images.",
      error: error.message,
    });
  }
};


export const getAllImages = async (req, res) => {
  const groupedData = {};

  try {
    let nextCursor = null;

    do {
      const result = await cloudinary.api.resources({
        type: 'upload',
        resource_type: 'image',
        prefix: '', // fetch everything
        max_results: 500,
        next_cursor: nextCursor,
      });

      result.resources.forEach((resource) => {
        const imageUrl = resource.secure_url;
        const fullPath = resource.public_id; // e.g., assets/Bracelets/Marly/img1
        const folder = fullPath.substring(0, fullPath.lastIndexOf('/')) || 'Uncategorized';

        if (!groupedData[folder]) {
          groupedData[folder] = [];
        }

        groupedData[folder].push(imageUrl);
      });

      nextCursor = result.next_cursor;
    } while (nextCursor);

    // format into array: [{ folder: 'assets/Bracelets/Marly', images: [...] }, ...]
    const formattedData = Object.entries(groupedData).map(([folder, images]) => ({
      folder,
      images,
    }));

    return res.status(200).json({
      success: true,
      message: 'Fetched all images grouped by full folder path',
      data: formattedData,
    });

  } catch (error) {
    console.error('Cloudinary fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch images from Cloudinary.',
      error: error.message,
    });
  }
};


