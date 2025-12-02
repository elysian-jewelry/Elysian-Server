import express from "express";
import {
  rebuildAllProductImages,
  getAllUsersLatest,
  updateProductQuantity,
  createPublicPromo,
  updateProductSortOrder,
  getAllOrdersFull,
  addProductWithVariants,
  getMonthlyOrderTotals,
} from "../controllers/admin.controller.js";
import { runMissingBirthdayReminder } from "../controllers/cron.controller.js"; // ✅ import

const router = express.Router();

router.post("/admin/sync-product-images", rebuildAllProductImages);

router.get("/admin/orders/stats/monthly", getMonthlyOrderTotals);

// Update product quantity by name and type
router.put("/admin/update-quantity", updateProductQuantity);

router.post("/admin/update-sort-order", updateProductSortOrder);

// New route to get all users and their order stats
router.get("/admin/users-with-orders", getAllOrdersFull);

router.post("/admin/add-product", addProductWithVariants);

router.post("/admin/create-public-promocode", createPublicPromo);

router.get("/admin/users", getAllUsersLatest);

// 🚀 New manual trigger route
router.post("/admin/run-missing-birthday-cron", async (req, res) => {
  try {
    const result = await runMissingBirthdayReminder();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
