import express from "express";
import {
  login,
  // signup,
  verifyCodeAndLogin,
  sendVerificationCode,
  verifyCode,
  resetPassword,
  changePassword,
  resetDatabase,
  getAllUsers
} from "../controllers/user/auth.controller.js";

import { validate } from "../middlewares/validation.middleware.js";
import { signupSchema, loginSchema, changePasswordSchema } from "../validation/users.auth.validation.js";

const router = express.Router();

// DELETE /cleanup
router.post('/reset-db', resetDatabase);

router.get("/users", getAllUsers);
// Auth Routes
router.post("/auth/login", validate(loginSchema, "body"), login);
// router.post("/auth/signup", validate(signupSchema, "body"), signup);
router.post("/auth/verify-code-login", verifyCodeAndLogin);

// Password-related
router.post("/auth/password/send-code", sendVerificationCode);
router.post("/auth/password/verify-code", verifyCode);
router.post("/auth/password/reset", resetPassword);
router.put("/auth/password/change", validate(changePasswordSchema, "body"), changePassword);

export default router;
