import express from "express";
import { wrapRouter } from "../utils/asyncRouter.js";
import {
  syncFolderImagesToProducts,
  syncLocalImagesToGcsAndMongo,
  getAllUsersLatest,
  updateProduct,
  deleteVariant,
  createPublicPromo,
  getAllPromoCodes,
  deletePromoCodeById,
  updateProductSortOrder,
  getAllOrdersFull,
  addProductsWithVariants,
  getMonthlyOrderTotals,
  deleteProductsByNameAndType,
  deleteUserOrdersByEmail,
  createGovOrderRate,
  updateGovOrderRate,
  deleteGovOrderRate,
  getDashboardOverview,
  getTopSellingProducts,
  getMonthlyUsers,
  getSalesByCategory,
  getUsersByLocation,
  getHomeSections,
  updateHomeSection,
  listAdmins,
  createAdmin,
  deleteAdmin,
  listCategories,
  updateCategory,
} from "../controllers/admin.controller.js";
import { uploadProductImagesMulter } from "../middlewares/multerProductImages.middleware.js";
import { runMissingBirthdayReminder } from "../controllers/cron.controller.js";
import { getVisitStats } from "../controllers/visit.controller.js";

// Mounted at /admin behind requireAdmin (see routes/routes.js), so every path
// below is relative and the public URLs are unchanged: "/users" here is
// GET /admin/users on the wire. Nothing that is not admin-only belongs in
// this file — putting it here is what grants it the admin gate.
const router = wrapRouter(
  express.Router({ caseSensitive: true, strict: false })
);

// ─── Admin visit stats ───
router.get("/dashboard/visits", getVisitStats);

router.delete("/users/orders", deleteUserOrdersByEmail);

router.post("/products/images/sync/local-folders", syncFolderImagesToProducts);

router.post("/products/images/sync/cloud-storage", syncLocalImagesToGcsAndMongo);

// ─── Dashboard ───
router.get("/dashboard/overview", getDashboardOverview);
router.get("/dashboard/top-products", getTopSellingProducts);
router.get("/dashboard/monthly-users", getMonthlyUsers);
router.get("/dashboard/sales-by-category", getSalesByCategory);
router.get("/dashboard/users-by-location", getUsersByLocation);

// ─── Home sections (admin-curated featured + new arrivals) ───
router.get("/home-sections", getHomeSections);
router.put("/home-sections/:section", updateHomeSection);
router.get("/dashboard/monthly-revenue", getMonthlyOrderTotals);

router.put(
  "/products",
  (req, res, next) => {
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (ct.includes("multipart/form-data")) {
      uploadProductImagesMulter(req, res, (err) => {
        if (err) {
          return res.status(400).json({
            message: err.message || "Image upload parsing failed",
          });
        }
        next();
      });
      return;
    }
    next();
  },
  updateProduct
);

router.delete("/products/variants", deleteVariant);

router.put("/products/sort-order", updateProductSortOrder);

router.get("/orders/users", getAllOrdersFull);

router.post(
  "/products",
  (req, res, next) => {
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (!ct.includes("multipart/form-data")) {
      return res.status(400).json({
        message: "This endpoint only accepts multipart/form-data",
      });
    }
    uploadProductImagesMulter(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          message: err.message || "Image upload parsing failed",
        });
      }
      next();
    });
  },
  addProductsWithVariants
);

router.delete("/products", deleteProductsByNameAndType);

router.get("/promo-codes", getAllPromoCodes);
router.post("/promo-codes", createPublicPromo);
router.delete("/promo-codes/:id", deletePromoCodeById);

router.get("/users", getAllUsersLatest);

router.post("/delivery-rates/governorates", createGovOrderRate);
router.put("/delivery-rates/governorates/:id", updateGovOrderRate);
router.delete("/delivery-rates/governorates/:id", deleteGovOrderRate);

// ─── Admin allowlist management ───
router.get("/admins", listAdmins);
router.post("/admins", createAdmin);
router.delete("/admins/:id", deleteAdmin);

// ─── Product category management (reorder + toggle only; creation/deletion is automatic) ───
router.get("/categories", listCategories);
router.put("/categories/:id", updateCategory);

router.post("/jobs/birthday-reminder", async (req, res) => {
  try {
    const result = await runMissingBirthdayReminder();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
