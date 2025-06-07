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


export const getUserOrders = async (req, res) => {
  const user_id = req.user.user_id;

  try {
    const orders = await Order.findAll({
      where: { user_id },
      include: [
        {
          model: OrderItem,
          include: [
            {
              model: Product,
              attributes: ['product_id', 'name'],
              include: [
                {
                  model: ProductImage,
                  as: 'images',
                  where: { is_primary: true },
                  required: false,
                  attributes: ['image_url'],
                },
              ],
            },
          ],
        },
      ],
      order: [['order_date', 'DESC']],
    });

    if (!orders.length) {
      return res.status(404).json({ message: 'No orders found for this user.' });
    }

   const formattedOrders = orders
  .sort((a, b) => new Date(a.order_date) - new Date(b.order_date)) // sort by oldest
  .map((order, index) => ({
    order_id: index + 1,  // fake order_id starting from 1
    order_date: order.order_date,
    status: order.status,
    subtotal: order.subtotal,
    discount_percent: order.discount_percent,
    total_amount: order.total_amount,
    items: order.OrderItems.map(item => ({
      product_id: item.product_id,
      name: item.Product?.name || null,
      quantity: item.quantity,
      price: item.price,
      size: item.size,
      image_url: item.Product?.images?.[0]?.image_url || null,
    })),
  }));


    res.status(200).json(formattedOrders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving orders.', error });
  }
};



export const checkout = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { address, apartment_no, city, governorate, phone_number, promo_code } = req.body;

    // Find user's cart with product and variant info
    const cart = await Cart.findOne({
      where: { user_id },
      include: [
        {
          model: CartItem,
          include: [
            {
              model: Product,
              attributes: ['product_id', 'price', 'name', 'type', 'stock_quantity'],
            },
            {
              model: ProductVariant,
              attributes: ['variant_id', 'price', 'size', 'stock_quantity'],
            }
          ],
        },
      ],
    });

    if (!cart || cart.CartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty." });
    }


     // Promo validation if promo_code is passed
    let discount = 0;
    if (promo_code && promo_code.trim() !== "") {
      const promo = await PromoCode.findOne({
        where: {
          user_id,
          promo_code: promo_code.trim().toUpperCase(),
          expiry_date: {
            [Op.gte]: new Date(), // check not expired
          }
        }
      });

      if (!promo) {
        return res.status(400).json({ message: "Invalid or expired promo code." });
      }

      discount = promo.discount;
    }

    // Calculate total amount
    const total_amount = cart.total_price - (cart.total_price * (discount/100));

    // Create order
    const order = await Order.create({
      user_id,
      subtotal: cart.total_price,
      discount_percent: discount,
      total_amount,
      address,
      apartment_no,
      city,
      governorate,
      phone_number,
    });

   // Add items to order
    const orderItems = cart.CartItems.map((item) => ({
      order_id: order.order_id,
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.variant_id && item.ProductVariant
        ? item.ProductVariant.price
        : item.Product.price,
      variant_id: item.variant_id || null,
      size: item.size || null,
    }));

    await OrderItem.bulkCreate(orderItems);

for (const item of cart.CartItems) {
  // If the item has a variant, update the variant's stock
  if (item.variant_id && item.ProductVariant) {
    item.ProductVariant.stock_quantity -= item.quantity;
    await item.ProductVariant.save();
  } else {
    item.Product.stock_quantity -= item.quantity;
    await item.Product.save();
  }
}

const subtotal = cart.total_price;

    // Clear user's cart after checkout
    await CartItem.destroy({ where: { cart_id: cart.cart_id } });

    // Reset cart total to 0
    cart.total_price = 0;
    await cart.save();

    // Now update the Google Sheets with the cart items
    const sheetData = cart.CartItems.map((item) => [
      order.order_id,                      // Order ID
      req.user.first_name + ' ' + req.user.last_name,                     // User Name
      item.Product.type,            // Product Type
      item.Product.name,            // Product Name
      item.quantity,                        // Quantity
      item.size,                    // Size
      `${address}, ${apartment_no}, ${city}, ${governorate}`, // Delivery Address
      phone_number,                         // Mobile Number
      'Pending',                            // Status
      total_amount.toFixed(2),         // ✅ Total Amount
      `${discount}%`,                   // ✅ Discount %
      subtotal,             // ✅ Subtotal
    ]);

    // Call the function to update the Google Sheet
    await updateGoogleSheet(sheetData);  // Pass the data to updateGoogleSheet

    // Send receipt email
await sendOrderConfirmationEmail(req.user, order, cart.CartItems.map(item => ({
  name: item.Product.name,
  type: item.Product.type,
  quantity: item.quantity,
  size: item.size,
  price: item.Product.price,
})), discount);


    // ✅ Delete the promo code after use
if (promo_code && discount > 0) {
  await PromoCode.destroy({
    where: {
      user_id,
      promo_code: promo_code.trim().toUpperCase()
    }
  });
}

    res.status(201).json({ message: "Order placed successfully.", order });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


export const updateGoogleSheet = async (sheetData) => {
  try {
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const spreadsheetId = process.env.GOOGLE_SPREAD_SHEET_ID; // from .env file
    const range = 'Sheet1!A2:L';  // Adjust the range to start from row 2 downwards

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

