// validationSchema.js
import Joi from "joi";

// Character classes for free-text order fields.
//
// \p{Zs} is "space separator" — a plain space or NBSP, but deliberately NOT
// tab, CR or newline: those are spreadsheet formula leads and let an attacker
// forge extra visual rows in the operations sheet, so they are rejected here.
//
// \p{L}/\p{M} cover letters and combining marks in every script, so Arabic
// names and addresses are accepted. The checkout form applies this same rule
// to every address field (Payment.tsx), so keep the two in step.
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

// Roughly Egypt's bounding box. The store only delivers in Egypt, so a pin
// outside it is a mistake or a hand-made request.
const EGYPT_LAT = { min: 21.5, max: 32 };
const EGYPT_LNG = { min: 24.5, max: 37.5 };

// Checkouts from the current site send the map pin (`location`) together
// with building and floor. A page opened before that release sends neither,
// so those fields are only required once a pin is present; that keeps
// customers mid-checkout during a deploy from being rejected.
const requiredWithPin = (schema) =>
  schema.when("location", { is: Joi.exist(), then: Joi.required(), otherwise: Joi.optional() });

export const checkoutSchema = Joi.object({
  // The street line.
  address: Joi.string().trim().min(5).max(200).pattern(TEXT_PATTERN).required().messages({
    "string.empty": "Street name cannot be empty",
    "string.min": "Street name should be at least 5 characters",
    "string.max": "Street name must not exceed 200 characters",
    "string.pattern.base": "Street name contains characters that are not allowed",
  }),
  building_no: requiredWithPin(
    Joi.string().trim().min(1).max(50).pattern(TEXT_PATTERN)
  ).messages({
    "any.required": "Building number is required",
    "string.empty": "Building number cannot be empty",
    "string.max": "Building number must not exceed 50 characters",
    "string.pattern.base": "Building number contains characters that are not allowed",
  }),
  floor_no: requiredWithPin(
    Joi.string().trim().min(1).max(20).pattern(TEXT_PATTERN)
  ).messages({
    "any.required": "Floor is required",
    "string.empty": "Floor cannot be empty",
    "string.max": "Floor must not exceed 20 characters",
    "string.pattern.base": "Floor contains characters that are not allowed",
  }),
  apartment_no: Joi.string().trim().min(1).max(100).pattern(TEXT_PATTERN).required().messages({
    "string.empty": "Apartment number cannot be empty",
    "string.max": "Apartment number must not exceed 100 characters",
    "string.pattern.base": "Apartment number contains characters that are not allowed",
  }),
  landmark: Joi.string().trim().max(150).pattern(TEXT_PATTERN).allow("", null).optional().messages({
    "string.max": "Landmark must not exceed 150 characters",
    "string.pattern.base": "Landmark contains characters that are not allowed",
  }),
  location: Joi.object({
    lat: Joi.number().min(EGYPT_LAT.min).max(EGYPT_LAT.max).required(),
    lng: Joi.number().min(EGYPT_LNG.min).max(EGYPT_LNG.max).required(),
  })
    .optional()
    .messages({
      "number.base": "The delivery pin must have numeric coordinates",
      "number.min": "The delivery pin must be inside Egypt",
      "number.max": "The delivery pin must be inside Egypt",
      "any.required": "The delivery pin needs both latitude and longitude",
      "object.unknown": "The delivery pin may only contain lat and lng",
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
