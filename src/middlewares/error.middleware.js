/**
 * Terminal error handler.
 *
 * Registered last in app.js. Express identifies an error handler by its arity,
 * so all four parameters must stay declared even though `next` is unused.
 *
 * Client-facing rules:
 *   • 4xx keeps its message — those describe what the caller did wrong.
 *   • 5xx is always the same generic string. Mongoose and driver errors carry
 *     collection names, index names, validator details and duplicate-key
 *     values; those go to the server log, never to the response.
 *
 * The previous version of this file used `module.exports` inside a package
 * declaring "type": "module", so importing it would have thrown — nothing did,
 * and the app ran with no error handler at all.
 */
export const ErrorMiddleware = (error, req, res, next) => { // eslint-disable-line no-unused-vars
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
      ? error.statusCode
      : 500;

  // Full detail server-side, where it is useful and not exposed.
  console.error(
    `[${req.method}] ${req.originalUrl} >> ${status}`,
    error?.stack || error
  );

  // Never leak an internal message. A 4xx message is safe because it was
  // written for the caller; a 5xx message was not.
  const message =
    status < 500 && typeof error?.message === "string" && error.message
      ? error.message
      : "Internal server error";

  if (res.headersSent) {
    return next(error);
  }

  return res.status(status).json({ message });
};

/** 404 for any request that matched no route. Registered just before the handler above. */
export const NotFoundMiddleware = (req, res) =>
  res.status(404).json({ message: "Not found" });

export default ErrorMiddleware;
