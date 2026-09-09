// middlewares/rateLimit.middleware.js
//
// Request ceilings. Counters live in this process's memory, which is correct
// while app.yaml pins the service to a single instance — but it is also the
// reason those limits become per-instance the moment `max_instances` is
// raised. Move the store to Redis at the same time as that change.

import rateLimit from "express-rate-limit";

/** 429 responses in the same JSON shape as the rest of the API. */
const jsonMessage = (message) => (req, res) =>
  res.status(429).json({ message });

/**
 * Broad ceiling applied to everything that reaches the instance, including
 * the /images static tree that is still served in-process. Sized well above
 * real browsing (a single product page pulls ~20 images) and well below what
 * it takes to saturate one App Engine worker.
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: jsonMessage("Too many requests. Please slow down."),
});

/**
 * Login and code verification. Email possession is the only authentication
 * factor here, so both issuing a code and guessing one have to be expensive:
 * this caps an IP at 5 attempts per 15 minutes across both endpoints.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: jsonMessage("Too many attempts. Try again in 15 minutes."),
});
