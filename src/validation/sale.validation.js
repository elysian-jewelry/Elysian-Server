import Joi from "joi";
import { STORE_TIME_PATTERN } from "../utils/storeTime.js";

// Times arrive as Cairo wall-clock text from a date-and-time field
// ("2026-11-11T23:59"); utils/storeTime.js turns them into instants.
const storeTime = (label) =>
  Joi.string().pattern(STORE_TIME_PATTERN).required().messages({
    "any.required": `${label} is required`,
    "string.empty": `${label} is required`,
    "string.pattern.base": `${label} must be a date and time`,
  });

export const saleSchema = Joi.object({
  // Shown on every page; React and the email escape it. Control characters
  // (newlines, tabs) are refused so it stays one clean line everywhere.
  title: Joi.string()
    .trim()
    .min(2)
    .max(60)
    .pattern(/^[^\p{Cc}]+$/u)
    .required()
    .messages({
      "any.required": "Sale title is required",
      "string.empty": "Sale title is required",
      "string.min": "Sale title must be at least 2 characters",
      "string.max": "Sale title must not exceed 60 characters",
      "string.pattern.base": "Sale title must be a single line of text",
    }),
  percent: Joi.number().integer().min(1).max(90).required().messages({
    "any.required": "Discount percentage is required",
    "number.base": "Discount percentage must be a number",
    "number.integer": "Discount percentage must be a whole number",
    "number.min": "Discount percentage must be at least 1%",
    "number.max": "Discount percentage must not exceed 90%",
  }),
  starts_at: storeTime("Start date"),
  ends_at: storeTime("End date"),
});
