import { google } from 'googleapis';
import Order from "../../models/order.js";
import OrderItem from "../../models/orderItem.js";
import Cart from "../../models/cart.js";
import CartItem from "../../models/cartItem.js";
import Product from "../../models/product.js";
import ProductVariant from "../../models/productVariant.js";
import ProductImage from "../../models/productImage.js";
import PromoCode from "../../models/promoCode.js";
import { Op } from "sequelize";
import { sendOrderConfirmationEmail } from '../../middlewares/mailer.middleware.js';
import dotenv from 'dotenv';
dotenv.config();


// Load your service account key
const auth = new google.auth.GoogleAuth({
  keyFile: './credentials.json', // Replace with your JSON file
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});


// POST /api/promo/validate
export const validatePromoCode = async (req, res) => {
  try {
    const { promo_code } = req.body;
    const user_id = req.user.user_id;

    if (!promo_code) {
      return res.status(400).json({ message: "Promo code is required" });
    }

    const promo = await PromoCode.findOne({
      where: {
        promo_code: promo_code.trim().toUpperCase(),
        user_id,
        expiry_date: {
          [Op.gte]: new Date() // today or in the future
        }
      }
    });

    if (!promo) {
      return res.status(404).json({ message: "Promo code is invalid or expired" });
    }

    return res.status(200).json({
      message: "Promo code is valid",
      discount: promo.discount
    });

  } catch (error) {
    console.error("Error validating promo code:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


export const checkout = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { address, apartment_no, city, governorate, phone_number, promo_code, first_name, last_name } = req.body;

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

    const total_price = cart.items.reduce((sum, item) => {
      const price = item.variant_id ? parseFloat(item.variant_id.price) : parseFloat(item.product_id.price);
      return sum + price * item.quantity;
    }, 0);

    let discount = 0;
    if (promo_code && promo_code.trim() !== "") {
      const promo = await PromoCode.findOne({
        user_id,
        promo_code: promo_code.trim().toUpperCase(),
        expiry_date: { $gte: new Date() },
      });

      if (!promo) {
        return res.status(400).json({ message: "Invalid or expired promo code." });
      }
      discount = promo.discount;
    }

    const shippingRates = [
      { id: 1, name: "Cairo", cost: 80 },
      { id: 2, name: "Giza", cost: 80 },
      { id: 3, name: "Sharqia", cost: 90 },
      { id: 4, name: "Dakahlia", cost: 90 },
      { id: 5, name: "Beheira", cost: 110 },
      { id: 6, name: "Minya", cost: 110 },
      { id: 7, name: "Qalyubia", cost: 90 },
      { id: 8, name: "Sohag", cost: 110 },
      { id: 9, name: "Fayoum", cost: 90 },
      { id: 10, name: "Assiut", cost: 110 },
      { id: 11, name: "Monufia", cost: 90 },
      { id: 12, name: "Alexandria", cost: 90 },
      { id: 13, name: "Gharbia", cost: 90 },
      { id: 14, name: "Kafr El Sheikh", cost: 90 },
      { id: 15, name: "Bani Suef", cost: 110 },
      { id: 16, name: "Qena", cost: 90 },
      { id: 17, name: "Aswan", cost: 120 },
      { id: 18, name: "Damietta", cost: 90 },
      { id: 19, name: "Ismailia", cost: 90 },
      { id: 20, name: "Matrouh", cost: 120 },
      { id: 21, name: "Luxor", cost: 120 },
      { id: 22, name: "Port Said", cost: 90 },
      { id: 23, name: "Red Sea", cost: 120 },
      { id: 24, name: "South Sinai", cost: 140 },
      { id: 25, name: "New Valley", cost: 140 },
      { id: 26, name: "North Coast", cost: 125 },
    ];

    const shippingData = shippingRates.find(e => e.id === Number(governorate));
    if (!shippingData) return res.status(400).json({ message: "Invalid governorate ID." });

    const shipping_cost = shippingData.cost;
    const governorateName = shippingData.name;

    const total_amount = total_price - (total_price * (discount / 100)) + shipping_cost;

    const order = await Order.create({
      user_id,
      subtotal: total_price,
      discount_percent: discount,
      total_amount,
      shipping_cost,
      address,
      apartment_no,
      city,
      governorate: governorateName,
      phone_number,
    });

    const orderItems = cart.items.map(item => ({
      order_id: order._id,
      product_id: item.product_id._id,
      variant_id: item.variant_id?._id || null,
      size: item.variant_id?.size || null,
      quantity: item.quantity,
      price: item.variant_id?.price || item.product_id.price,
    }));

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

    const shortOrderId = order._id.toString().slice(-5);  // e.g., 'bb3f0'


    const sheetData = cart.items.map(item => [
      shortOrderId,
      `${first_name} ${last_name}`,
      item.product_id.type,
      item.product_id.name,
      item.quantity,
      item.variant_id?.size || null,
      `${address}, ${apartment_no}, ${city}, ${governorateName}`,
      phone_number,
      'Pending',
      total_amount.toFixed(2),
      `${discount}%`,
      total_price.toFixed(2),
      shipping_cost,
      new Date().toLocaleString()
    ]);

    await updateGoogleSheet(sheetData);

    
    await CartItem.deleteMany({ _id: { $in: cart.items.map(i => i._id) } });
    cart.items = [];
    cart.total_price = 0;
    await cart.save();


    await sendOrderConfirmationEmail(req.user.email, first_name, last_name, order, cart.items.map(item => ({
      name: item.product_id.name,
      type: item.product_id.type,
      quantity: item.quantity,
      size: item.variant_id?.size || null,
      price: item.variant_id?.price || item.product_id.price,
    })), discount);

    if (promo_code && discount > 0) {
      await PromoCode.deleteOne({
        user_id,
        promo_code: promo_code.trim().toUpperCase()
      });
    }

    return res.status(201).json({ message: "Order placed successfully.", order });

  } catch (error) {
    console.error("❌ Checkout Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


export const updateGoogleSheet = async (sheetData) => {
  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const spreadsheetId = process.env.GOOGLE_SPREAD_SHEET_ID; // from .env file
    const range = 'Sheet1!A2:N';  // Adjust the range to start from row 2 downwards

    const resource = { values: sheetData };

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      resource,
    });

    console.log('✅ Sheet updated:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error updating sheet:', error);
    throw new Error('Error updating Google Sheets');
  }
};


export const getUserOrders = async (req, res) => {
  const user_id = req.user.user_id;

  try {
    const orders = await Order.find({ user_id })
      .sort({ order_date: 1 }) // sort ascending (oldest first)
      .lean();

    if (!orders.length) {
      return res.status(404).json({ message: 'No orders found for this user.' });
    }

    const orderIds = orders.map(order => order._id);
    const orderItems = await OrderItem.find({ order_id: { $in: orderIds } })
      .populate({
        path: 'product_id',
        select: 'name images',
        populate: {
          path: 'images',
          match: { is_primary: true },
          select: 'image_url',
        },
      })
      .lean();

    const itemsByOrder = {};
    for (const item of orderItems) {
      const orderId = item.order_id.toString();
      if (!itemsByOrder[orderId]) itemsByOrder[orderId] = [];

      itemsByOrder[orderId].push({
        product_id: item.product_id?._id,
        name: item.product_id?.name || null,
        quantity: item.quantity,
        price: parseFloat(item.price),
        size: item.size,
        image_url: item.product_id?.images?.[0]?.image_url || null,
      });
    }

    const formattedOrders = orders.map((order, index) => ({
      order_id: index + 1,
      order_date: order.order_date,
      status: order.status,
      shipping_cost: order.shipping_cost,
      subtotal: order.subtotal,
      discount_percent: order.discount_percent,
      total_amount: order.total_amount,
      items: itemsByOrder[order._id.toString()] || [],
    }));

    res.status(200).json(formattedOrders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving orders.', error });
  }
};
