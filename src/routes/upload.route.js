import express from "express";
import { uploadImages, getAllImages, syncCloudinaryImages, generateDummyData } from "../controllers/upload.controller.js";

const router = express.Router();


// Route to trigger image upload
router.post('/upload-images', uploadImages);
router.get('/get-images', getAllImages);
router.post('/sync-images', syncCloudinaryImages);

router.post("/generate-dummy-data", generateDummyData);

export default router;


