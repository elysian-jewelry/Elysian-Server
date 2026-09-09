import express from "express";
import {
  login,
  verifyCodeAndLogin,
} from "../controllers/auth.controller.js";

import { validate } from "../middlewares/validation.middleware.js";
import { loginSchema } from "../validation/users.auth.validation.js";
import { authLimiter } from "../middlewares/rateLimit.middleware.js";

const router = express.Router({ caseSensitive: true, strict: false });

// Auth Routes
// authLimiter runs before validation so malformed floods are cheap to reject,
// and it counts issuing a code and guessing one against the same budget.
router.post("/auth/login", authLimiter, validate(loginSchema, "body"), login);
router.post("/auth/verify-code-login", authLimiter, verifyCodeAndLogin);


export default router;
