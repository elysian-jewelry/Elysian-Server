import { google } from "googleapis";
import Order from "../models/order.js";
import OrderItem from "../models/orderItem.js";
import Cart from "../models/cart.js";
import CartItem from "../models/cartItem.js";
import Product from "../models/product.js";
import ProductVariant from "../models/productVariant.js";
import ProductImage from "../models/productImage.js";
import PromoCode from "../models/promoCode.js";

import GovOrderRate from "../models/govOrderRate.js";
import { sendOrderConfirmationEmail } from "../middlewares/mailer.middleware.js";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});


/**
 * GET /public/governorates
 * Returns: [{ id, name, cost }, ...]
 */
export const listGovernorates = async (_req, res, next) => {
  try {
    const docs = await GovOrderRate.find({}, { name: 1, cost: 1 })
      .sort({ _id: 1 }) // ascending by id
      .lean();

    const governorates = docs.map((d) => ({
      id: d._id, // expose numeric id
      name: d.name,
      cost: d.cost,
    }));

    res.status(200).json({ count: governorates.length, governorates });
  } catch (err) {
    next(err);
  }
};

/**
 * Has this user already redeemed this public promo code?
 *
 * `used_by` is an array of ObjectIds and `user_id` arrives as a string from
 * the JWT, so both `includes(user_id)` and `includes(new ObjectId(user_id))`
 * are always false — the first compares a string to an object, the second
 * compares two distinct object references. Stringifying both sides is what
 * makes the comparison actually work.
 */
const hasUsedPromo = (promo, user_id) =>
  (promo?.used_by || []).some((id) => String(id) === String(user_id));

