import Joi from "joi";

const INTERNAL_EMAILS = [
  "elysian.jewelry.eg@gmail.com",

];

export const loginSchema = Joi.object({
  email: Joi.string()
    .trim()
    .lowercase()
    .email({ tlds: { allow: false } })
    .max(254)
    .invalid(...INTERNAL_EMAILS)
    .required()
    .messages({
      "string.base": "Email must be a string.",
      "string.empty": "Email is required.",
      "string.email": "Please enter a valid email address.",
      "string.max": "Email must not exceed 254 characters.",
      "any.invalid": "This email cannot be used for customer verification.",
      "any.required": "Email is required.",
    }),
});