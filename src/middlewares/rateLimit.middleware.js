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

/**
 * Login codes per email address: 3 per hour.
 *
 * authLimiter is keyed on IP, so someone rotating IPs could still flood one
 * inbox with codes. Keying on the address closes that. Only codes that were
 * actually sent count — a request that fails is not held against the user.
 */
export const loginEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: (req) => String(req.body?.email ?? "").trim().toLowerCase(),
  handler: jsonMessage("Too many codes requested for this email. Try again in an hour."),
});

/**
 * Login codes for the whole store: 300 per day.
 *
 * Codes go out through a Gmail account, which stops sending after roughly
 * 500 messages a day and may suspend an account that keeps hitting that
 * limit. Without a store-wide ceiling, a few IPs requesting codes for random
 * addresses could use up the quota, and then no login code, order receipt or
 * birthday email would go out. Capping login mail well below the quota keeps
 * the account healthy and leaves room for the other emails.
 *
 * Headers are off so the remaining store-wide budget is not advertised.
 */
export const loginDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 300,
  standardHeaders: false,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: () => "all-login-codes",
  handler: jsonMessage("Login is busy right now. Please try again later."),
});
