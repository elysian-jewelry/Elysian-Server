// routes/user/profile.routes.js

import express from "express";
import { getUserProfile, updateUserProfile } from "../controllers/profile.controller.js";

const router = express.Router();

router.get("/profile", getUserProfile);
router.put("/profile", updateUserProfile);

export default router;