// POST /api/promo/validate
export const validatePromoCode = async (req, res, next) => {
  try {
    const { promo_code } = req.body;
    const user_id = req.user.user_id;

    if (!promo_code) {
      return res.status(400).json({ message: "Promo code is required" });
    }

    const formattedCode = promo_code.trim().toUpperCase();
    const objectId = new mongoose.Types.ObjectId(user_id);

    // Compare against the current instant, exactly as createOrder does below.
    // The previous midnight-in-process-TZ comparison let this endpoint accept
    // a code that checkout would then reject as expired.
    const promo = await PromoCode.findOne({
      promo_code: formattedCode,
      expiry_date: { $gte: new Date() },
      $or: [
        { user_id: objectId }, // private promo
        { is_public: true }, // public promo
      ],
    });

    if (!promo) {
      return res
        .status(404)
        .json({ message: "Promo code is invalid or expired" });
    }

    // check if public promo already used by this user
    //
    // used_by holds ObjectId instances. includes() compares with SameValueZero,
    // so an ObjectId built here never equals a stored one (different objects)
    // and a string never equals an ObjectId — the guard was always false and
    // every public code was infinitely reusable. Compare the string forms.
    if (promo.is_public && hasUsedPromo(promo, user_id)) {
      return res
        .status(400)
        .json({ message: "You have already used this promo code." });
    }

    return res.status(200).json({
      message: "Promo code is valid",
      discount: promo.discount,
    });
  } catch (error) {
    console.error("Error validating promo code:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


// A checkout holds its cart for at most this long. A real checkout finishes
// in well under a second; the limit only matters if the server dies in the
// middle of one, so that the cart can't stay locked forever.
const CHECKOUT_LOCK_MS = 2 * 60 * 1000;

// Money is added up in whole piastres (1 EGP = 100 piastres), where integer
// math is exact, and turned back into pounds only for storing and showing.
// Plain float math stored totals like 559.9745 or 0.30000000000000004.
const toPiastres = (amount) => Math.round(parseFloat(amount) * 100);
const toPounds = (piastres) => piastres / 100;

export const checkout = async (req, res, next) => {
  const lockedAt = new Date();
  let cart = null;

  try {
    const user_id = req.user.user_id;
    const {
      address,
      apartment_no,
      city,
      governorate,
      phone_number,
      promo_code,
      first_name,
      last_name,
    } = req.body;

    // Step 1 — lock the cart. Only one checkout can run on a cart at a time,
    // so two requests sent together (a double-click, or a script) can't both
    // read the same cart and promo code and each place an order.
    cart = await Cart.findOneAndUpdate(
      {
        user_id,
        $or: [
          { checkout_locked_at: null },
          { checkout_locked_at: { $lt: new Date(lockedAt.getTime() - CHECKOUT_LOCK_MS) } },
        ],
      },
      { $set: { checkout_locked_at: lockedAt } },
      { new: true }
    ).populate({
      path: "items",
      populate: [
        { path: "product_id", model: Product },
        { path: "variant_id", model: ProductVariant },
      ],
    });

    if (!cart) {
      // Either the user has no cart, or another checkout is holding it.
      if (await Cart.exists({ user_id })) {
        return res.status(409).json({
          message: "Your order is already being placed. Please wait a moment.",
        });
      }
      return res.status(400).json({ message: "Cart is empty." });
    }

    if (cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty." });
    }

    const subtotalPiastres = cart.items.reduce((sum, item) => {
      const price = item.variant_id
        ? item.variant_id.price
        : item.product_id.price;
      return sum + toPiastres(price) * item.quantity;
    }, 0);
    const subtotal = toPounds(subtotalPiastres);

    let discount = 0;
    let promo = null;

    if (promo_code && promo_code.trim() !== "") {
      const formattedCode = promo_code.trim().toUpperCase();
      promo = await PromoCode.findOne({
        promo_code: formattedCode,
        expiry_date: { $gte: new Date() },
        $or: [{ user_id }, { is_public: true }],
      });

      if (!promo) {
        return res
          .status(400)
          .json({ message: "Invalid or expired promo code." });
      }

      if (promo.is_public && hasUsedPromo(promo, user_id)) {
        return res.status(400).json({ message: "Promo code already used." });
      }

      discount = promo.discount;
    }

    // --- fetch shipping cost by governorate id from DB ---
    const govId = Number(governorate);
    if (!Number.isFinite(govId)) {
      return res
        .status(400)
        .json({ message: "Governorate ID must be a number." });
    }

    // Only grab what we need
    const govRate = await GovOrderRate.findById(govId, {
      name: 1,
      cost: 1,
    }).lean();

    if (!govRate) {
      return res.status(400).json({ message: "Invalid governorate ID." });
    }

    const shippingPiastres = toPiastres(govRate.cost);
    const governorateName = govRate.name;

    // The discount is rounded to the nearest piastre once, here, so the
    // total is always a whole number of piastres.
    const discountPiastres = Math.round((subtotalPiastres * discount) / 100);
    const totalPiastres = subtotalPiastres - discountPiastres + shippingPiastres;

    const shipping_cost = toPounds(shippingPiastres);
    const total_amount = toPounds(totalPiastres);
    const subtotalInt = Math.round(subtotal);
    const totalInt = Math.round(total_amount);

    const attrsToObject = (m) => {
      if (!m) return {};
      if (m instanceof Map) return Object.fromEntries(m);
      return { ...m };
    };

    // A cart line keeps its own copy of the variant's attributes. Lines added
    // before that copy existed have an empty one, so fall back to the
    // variant's attributes. (attrsToObject always returns an object, and {}
    // is truthy, so `a || b` would never reach b.)
    const attributesOf = (item) => {
      const own = attrsToObject(item.attributes);
      return Object.keys(own).length > 0
        ? own
        : attrsToObject(item.variant_id?.attributes);
    };

    // Step 2 — take the stock. Each line is one atomic database operation:
    // "subtract N, but only if at least N are left". That re-checks stock at
    // the moment of purchase, stops two checkouts from both taking the last
    // piece, and never overwrites a stock edit an admin made meanwhile.
    // Every line taken is remembered so it can be given back.
    const taken = [];
    const giveBackStock = async () => {
      for (const t of taken) {
        await t.Model.updateOne({ _id: t.id }, { $inc: { stock_quantity: t.quantity } })
          .catch((err) =>
            console.error(
              `❌ Could not give back ${t.quantity} of ${t.Model.modelName} ${t.id}; fix its stock by hand:`,
              err
            )
          );
      }
    };

    let order = null;
    try {
      for (const item of cart.items) {
        const Model = item.variant_id ? ProductVariant : Product;
        const id = item.variant_id ? item.variant_id._id : item.product_id._id;

        const updated = await Model.findOneAndUpdate(
          { _id: id, stock_quantity: { $gte: item.quantity } },
          { $inc: { stock_quantity: -item.quantity } },
          { new: true }
        ).lean();

        if (!updated) {
          await giveBackStock();
          return res.status(409).json({
            message: `Not enough stock left for "${item.product_id.name}". Please update your cart and try again.`,
          });
        }

        taken.push({
          Model,
          id,
          quantity: item.quantity,
          // Used after the response to adjust other shoppers' carts.
          variant_id: item.variant_id ? id : null,
          product_id: item.variant_id ? null : id,
          remaining: updated.stock_quantity,
        });
      }

      // Step 3 — save the order and its items.
      order = await Order.create({
        user_id,
        subtotal,
        discount_percent: discount,
        promo_code: promo ? promo.promo_code : null,
        total_amount,
        shipping_cost,
        address,
        apartment_no,
        city,
        governorate: governorateName,
        phone_number,
      });

      // Build a map of product_id → primary image url so each order_item carries
      // a snapshot that survives later product deletion.
      const productIds = [...new Set(cart.items.map((i) => String(i.product_id._id)))];
      const primaryImages = await ProductImage.find({
        product_id: { $in: productIds },
        is_primary: true,
      })
        .select("product_id image_url")
        .lean();
      const imageByProduct = new Map(
        primaryImages.map((img) => [String(img.product_id), img.image_url])
      );

      const orderItems = cart.items.map((item) => {
        const attributes = attributesOf(item);
        return {
          order_id: order._id,
          product_id: item.product_id._id,
          variant_id: item.variant_id?._id || null,
          product_name: item.product_id.name || null,
          product_type: item.product_id.type || null,
          product_image_url: imageByProduct.get(String(item.product_id._id)) || null,
          attributes,
          notes: item.notes || null,
          quantity: item.quantity,
          price: item.variant_id?.price || item.product_id.price,
        };
      });

      await OrderItem.insertMany(orderItems);
    } catch (err) {
      // Saving failed, so undo it completely: give the stock back and remove
      // any half-saved order. The cart and promo code haven't been touched
      // yet, so the customer can simply try again.
      await giveBackStock();
      if (order) {
        await OrderItem.deleteMany({ order_id: order._id }).catch((e) =>
          console.error(`❌ Could not remove items of half-saved order ${order._id}:`, e)
        );
        await Order.deleteOne({ _id: order._id }).catch((e) =>
          console.error(`❌ Could not remove half-saved order ${order._id}:`, e)
        );
      }
      throw err;
    }

    // Step 4 — finish: mark the promo code used, then empty the cart (which
    // also releases the lock). The order is already saved, so if one of these
    // fails it is logged and the customer is still told the order went
    // through. Telling them it failed would make them order again.
    if (promo_code && promo && discount > 0) {
      try {
        if (promo.is_public) {
          // Push user ID to used_by array
          await PromoCode.updateOne(
            { _id: promo._id },
            { $addToSet: { used_by: user_id } }
          );
        } else {
          // Delete private (birthday) promo after use
          await PromoCode.deleteOne({ _id: promo._id });
        }
      } catch (err) {
        console.error(
          `❌ Order ${order._id} was placed, but promo ${promo.promo_code} could not be marked as used:`,
          err
        );
      }
    }

    // $pull only the lines that were bought, so anything added to the cart
    // while this checkout was running stays in it.
    const boughtIds = cart.items.map((i) => i._id);
    try {
      await CartItem.deleteMany({ _id: { $in: boughtIds } });
      await Cart.updateOne(
        { _id: cart._id },
        {
          $pull: { items: { $in: boughtIds } },
          $set: { total_price: 0, checkout_locked_at: null },
        }
      );
    } catch (err) {
      console.error(`❌ Order ${order._id} was placed, but the cart could not be emptied:`, err);
    }

    const shortOrderId = order._id.toString().slice(-5); // e.g., 'bb3f0'

    const renderAttrs = (item) => {
      const a = attributesOf(item);
      return Object.entries(a)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
    };

    const sheetData = cart.items.map((item) => [
      shortOrderId,
      `${first_name} ${last_name}`,
      item.product_id.type,
      item.product_id.name,
      item.quantity,
      renderAttrs(item) || null,
      `${address}, ${apartment_no}, ${city}, ${governorateName}`,
      phone_number,
      "Pending",
      totalInt,
      `${discount}%`,
      subtotalInt,
      shipping_cost,
      new Date().toLocaleString(),
    ]);

    res.status(201).json({ message: "Order placed successfully.", order });

    // Step 5 — after the response. The order is safe in the database, so the
    // extras below are best effort: a failure is logged with the order id and
    // never fails or undoes the order.

    // Adjust other users' carts: remove items at zero stock, cap quantities to remaining stock.
    try {
      for (const { variant_id, product_id, remaining } of taken) {
        const filter = { cart_id: { $ne: cart._id } };
        if (variant_id) {
          filter.variant_id = variant_id;
        } else {
          filter.product_id = product_id;
          filter.variant_id = null;
        }

        if (remaining <= 0) {
          const staleItems = await CartItem.find(filter).select("_id cart_id");
          if (staleItems.length > 0) {
            const staleIds = staleItems.map((ci) => ci._id);
            const affectedCartIds = [...new Set(staleItems.map((ci) => String(ci.cart_id)))];
            await CartItem.deleteMany({ _id: { $in: staleIds } });
            await Cart.updateMany(
              { _id: { $in: affectedCartIds } },
              { $pull: { items: { $in: staleIds } } }
            );
          }
        } else {
          // Cap quantity to remaining stock for any cart item that exceeds it.
          await CartItem.updateMany(
            { ...filter, quantity: { $gt: remaining } },
            { $set: { quantity: remaining } }
          );
        }
      }
    } catch (err) {
      console.error(`❌ Order ${order._id}: adjusting other carts failed:`, err);
    }

    try {
      await updateGoogleSheet(sheetData);
    } catch (err) {
      console.error(
        `❌ Order ${order._id} was placed but NOT added to the Google Sheet; add it by hand:`,
        err
      );
    }

    // Logs its own failures and never throws.
    await sendOrderConfirmationEmail(
      req.user.email,
      first_name,
      last_name,
      `${address}, ${apartment_no}, ${city}, ${governorateName}`,
      discount,
      subtotal,
      shipping_cost,
      order,
      cart.items.map((item) => ({
        name: item.product_id.name,
        type: item.product_id.type,
        quantity: item.quantity,
        attributes: attributesOf(item),
        price: item.variant_id?.price || item.product_id.price,
      })),
      phone_number
    );
  } catch (error) {
    console.error("❌ Checkout Error:", error);
    if (!res.headersSent) {
      return res.status(500).json({ message: "Internal Server Error" });
    }
  } finally {
    // Release the lock if this checkout still holds it (on success it was
    // already released when the cart was emptied). Matching on lockedAt means
    // this never releases a lock that a later checkout has taken over.
    if (cart) {
      await Cart.updateOne(
        { _id: cart._id, checkout_locked_at: lockedAt },
        { $set: { checkout_locked_at: null } }
      ).catch((err) => console.error("❌ Could not release cart lock:", err));
    }
  }
};

/**
 * A cell value that a spreadsheet must never read as a formula.
 *
 * `valueInputOption: "RAW"` already stops Sheets parsing anything, so this is
 * defence in depth for the day someone flips that option back to
 * USER_ENTERED. Leading "=", "@", tab and CR are always escaped with the
 * plain-text apostrophe; "+" and "-" only when what follows is not a plain
 * number, so Egyptian phone numbers (+201234567890) and negative amounts stay
 * readable in the operations sheet instead of picking up a literal apostrophe
 * on every single order row.
 */
const FORMULA_LEAD = /^[=@\t\r\n]/;
const PLAIN_NUMBER = /^[+-]\d[\d\s.,]*$/;

const sanitizeCell = (v) => {
  const s = v == null ? "" : String(v);
  if (FORMULA_LEAD.test(s)) return `'${s}`;
  if ((s.startsWith("+") || s.startsWith("-")) && !PLAIN_NUMBER.test(s)) {
    return `'${s}`;
  }
  return s;
};

/**
 * Internal helper — NOT an Express handler and not exported.
 *
 * It was previously registered as `router.post("/update/google-sheet", ...)`,
 * which handed it the Express `req` object as `sheetData`. Serializing that
 * threw on the request's circular references, the catch re-threw, and because
 * nothing awaited the returned promise the rejection went unhandled and Node
 * terminated the process. The guard below makes that misuse a caught 500
 * inside checkout() instead of a crash.
 *
 * @param {Array<Array<string|number|null>>} sheetData rows to append
 */
const updateGoogleSheet = async (sheetData) => {
  if (!Array.isArray(sheetData) || !sheetData.every(Array.isArray)) {
    throw new TypeError(
      "updateGoogleSheet expects an array of row arrays, received " +
        Object.prototype.toString.call(sheetData)
    );
  }

  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: authClient });

    const spreadsheetId = process.env.GOOGLE_SPREAD_SHEET_ID; // from .env file
    const range = "Sheet1!A2:N"; // Adjust the range to start from row 2 downwards

    // Every cell is customer-controlled text (name, address, notes), so the
    // sheet must not interpret any of it. RAW stores values verbatim;
    // USER_ENTERED parsed them, which let an order turn into a live
    // =IMPORTXML(...) in the operations sheet the moment staff opened it.
    const resource = { values: sheetData.map((row) => row.map(sanitizeCell)) };

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      resource,
    });

    return response.data;
  } catch (error) {
    console.error("❌ Error updating sheet:", error);
    throw new Error("Error updating Google Sheets");
  }
};

