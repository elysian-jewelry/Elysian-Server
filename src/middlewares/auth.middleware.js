import jwt from "jsonwebtoken";

const ADMIN_EMAILS = new Set([
  "samirelbatal0@gmail.com",
  "loujineetahaa@gmail.com",
]);

const publicPaths = [
  "/auth/login",
  "/auth/verify-code-login",
  "/products",
  "/products/type",
  "/reset-db",
  "/users",
  "/upload-images",
  "/sync-images",
  "/products/new-arrivals",
  "/products/featured",
  "/upload-product-images",
  "/images",
];

export const authenticateJWT = (req, res, next) => {
  if (publicPaths.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access token missing or invalid" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    if (req.path.startsWith("/admin/")) {
      if (!decoded.email || !ADMIN_EMAILS.has(decoded.email.toLowerCase())) {
        return res.status(403).json({ message: "Admin access denied." });
      }
    }

    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};
