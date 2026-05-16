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
import { Op } from "sequelize";
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
export const listGovernorates = async (_req, res) => {
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
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/promo/validate
export const validatePromoCode = async (req, res) => {
  try {
    const { promo_code } = req.body;
    const user_id = req.user.user_id;

    if (!promo_code) {
      return res.status(400).json({ message: "Promo code is required" });
    }

    const formattedCode = promo_code.trim().toUpperCase();
    const objectId = new mongoose.Types.ObjectId(user_id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const promo = await PromoCode.findOne({
      promo_code: formattedCode,
      expiry_date: { $gte: today },
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
    if (promo.is_public && promo.used_by.includes(objectId)) {
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


export const checkout = async (req, res) => {
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

    const cart = await Cart.findOne({ user_id }).populate({
      path: "items",
      populate: [
        { path: "product_id", model: Product },
        { path: "variant_id", model: ProductVariant },
      ],
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty." });
    }

    const subtotal = cart.items.reduce((sum, item) => {
      const price = item.variant_id
        ? parseFloat(item.variant_id.price)
        : parseFloat(item.product_id.price);
      return sum + price * item.quantity;
    }, 0);

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

      if (promo.is_public && promo.used_by.includes(user_id)) {
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

    const shipping_cost = govRate.cost;
    const governorateName = govRate.name;


    const total_amount = subtotal - subtotal * (discount / 100) + shipping_cost;
    const subtotalInt = Math.round(subtotal);
    const totalInt = Math.round(total_amount);

    const order = await Order.create({
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

    const attrsToObject = (m) => {
      if (!m) return {};
      if (m instanceof Map) return Object.fromEntries(m);
      return { ...m };
    };

    const orderItems = cart.items.map((item) => {
      const attributes =
        attrsToObject(item.attributes) ||
        attrsToObject(item.variant_id?.attributes);
      return {
        order_id: order._id,
        product_id: item.product_id._id,
        variant_id: item.variant_id?._id || null,
        product_name: item.product_id.name || null,
        product_type: item.product_id.type || null,
        product_image_url: imageByProduct.get(String(item.product_id._id)) || null,
        attributes,
        quantity: item.quantity,
        price: item.variant_id?.price || item.product_id.price,
      };
    });

    await OrderItem.insertMany(orderItems);

    for (const item of cart.items) {
      if (item.variant_id) {
        item.variant_id.stock_quantity -= item.quantity;
        await item.variant_id.save();
      } else {
        item.product_id.stock_quantity -= item.quantity;
        await item.product_id.save();
      }
    }

    const shortOrderId = order._id.toString().slice(-5); // e.g., 'bb3f0'

    const renderAttrs = (item) => {
      const a =
        attrsToObject(item.attributes) ||
        attrsToObject(item.variant_id?.attributes);
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

    await updateGoogleSheet(sheetData);

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
        attributes:
          attrsToObject(item.attributes) ||
          attrsToObject(item.variant_id?.attributes),
        price: item.variant_id?.price || item.product_id.price,
      })),
      phone_number
    );

    if (promo_code && promo && discount > 0) {
      if (promo.is_public) {
        // Push user ID to used_by array
        await PromoCode.updateOne(
          { _id: promo._id },
          { $addToSet: { used_by: user_id } }
        );
      } else {
        // Delete private (birthday) promo after use
        await PromoCode.deleteOne({
          _id: promo._id,
        });
      }
    }

    await CartItem.deleteMany({ _id: { $in: cart.items.map((i) => i._id) } });
    cart.items = [];
    cart.total_price = 0;
    await cart.save();

    return res
      .status(201)
      .json({ message: "Order placed successfully.", order });
  } catch (error) {
    console.error("❌ Checkout Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateGoogleSheet = async (sheetData) => {
  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: authClient });

    const spreadsheetId = process.env.GOOGLE_SPREAD_SHEET_ID; // from .env file
    const range = "Sheet1!A2:N"; // Adjust the range to start from row 2 downwards

    const resource = { values: sheetData };

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      resource,
    });

    return response.data;
  } catch (error) {
    console.error("❌ Error updating sheet:", error);
    throw new Error("Error updating Google Sheets");
  }
};

export const getUserOrders = async (req, res) => {
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
    res.status(500).json({ message: "Error retrieving orders.", error });
  }
};