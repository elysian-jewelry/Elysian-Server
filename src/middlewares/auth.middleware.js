import jwt from "jsonwebtoken";
import { isAdminEmail } from "../services/adminCache.service.js";

// Paths served without a token. Matching is exact or on a whole path segment,
// so "/products" also covers "/products/type" but never "/products-admin".
const publicPaths = [
  "/auth/login",
  "/auth/verify-code-login",
  "/products",
  "/users",
  "/sync-images",
  "/images",
  "/track-visit",
];

/**
 * `norm` is already lower-cased by the caller. Express is configured for
 * case-sensitive routing, so a request whose casing differs from a real route
 * can only 404 — it can never be matched by a handler after passing here.
 */
const isPublicPath = (norm) =>
  publicPaths.some((p) => norm === p || norm.startsWith(p + "/"));

export const authenticateJWT = async (req, res, next) => {
  const norm = req.path.toLowerCase();

  if (isPublicPath(norm)) {
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

  return next();
};

/**
 * Admin gate.
 *
 * Mounted on the admin router itself (see routes/routes.js), NOT matched
 * against a URL string here. That is the point: every route reachable through
 * the /admin mount is covered structurally, so neither a new route nor an
 * unusual spelling of the URL can route around it. The previous
 * `req.path.startsWith("/admin/")` test was case-sensitive while Express
 * route matching was not, which let `/ADMIN/...` skip the check entirely.
 *
 * Runs after authenticateJWT, so req.user is already populated.
 */
export const requireAdmin = async (req, res, next) => {
  const email = req.user?.email;

  try {
    const ok = email && (await isAdminEmail(email));
    if (!ok) {
      return res.status(403).json({ message: "Admin access denied." });
    }
  } catch (err) {
    console.error("Admin check failed:", err);
    return res.status(500).json({ message: "Admin verification failed." });
  }

  return next();
};
