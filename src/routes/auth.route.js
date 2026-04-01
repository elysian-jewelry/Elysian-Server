import express from "express";
import {
  login,
  verifyCodeAndLogin,
} from "../controllers/auth.controller.js";

import { validate } from "../middlewares/validation.middleware.js";
import { loginSchema } from "../validation/users.auth.validation.js";

const router = express.Router();

// Auth Routes
router.post("/auth/login", validate(loginSchema, "body"), login);
router.post("/auth/verify-code-login", verifyCodeAndLogin);


export default router;
