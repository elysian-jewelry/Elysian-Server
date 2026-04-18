import express from "express";
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
} from "../controllers/admin.controller.js";
import { uploadProductImagesMulter } from "../middlewares/multerProductImages.middleware.js";
import { runMissingBirthdayReminder } from "../controllers/cron.controller.js";

const router = express.Router();

router.delete("/admin/users/orders", deleteUserOrdersByEmail);

router.post(
  "/admin/products/images/sync/local-folders",
  syncFolderImagesToProducts
);

router.post(
  "/admin/products/images/sync/cloud-storage",
  syncLocalImagesToGcsAndMongo
);

router.get("/admin/orders/statistics/monthly", getMonthlyOrderTotals);

router.put(
  "/admin/products",
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

router.delete("/admin/products/variants", deleteVariant);

router.put("/admin/products/sort-order", updateProductSortOrder);

router.get("/admin/orders/users", getAllOrdersFull);

router.post(
  "/admin/products",
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

router.delete("/admin/products", deleteProductsByNameAndType);

router.get("/admin/promo-codes", getAllPromoCodes);
router.post("/admin/promo-codes", createPublicPromo);
router.delete("/admin/promo-codes/:id", deletePromoCodeById);

router.get("/admin/users", getAllUsersLatest);

router.post("/admin/delivery-rates/governorates", createGovOrderRate);
router.put("/admin/delivery-rates/governorates/:id", updateGovOrderRate);
router.delete("/admin/delivery-rates/governorates/:id", deleteGovOrderRate);

router.post("/admin/jobs/birthday-reminder", async (req, res) => {
  try {
    const result = await runMissingBirthdayReminder();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
