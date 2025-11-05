import Joi from "joi";

const passwordRule = Joi.string()
  .min(8)
  .message(
    "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character."
  )
  .required();


export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  // password: passwordRule,
});



