import express from "express";
import {
  login,
  verifyCodeAndLogin,
  resetDatabase} from "../controllers/auth.controller.js";

import { validate } from "../middlewares/validation.middleware.js";
import { loginSchema } from "../validation/users.auth.validation.js";

const router = express.Router();

// DELETE /cleanup
router.post('/reset-db', resetDatabase);

// Auth Routes
router.post("/auth/login", validate(loginSchema, "body"), login);
router.post("/auth/verify-code-login", verifyCodeAndLogin);


export default router;
