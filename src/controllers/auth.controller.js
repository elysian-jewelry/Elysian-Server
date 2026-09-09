import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import { sendVerificationCodeEmail  } from "../middlewares/mailer.middleware.js"; // your custom mail sender
import { resolveRequestLocation } from "../utils/geo.js";


// In-memory store (or use Redis in production)
const verificationStore = new Map(); // email -> { code, createdAt, attempts }

// A code survives 5 minutes or 5 wrong guesses, whichever comes first.
const TTL_MS = 5 * 60_000;
const MAX_VERIFICATION_ATTEMPTS = 5;

// Hard ceiling on pending codes. The store is keyed by whatever address the
// caller supplies, and /auth/login accepts arbitrary addresses, so without a
// cap an attacker can insert unbounded distinct keys until the instance is
// OOM-killed. 10k entries is far above any real concurrent-login volume for
// this store and costs well under a megabyte.
const MAX_PENDING = 10_000;

/**
 * Drop every entry past its TTL. Expiry used to be checked only on read, so an
 * address that was never verified stayed resident for the life of the process.
 *
 * Deleting while iterating a Map is well defined: entries removed before the
 * iterator reaches them are simply never visited.
 *
 * @returns {number} how many entries were reclaimed
 */
const sweepExpired = () => {
  const cutoff = Date.now() - TTL_MS;
  let removed = 0;
  for (const [k, v] of verificationStore) {
    if (new Date(v.createdAt).getTime() < cutoff) {
      verificationStore.delete(k);
      removed += 1;
    }
  }
  return removed;
};

// .unref() keeps this timer from holding the event loop open, so the sweeper
// never delays process shutdown on an App Engine instance teardown.
setInterval(sweepExpired, 60_000).unref();

/**
 * Six-digit login code.
 *
 * crypto.randomInt is rejection-sampled and unbiased, and draws from the
 * CSPRNG. Math.random() — what this used before — is V8's xorshift128+, whose
 * 128-bit state is recoverable from a run of outputs; because anyone can
 * request codes for an address they own and read them out of their own inbox,
 * that made every other user's next code predictable.
 *
 * padStart keeps the code six characters when the draw is below 100000, so
 * the keyspace is the full 10^6 rather than the 900k the old expression gave.
 */
const generateVerificationCode = () =>
  crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

/**
 * Constant-time code comparison.
 *
 * timingSafeEqual throws unless both buffers are the same length, so the
 * length is checked first — that leaks nothing, since the code length is
 * fixed and public. What it protects is the byte-by-byte comparison, which
 * with `!==` would return early on the first wrong digit and let an attacker
 * recover the code one position at a time from response timing.
 */
const codesMatch = (expected, supplied) => {
  if (typeof supplied !== "string") return false;
  const a = Buffer.from(String(expected), "utf8");
  const b = Buffer.from(supplied, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * Store key for a pending code. Both endpoints normalise the same way so that
 * "User@Example.com" at verification finds the entry stored for the address
 * typed as "user@example.com" at login.
 */
const storeKey = (email) => String(email ?? "").trim().toLowerCase();


const generateToken = (user) => {
  return jwt.sign(
    {
      user_id: user._id,
      email: user.email,
      birthday: user.birthday,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};


export const login = async (req, res) => {
  try {
    const { email } = req.body;
    const key = storeKey(email);

    // Only a NEW key grows the map — someone re-requesting a code for an
    // address that is already pending must not be turned away. Sweep first so
    // a store full of expired entries never produces a spurious 503.
    if (!verificationStore.has(key) && verificationStore.size >= MAX_PENDING) {
      sweepExpired();
      if (verificationStore.size >= MAX_PENDING) {
        return res
          .status(503)
          .json({ message: "Service busy. Please try again shortly." });
      }
    }

    const verificationCode = generateVerificationCode();
    const createdAt = new Date();


    verificationStore.set(key, { code: verificationCode, createdAt, attempts: 0 });

    await sendVerificationCodeEmail(email, verificationCode);


     res.status(200).json({ message: 'Verification code sent to your email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const verifyCodeAndLogin = async (req, res) => {
  try {
    const { email, code } = req.body;

    // This endpoint has no Joi schema, so guard the types before the values
    // reach the store or the database.
    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ message: 'A valid email is required.' });
    }

    const key = storeKey(email);
    const stored = verificationStore.get(key);


    if (!stored) {
      return res.status(400).json({ message: 'No verification code found for this email.' });
    }

    const age = Date.now() - new Date(stored.createdAt).getTime();

    if (age > TTL_MS) {
      verificationStore.delete(key);
      return res.status(400).json({ message: 'Verification code expired. Please request a new one.' });
    }

    // Count the guess before checking it, and burn the code once the budget is
    // spent. Without this the code stayed guessable for its full 5-minute life
    // at an unlimited rate — 10^6 possibilities with no cost per wrong answer.
    stored.attempts += 1;
    if (stored.attempts > MAX_VERIFICATION_ATTEMPTS) {
      verificationStore.delete(key);
      return res.status(429).json({ message: 'Too many incorrect attempts. Please request a new code.' });
    }

    if (!codesMatch(stored.code, code)) {
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    // Remove code after verification — single use.
    verificationStore.delete(key);

    // Resolve location from request (GAE headers → IP API fallback).
    // Failure here must never block login.
    let location = { country: "Unknown", governorate: "Unknown", city: "Unknown" };
    try {
      location = await resolveRequestLocation(req);
    } catch (geoErr) {
      console.error("Login geo lookup failed:", geoErr?.message || geoErr);
    }

    // Check if user already exists
    let user = await User.findOne({ email });

    if (user) {
      // Backfill missing location fields without overwriting good data
      const updates = {};
      if ((!user.country || user.country === "Unknown") && location.country && location.country !== "Unknown") {
        updates.country = location.country;
      }
      if ((!user.governorate || user.governorate === "Unknown") && location.governorate && location.governorate !== "Unknown") {
        updates.governorate = location.governorate;
      }
      if ((!user.city || user.city === "Unknown") && location.city && location.city !== "Unknown") {
        updates.city = location.city;
      }
      if (Object.keys(updates).length > 0) {
        user = await User.findByIdAndUpdate(user._id, { $set: updates }, { new: true });
      }

      const token = generateToken(user);
      return res.status(200).json({
        message: 'Login successful!',
        token,
        user: {
          user_id: user._id,
          email: user.email,
          birthday: user.birthday,
          country: user.country,
          governorate: user.governorate,
          city: user.city,
        },
      });
    }

    // Create new user if not exists — persist location captured at signup
    const newUser = await User.create({
      email,
      country: location.country,
      governorate: location.governorate,
      city: location.city,
    });
    const token = generateToken(newUser);

    return res.status(201).json({
      message: 'User created successfully!',
      token,
      user: {
        user_id: newUser._id,
        email: newUser.email,
        country: newUser.country,
        governorate: newUser.governorate,
        city: newUser.city,
      },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
