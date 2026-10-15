import express from "express";
import { wrapRouter } from "../utils/asyncRouter.js";
import {
  login,
  verifyCodeAndLogin,
} from "../controllers/auth.controller.js";

import { validate } from "../middlewares/validation.middleware.js";
import { loginSchema } from "../validation/users.auth.validation.js";
import {
  authLimiter,
  loginEmailLimiter,
  loginDailyLimiter,
} from "../middlewares/rateLimit.middleware.js";

const router = wrapRouter(
  express.Router({ caseSensitive: true, strict: false })
);

// Auth Routes
// authLimiter runs before validation so malformed floods are cheap to reject,
// and it counts issuing a code and guessing one against the same budget.
// The two login limiters run after validation, so they only ever see a valid
// email: one caps codes per address, the other caps codes store-wide so the
// Gmail sending quota can't be drained.
router.post(
  "/auth/login",
  authLimiter,
  validate(loginSchema, "body"),
  loginEmailLimiter,
  loginDailyLimiter,
  login
);
router.post("/auth/verify-code-login", authLimiter, verifyCodeAndLogin);


export default router;
