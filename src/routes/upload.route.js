import express from "express";
import {uploadProductImages, uploadImages, syncCloudinaryImages } from "../controllers/upload.controller.js";

const router = express.Router();


// Route to trigger image upload
router.post('/upload-images', uploadImages);
router.post('/upload-product-images', uploadProductImages);
router.post('/sync-images', syncCloudinaryImages);

export default router;


