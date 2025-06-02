import express from "express";
import { uploadImages, getAllImages } from "../controllers/user/upload.controller.js";

const router = express.Router();


// Route to trigger image upload
router.get('/upload-images', uploadImages);
router.get('/get-images', getAllImages);

export default router;


