import express from "express";
import {
  rebuildAllProductImages,
  getAllUsersLatest,
  updateProduct,
  createPublicPromo,
  updateProductSortOrder,
  getAllOrdersFull,
  addProductsWithVariants,
  getMonthlyOrderTotals,
  deleteProductsByNameAndType,
  deleteUserOrdersByEmail
} from "../controllers/admin.controller.js";
import { runMissingBirthdayReminder } from "../controllers/cron.controller.js"; 

const router = express.Router();

router.delete(
  "/admin/delete-user-orders-by-email",
  deleteUserOrdersByEmail
);

router.post("/admin/sync-product-images", rebuildAllProductImages);

router.get("/admin/orders/stats/monthly", getMonthlyOrderTotals);

// Update product quantity by name and type
router.put("/admin/update-product", updateProduct);

router.post("/admin/update-sort-order", updateProductSortOrder);

// New route to get all users and their order stats
router.get("/admin/users-with-orders", getAllOrdersFull);

router.post("/admin/add-products", addProductsWithVariants);

router.delete("/admin/delete-products", deleteProductsByNameAndType);

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
