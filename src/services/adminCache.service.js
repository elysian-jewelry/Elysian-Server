// services/adminCache.service.js
//
// In-process cache for the admin email allowlist. Every inbound admin
// request hits this — a DB round trip per call is not acceptable.
//
// The cache is invalidated by:
//   • TTL expiry (default 60 s)
//   • Explicit `invalidate()` after add/remove operations
//
// Read-after-write within the same Node process is therefore strongly
// consistent. Across multiple processes, eventual consistency is bounded
// by the TTL.

import Admin from "../models/admin.js";

const TTL_MS = 60 * 1000;

let cachedSet = null;
let cachedAt = 0;
let inflight = null;

const buildSet = async () => {
  const docs = await Admin.find({}, { email: 1 }).lean();
  return new Set(docs.map((d) => String(d.email || "").toLowerCase()));
};

/** Returns the current admin email set (lowercased). Cached. */
export const getAdminEmailSet = async () => {
  const now = Date.now();
  if (cachedSet && now - cachedAt < TTL_MS) {
    return cachedSet;
  }
  // Coalesce concurrent refresh attempts.
  if (!inflight) {
    inflight = buildSet()
      .then((set) => {
        cachedSet = set;
        cachedAt = Date.now();
        return set;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};

/** True when the given email is currently an admin. */
export const isAdminEmail = async (email) => {
  if (!email) return false;
  const set = await getAdminEmailSet();
  return set.has(String(email).toLowerCase());
};

/** Force the cache to be re-read from MongoDB on next access. */
export const invalidateAdminCache = () => {
  cachedSet = null;
  cachedAt = 0;
};
