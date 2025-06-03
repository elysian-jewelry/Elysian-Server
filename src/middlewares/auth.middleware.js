import jwt from "jsonwebtoken";

const excludedPaths = [
  "/auth/login",
  "/auth/signup",
  "/auth/password/send-code",
  "/auth/verify-code-signup",
  "/auth/password/verify-code",
  "/auth/password/reset",
  "/auth/password/change",
  "/products",
  "/products/type",
  "/reset-db",
  "/users",
  "/upload-images",
  "/get-images",
  "/products/update-quantity"
];

export const authenticateJWT = (req, res, next) => {
  
  if (excludedPaths.includes(req.path)) {
    return next(); // Skip JWT check for public routes
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access token missing or invalid" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user info to request
    console.log("Decoded JWT:", decoded); // Log the decoded token for debugging
    
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};
