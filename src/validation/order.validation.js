// validationSchema.js
import Joi from "joi";


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
  phone_number: Joi.string()
  .pattern(/^\+201[0125]\d{8}$/)
  .required()
  .messages({
    "string.pattern.base": "Phone number must start with +2010, +2011, +2012, or +2015 and be 13 digits in total",
  }),
});
