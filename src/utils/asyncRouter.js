import { asyncHandler } from "./asyncHandler.js";

const ROUTE_METHODS = ["get", "post", "put", "patch", "delete", "all", "use"];

/**
 * Wrap every handler registered on a router in asyncHandler.
 *
 * Done at the router level rather than by hand at each call site so that no
 * registration can be missed and routes added later are covered automatically
 * — an unwrapped async handler that rejects would terminate the process.
 *
 * asyncHandler is a no-op for synchronous handlers (Promise.resolve on a
 * non-promise return value), so wrapping middleware such as validate() or the
 * multer shim is harmless.
 *
 * @param {import("express").Router} router
 * @returns {import("express").Router} the same router, with wrapped methods
 */
export const wrapRouter = (router) => {
  for (const method of ROUTE_METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) =>
      original(...args.map((a) => (typeof a === "function" ? asyncHandler(a) : a)));
  }
  return router;
};

export default wrapRouter;
