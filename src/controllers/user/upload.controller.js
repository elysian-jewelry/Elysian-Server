// controllers/uploadController.js

import cloudinary from '../../config/cloudinaryConfig.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import Product from '../../models/product.js';
import ProductImage from '../../models/productImage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getAllImages = async (req, res) => {
  const groupedData = {};

  try {
    let nextCursor = null;

    do {
      const result = await cloudinary.api.resources({
        type: 'upload',
        resource_type: 'image',
        prefix: '',
        max_results: 500,
        next_cursor: nextCursor,
      });

      result.resources.forEach((resource) => {
        const folder = resource.folder || 'Uncategorized'; // fallback if no folder
        const imageUrl = resource.secure_url;

        if (!groupedData[folder]) {
          groupedData[folder] = [];
        }

        groupedData[folder].push(imageUrl);
      });

      nextCursor = result.next_cursor;
    } while (nextCursor);

    // format into array: [{ product: 'Marly', images: ['url1', 'url2', ...] }, ...]
    const formattedData = Object.entries(groupedData).map(([product, images]) => ({
      product,
      images,
    }));

    return res.status(200).json({
      success: true,
      message: 'Fetched product images by folder (product name)',
      data: formattedData,
    });

  } catch (error) {
    console.error('Cloudinary fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch product images from Cloudinary.',
      error: error.message,
    });
  }
};


export const uploadImages = async (req, res) => {
  const rootDir = path.resolve('C:\\Users\\samir\\Downloads\\Assets'); // Adjust path if needed
  const productTypes = fs.readdirSync(rootDir);

  try {
    for (const type of productTypes) {
      const typePath = path.join(rootDir, type);
      if (!fs.statSync(typePath).isDirectory()) continue;

      const productFolders = fs.readdirSync(typePath);

      for (const product of productFolders) {
        const productPath = path.join(typePath, product);
        if (!fs.statSync(productPath).isDirectory()) continue;

        // Get product_id from DB
        const dbProduct = await Product.findOne({
          where: {
            name: product,
            type: type
          }
        });

        if (!dbProduct) {
          console.log(`=================================================`);
          console.log(`Product not found: ${type} / ${product}`);
          console.log("=================================================");
          continue;
        }

        const imageFiles = fs.readdirSync(productPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));

        for (let i = 0; i < imageFiles.length; i++) {
          const imgFile = imageFiles[i];
          const localPath = path.join(productPath, imgFile);

          const uploadResult = await cloudinary.uploader.upload(localPath, {
            folder: `assets/${type}/${product}`
          });

          await ProductImage.create({
            product_id: dbProduct.product_id,
            image_url: uploadResult.secure_url,
            is_primary: i === 0
          });

          console.log(`Uploaded: ${type}/${product}/${imgFile}`);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'All product images uploaded and inserted to DB.'
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload and store product images.',
      error: error.message
    });
  }
};