// validationSchema.js
import Joi from "joi";

const egyptianPhoneRule = Joi.string()
  .pattern(/^(010|011|012|015)\d{8}$/)
  .message("Phone number must be 11 digits, starting with 010, 011, 012, or 015")
  .required();

export const checkoutSchema = Joi.object({
  address: Joi.string().min(5).required().messages({
    "string.empty": "Address cannot be empty",
    "string.min": "Address should be at least 5 characters",
  }),
  apartment_no: Joi.string().required().messages({
    "string.empty": "Apartment number cannot be empty",
  }),
  city: Joi.string().required().messages({
    "string.empty": "City cannot be empty",
  }),
  promo_code: Joi.string()
    .length(6)
    .optional()
    .allow('')
    .messages({
      "string.length": "Promo code must be exactly 6 characters",
    }),
  governorate: Joi.number()
    .required()
    .messages({
      "any.only": `Governorate must be one of options}`,
    }),
  phone_number: egyptianPhoneRule,
});
