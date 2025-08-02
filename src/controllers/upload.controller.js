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
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));

    if (imageFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No image files found in the provided directory.",
      });
    }

    let imageCounter = 1;

    for (const imgFile of imageFiles) {
      const localPath = path.join(productDir, imgFile);

      // Rename image to IMG_n for Cloudinary
      const newFileName = `IMG_${imageCounter}`;
      imageCounter++;

      const uploadResult = await cloudinary.uploader.upload(localPath, {
        folder: `assets/${category}/${product}`,
        public_id: newFileName, // 👈 This ensures IMG_1, IMG_2 naming
      });

      console.log(`✅ Uploaded: ${category}/${product}/${newFileName}`);

      uploadResults.push({
        originalFile: imgFile,
        cloudinaryName: newFileName,
        cloudinaryUrl: uploadResult.secure_url,
        relativePath: `${category}/${product}/${newFileName}`.replace(/\\/g, "/"),
      });
    }

    return res.status(200).json({
      success: true,
      message: `✅ All images for ${product} uploaded successfully with IMG_n names.`,
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

    // Keep track of image counters per product folder
    const imageCounters = {};

    const traverseAndUpload = async (currentDir, relativePath = "") => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const cloudinaryPath = path.join(relativePath).replace(/\\/g, "/");

        if (entry.isDirectory()) {
          await traverseAndUpload(fullPath, path.join(relativePath, entry.name));
        } else if (/\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
          // Initialize counter for this product folder
          if (!imageCounters[cloudinaryPath]) {
            imageCounters[cloudinaryPath] = 1;
          }

          // Rename image to IMG_n format
          const newFileName = `IMG_${imageCounters[cloudinaryPath]}`;
          imageCounters[cloudinaryPath]++;

          const uploadResult = await cloudinary.uploader.upload(fullPath, {
            folder: `assets/${cloudinaryPath}`,
            public_id: newFileName, // This ensures Cloudinary saves it as IMG_1, IMG_2, etc.
          });

          console.log(`✅ Uploaded: ${cloudinaryPath}/${newFileName}`);

          uploadResults.push({
            localPath: fullPath,
            cloudinaryUrl: uploadResult.secure_url,
            relativePath: `${cloudinaryPath}/${newFileName}`,
          });
        }
      }
    };

    await traverseAndUpload(rootDir);

    return res.status(200).json({
      success: true,
      message: "✅ All images uploaded successfully with sequential names.",
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
      let imageUrls = productImages[key];

      if (!imageUrls || imageUrls.length === 0) {
        console.warn(`⚠️ No images found for product: ${key}`);
        notFoundProducts.push({ name: product.name, type: product.type });
        continue;
      }

      // Sort imageUrls based on IMG_n naming
      imageUrls.sort((a, b) => {
        const extractIndex = (url) => {
          const match = url.match(/IMG_(\d+)\.(webp|jpg|jpeg|png)/i);
          return match ? parseInt(match[1]) : Infinity;
        };
        return extractIndex(a) - extractIndex(b);
      });

      const imageIds = [];

      for (const url of imageUrls) {
        const isPrimary = url.endsWith("/IMG_1.webp") || url.includes("/IMG_1.");
        
        const imageDoc = await ProductImage.create({
          product_id: product._id,
          image_url: url,
          is_primary: isPrimary,
        });

        imageIds.push(imageDoc._id);
      }

      await Product.updateOne(
        { _id: product._id },
        {
          $set: {
            images: imageIds,
          },
        }
      );

      console.log(`✅ Synced images for product: ${key}`);
    }

    return res.status(200).json({
      success: true,
      message: "✅ Cloudinary images synced and linked to products in order (IMG_1 primary).",
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



