// validation/admin.validation.js
import Joi from "joi";

/**
 * Calendar-date-only birthday as it arrives over the wire: "YYYY-MM-DD".
 *
 * Shared with the controller so the edge and the handler agree on the shape.
 * The pattern only checks the SHAPE — "2024-02-30" passes here and is rejected
 * by the controller's real-calendar check, which is also where the age bounds
 * live.
 */
export const BIRTHDAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * PUT /admin/users/birthday
 *
 * Both fields are required strings. Requiring a *string* is what makes the
 * later `User.findOne({ email })` safe: an object such as `{ "$ne": null }`
 * fails `Joi.string()` and never reaches the query.
 *
 * `trim()` / `lowercase()` affect validation only — the shared validate()
 * middleware discards Joi's converted value — so the controller normalizes
 * the email again before it is used.
 */
export const updateUserBirthdaySchema = Joi.object({
  email: Joi.string()
    .trim()
    .lowercase()
    .email({ tlds: { allow: false } })
    .max(254)
    .required()
    .messages({
      "string.base": "Email must be a string.",
      "string.empty": "Email is required.",
      "string.email": "Please enter a valid email address.",
      "string.max": "Email must not exceed 254 characters.",
      "any.required": "Email is required.",
    }),
  birthday: Joi.string()
    .trim()
    .pattern(BIRTHDAY_PATTERN)
    .required()
    .messages({
      "string.base": "Birthday must be a string.",
      "string.empty": "Birthday is required.",
      "string.pattern.base": "Birthday must be in YYYY-MM-DD format.",
      "any.required": "Birthday is required.",
    }),
});
