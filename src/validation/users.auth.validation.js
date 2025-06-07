import Joi from "joi";

const passwordRule = Joi.string()
  .min(8)
  .pattern(
    new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$")
  )
  .message(
    "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character."
  )
  .required();

export const changePasswordSchema = Joi.object({
  old_password: passwordRule,
  new_password: passwordRule
});



export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: passwordRule,
});

export const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: passwordRule,
  first_name: Joi.string().required(),
  last_name: Joi.string().required(),
  birthday: Joi.date().iso().required(), 
});


