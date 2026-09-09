// validationSchema.js
import Joi from "joi";

// Character classes for free-text order fields.
//
// \p{Zs} is "space separator" — a plain space or NBSP, but deliberately NOT
// tab, CR or newline: those are spreadsheet formula leads and let an attacker
// forge extra visual rows in the operations sheet, so they are rejected here.
//
// \p{L}/\p{M} cover letters and combining marks in every script, so Arabic
// names and addresses are accepted. The client form currently applies no
// character rule at all to address/apartment/city, so anything stricter than
// this would reject orders the checkout page happily submits.
//
// \p{P} is all punctuation in any script — ASCII "," "." "-" "/" "#" "&" "()"
// as well as the Arabic comma "،" — but NOT the math symbols "=" and "+",
// which is what keeps a formula out of the cell in the first place.
//
// The leading (?![=+\-@]) guard rejects the four spreadsheet formula leads at
// position 0. "=" and "+" are already outside both classes as math symbols,
// but "@" and "-" are punctuation and would otherwise be allowed, so "@SUM(..)"
// would reach the sheet and lean entirely on sanitizeCell to defuse it. This
// stops it one layer earlier, at the edge.
const NAME_PATTERN = /^(?![=+\-@])[\p{L}\p{M}\p{Zs}'\-.]+$/u;
const TEXT_PATTERN = /^(?![=+\-@])[\p{L}\p{M}\p{N}\p{P}\p{Zs}]+$/u;

// .trim() runs under Joi's default convert:true, so it normalises before the
// length and pattern checks — which is what stops a whitespace-only name from
// satisfying min(2). It does not mutate req.body: the shared validate()
// middleware keeps only `error` and discards the converted value.

export const checkoutSchema = Joi.object({
  address: Joi.string().trim().min(5).max(200).pattern(TEXT_PATTERN).required().messages({
    "string.empty": "Address cannot be empty",
    "string.min": "Address should be at least 5 characters",
    "string.max": "Address must not exceed 200 characters",
    "string.pattern.base": "Address contains characters that are not allowed",
  }),
  apartment_no: Joi.string().trim().min(1).max(100).pattern(TEXT_PATTERN).required().messages({
    "string.empty": "Apartment number cannot be empty",
    "string.max": "Apartment number must not exceed 100 characters",
    "string.pattern.base": "Apartment number contains characters that are not allowed",
  }),
  city: Joi.string().trim().min(2).max(100).pattern(TEXT_PATTERN).required().messages({
    "string.empty": "City cannot be empty",
    "string.min": "City should be at least 2 characters",
    "string.max": "City must not exceed 100 characters",
    "string.pattern.base": "City contains characters that are not allowed",
  }),
  promo_code: Joi.string()
    .length(6)
    .optional()
    .allow('')
    .messages({
      "string.length": "Promo code must be exactly 6 characters",
    }),
    first_name: Joi.string()
    .trim()
    .min(2)
    .max(60)
    .pattern(NAME_PATTERN)
    .required()
    .messages({
      "string.empty": "First name must be included",
      "string.min": "First name must be at least 2 characters",
      "string.max": "First name must not exceed 60 characters",
      "string.pattern.base": "First name may only contain letters, spaces, hyphens and apostrophes",
    }),
    last_name: Joi.string()
    .trim()
    .min(2)
    .max(60)
    .pattern(NAME_PATTERN)
    .required()
    .messages({
      "string.empty": "Last name must be included",
      "string.min": "Last name must be at least 2 characters",
      "string.max": "Last name must not exceed 60 characters",
      "string.pattern.base": "Last name may only contain letters, spaces, hyphens and apostrophes",
    }),
  governorate: Joi.number()
    .required()
    .messages({
      "any.only": `Governorate must be one of options}`,
    }),
  phone_number: Joi.string()
  .pattern(/^\+201[0125]\d{8}$/)
  .required()
  .messages({
    "string.pattern.base": "Phone number must start with +2010, +2011, +2012, or +2015 and be 13 digits in total",
  }),
});
