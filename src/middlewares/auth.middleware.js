import jwt from "jsonwebtoken";
import { isAdminEmail } from "../services/adminCache.service.js";

const publicPaths = [
  "/auth/login",
  "/auth/verify-code-login",
  "/products",
  "/products/type",
  "/users",
  "/sync-images",
  "/products/new-arrivals",
  "/products/featured",
  "/products/categories",
  "/images",
  "/track-visit",
];

export const authenticateJWT = async (req, res, next) => {
  if (publicPaths.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access token missing or invalid" });
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(403).json({ message: "Invalid or expired token" });
  }

  req.user = decoded;

  if (req.path.startsWith("/admin/")) {
    try {
      const ok = decoded.email && (await isAdminEmail(decoded.email));
      if (!ok) {
        return res.status(403).json({ message: "Admin access denied." });
      }
    } catch (err) {
      console.error("Admin check failed:", err);
      return res.status(500).json({ message: "Admin verification failed." });
    }
  }

  return next();
};
