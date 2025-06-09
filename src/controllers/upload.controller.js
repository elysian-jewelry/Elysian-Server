import cloudinary from '../config/cloudinaryConfig.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import Product from '../models/product.js';
import ProductImage from '../models/productImage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export const syncCloudinaryImages = async (req, res) => {
  const productImages = {}; // { 'Earrings/Tiffany': [url1, url2] }
  const notFoundProducts = [];
  let nextCursor = null;

  try {
    // Step 1: Fetch Cloudinary images
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
        if (parts.length < 3) continue;

        const type = parts[1];
        const name = decodeURIComponent(parts.slice(2).join("/"));
        const key = `${type}/${name}`;

        if (!productImages[key]) productImages[key] = [];
        productImages[key].push(imageUrl);
      }

      nextCursor = result.next_cursor;
    } while (nextCursor);

    // Step 2: Link images to existing products
    const products = await Product.find();

    for (const product of products) {
      const key = `${product.type}/${product.name}`;
      const imageUrls = productImages[key];

      if (!imageUrls || imageUrls.length === 0) {
        notFoundProducts.push({ name: product.name, type: product.type });
        continue;
      }

      const imageIds = [];

      for (let i = 0; i < imageUrls.length; i++) {
        const imageDoc = await ProductImage.create({
          image_url: imageUrls[i],
          is_primary: i === 0,
          product_id: product._id,
        });
        imageIds.push(imageDoc._id);
      }

      product.images = imageIds;
      await product.save();
    }

    return res.status(200).json({
      success: true,
      message: "Cloudinary images synced to product_images collection and linked to products.",
      unmatchedProducts: notFoundProducts,
    });
  } catch (error) {
    console.error("Error syncing Cloudinary images:", error);
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
    const subFolders = fs.readdirSync(rootDir).filter(name =>
      fs.statSync(path.join(rootDir, name)).isDirectory()
    );

    if (subFolders.length === 0) {
      return res.status(400).json({ success: false, message: 'No folders found inside the provided parent folder.' });
    }

    for (const folderName of subFolders) {
      const folderPath = path.join(rootDir, folderName);
      const imageFiles = fs.readdirSync(folderPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));

      if (imageFiles.length === 0) {
        console.log(`No image files found in: ${folderName}`);
        continue;
      }

      for (let i = 0; i < imageFiles.length; i++) {
        const imgFile = imageFiles[i];
        const localPath = path.join(folderPath, imgFile);

        const uploadResult = await cloudinary.uploader.upload(localPath, {
          folder: `assets/Necklaces/${folderName}`
        });

        console.log(`Uploaded: ${folderName}/${imgFile}`);
      }
    }

    return res.status(200).json({
      success: true,
      message: `All subfolder images uploaded successfully under assets/<folder-name> in Cloudinary.`
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload images from subfolders.',
      error: error.message
    });
  }
};