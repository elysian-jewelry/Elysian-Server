import express from "express";
import {
  login,
  // signup,
  verifyCodeAndLogin,
  resetDatabase} from "../controllers/auth.controller.js";

import { validate } from "../middlewares/validation.middleware.js";
import { signupSchema, loginSchema, changePasswordSchema } from "../validation/users.auth.validation.js";

const router = express.Router();

// DELETE /cleanup
router.post('/reset-db', resetDatabase);

// Auth Routes
router.post("/auth/login", validate(loginSchema, "body"), login);
// router.post("/auth/signup", validate(signupSchema, "body"), signup);
router.post("/auth/verify-code-login", verifyCodeAndLogin);


export default router;