export const getUserOrders = async (req, res, next) => {
  const user_id = req.user.user_id;

  try {
    const orders = await Order.find({ user_id })
      .sort({ order_date: -1, _id: -1 }) // newest first (tie-break same timestamp)
      .lean();

    if (!orders.length) {
      return res
        .status(404)
        .json({ message: "No orders found for this user." });
    }

    const orderIds = orders.map((order) => order._id);
    const orderItems = await OrderItem.find({ order_id: { $in: orderIds } })
      .populate({
        path: "product_id",
        select: "name images",
        populate: {
          path: "images",
          match: { is_primary: true },
          select: "image_url",
        },
      })
      .lean();

    const itemsByOrder = {};
    for (const item of orderItems) {
      const orderId = item.order_id.toString();
      if (!itemsByOrder[orderId]) itemsByOrder[orderId] = [];

      const attrsRaw = item.attributes;
      const attributes =
        attrsRaw instanceof Map ? Object.fromEntries(attrsRaw) : { ...(attrsRaw || {}) };
      itemsByOrder[orderId].push({
        product_id: item.product_id?._id,
        // Snapshot fields survive product deletion.
        name: item.product_name || item.product_id?.name || "Deleted Product",
        type: item.product_type || null,
        quantity: item.quantity,
        price: parseFloat(item.price),
        attributes,
        notes: item.notes || null,
        image_url:
          item.product_image_url ||
          item.product_id?.images?.[0]?.image_url ||
          null,
      });
    }

    const formattedOrders = orders.map((order) => {
      const discountPercent = order.discount_percent ?? 0;

      return {
        order_id: order._id,
        order_date: order.order_date,
        status: order.status,
        shipping_address: {
          address: order.address,
          apartment_no: order.apartment_no,
          city: order.city,
          governorate: order.governorate,
          full: `${order.address}, ${order.apartment_no}, ${order.city}, ${order.governorate}`,
        },
        contact_number: order.phone_number,
        subtotal: order.subtotal,
        shipping_cost: order.shipping_cost ?? 0,
        discount_percent: discountPercent,
        promo_used: discountPercent > 0,
        promo_code: order.promo_code || null,
        total_amount: order.total_amount,
        items: itemsByOrder[order._id.toString()] || [],
      };
    });

    res.status(200).json(formattedOrders);
  } catch (error) {
    console.error(error);
    next(error);
  }
};