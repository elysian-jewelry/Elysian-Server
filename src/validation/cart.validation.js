// validation/cart.validation.js
import Joi from "joi";

/**
 * Upper bound on a single cart line. Shared with the controller so the edge
 * and the handler cannot disagree about what "valid" means.
 */
export const MAX_CART_ITEM_QUANTITY = 99;

/** Mongo ObjectId as it arrives over the wire. */
const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({ "string.pattern.base": "Must be a valid id" });

/**
 * POST /cart/add
 *
 * The client omits `variant_id` and `notes` entirely when unused (they are
 * spread in conditionally), so both are optional; null is accepted too since
 * the controller treats it the same as absent.
 *
 * `quantity` is left non-strict on purpose: Joi's default convert:true means a
 * numeric string like "2" still validates, so an older client that sends one
 * keeps working. The authoritative check is the Number() cast in the
 * controller — the shared validate() middleware discards Joi's converted
 * value, so this schema alone can never be what makes the type safe.
 */
export const addToCartSchema = Joi.object({
  product_id: objectId.required().messages({
    "any.required": "product_id is required",
    "string.empty": "product_id is required",
  }),
  variant_id: objectId.optional().allow(null),
  quantity: Joi.number()
    .integer()
    .min(1)
    .max(MAX_CART_ITEM_QUANTITY)
    .required()
    .messages({
      "number.base": "Quantity must be a number",
      "number.integer": "Quantity must be a whole number",
      "number.min": "Quantity must be at least 1",
      "number.max": `Quantity must not exceed ${MAX_CART_ITEM_QUANTITY}`,
      "any.required": "Quantity is required",
    }),
  notes: Joi.string().max(500).optional().allow("", null).messages({
    "string.max": "Notes must not exceed 500 characters",
  }),
});

/** PUT /cart/item/increment, PUT /cart/item/decrement, DELETE /cart/item/delete */
export const cartItemSchema = Joi.object({
  cart_item_id: objectId.required().messages({
    "any.required": "cart_item_id is required",
    "string.empty": "cart_item_id is required",
  }),
});
