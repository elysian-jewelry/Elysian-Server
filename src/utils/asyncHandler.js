/**
 * Funnel async route rejections into Express.
 *
 * Express 4 does not await handler return values, so a rejected promise from
 * an `async (req, res)` handler is never seen by the error middleware. Since
 * Node 15 an unhandled rejection terminates the process by default, which on a
 * single-instance App Engine service means one bad request takes the whole API
 * down. Wrapping a handler routes that rejection to next() instead.
 *
 * Express 5 does this natively; this wrapper can be removed on that upgrade.
 *
 * @param {Function} fn async (or sync) Express handler
 * @returns {Function} handler whose rejections reach the error middleware
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
