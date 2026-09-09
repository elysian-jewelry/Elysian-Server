// routes/user/profile.routes.js

import express from "express";
import { getUserProfile, updateUserProfile } from "../controllers/profile.controller.js";
import { myAdminStatus } from "../controllers/admin.controller.js";

const router = express.Router({ caseSensitive: true, strict: false });

router.get("/profile", getUserProfile);
router.put("/profile", updateUserProfile);

// Authenticated but deliberately NOT admin-only: this is the endpoint the
// frontend calls to decide whether to show the admin UI, so a non-admin has
// to be able to reach it and be told "no".
router.get("/me/admin-status", myAdminStatus);

export default router;
