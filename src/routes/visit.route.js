import express from "express";
import { wrapRouter } from "../utils/asyncRouter.js";
import { trackVisit } from "../controllers/visit.controller.js";

// Public visit tracking. Lived in admin.route.js before the admin gate moved
// onto the /admin mount; it is not an admin route and must not sit behind it.
const router = wrapRouter(
  express.Router({ caseSensitive: true, strict: false })
);

router.get("/track-visit", trackVisit);

export default router;
