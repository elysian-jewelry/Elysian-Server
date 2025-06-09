import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../../models/user.js";
import Product from "../../models/product.js";
import PromoCode from "../../models/promoCode.js";
import ProductVariant from "../../models/productVariant.js";
import ProductImage from "../../models/productImage.js";
import Cart from "../../models/cart.js";
import CartItem from "../../models/cartItem.js";
import Order from "../../models/order.js";
import OrderItem from "../../models/orderItem.js";
import { Op } from "sequelize";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { sendVerificationCodeEmail, sendBirthdayPromoCodeEmail  } from "../../middlewares/mailer.middleware.js"; // your custom mail sender
import sequelize from '../../config/database.js'; // Adjust the path as necessary
import cron from "node-cron";

// At top of your auth controller file
const verificationCodes = new Map(); 
const verifiedEmails = new Map();   
// In-memory store (or use Redis in production)
const verificationStore = new Map(); // email -> { code, full_name, hashedPassword }

// Helper function to generate a random 6-character alphanumeric code
const generatePromoCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
};

const generateToken = (user) => {
  return jwt.sign(
    {
      user_id: user._id,
      email: user.email,
      birthday: user.birthday,
      first_name: user.first_name,
      last_name: user.last_name,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};


export const resetDatabase = async (req, res) => {
  try {
    const collections = [
      "users",
      "promo_codes",
      "products",
      "product_variants",
      "product_images",
      "carts",
      "cart_items",
      "orders",
      "order_items",
    ];

    // Step 1: Drop all collections if they exist
    for (const name of collections) {
      const exists = await mongoose.connection.db
        .listCollections({ name })
        .hasNext();
      if (exists) {
        await mongoose.connection.db.dropCollection(name);
        console.log(`✅ Dropped collection: ${name}`);
      }
    }

   const seedProducts = [
  { name: 'Bling', price: 220, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Blue Pearl', price: 250, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Emerald', price: 250, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Emerald Seas (in dark green)', price: 250, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Emerald Seas (in light green)', price: 250, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Figaro', price: 220, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Green Pearl', price: 250, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Large Cuff', price: 390, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Lock and Key', price: 230, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Maris Pearl', price: 250, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Paper Clip', price: 210, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Purple Stones', price: 250, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Rainbow', price: 220, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Rod', price: 220, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Scarlet', price: 230, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Seashell', price: 290, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Small Cuff', price: 350, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Tiffany', price: 230, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Twisted', price: 210, type: 'Bracelets', stock_quantity: 100 },
  { name: 'Bloom', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Blue Drip', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Blue Starfish', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Constellations', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Coral', price: 490, type: 'Earrings', stock_quantity: 100 },
  { name: 'Engraved Eternal', price: 250, type: 'Earrings', stock_quantity: 100 },
  { name: 'Eternal', price: 220, type: 'Earrings', stock_quantity: 100 },
  { name: 'Green Hues', price: 290, type: 'Earrings', stock_quantity: 100 },
  { name: 'La Perle', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Mini Seashell', price: 210, type: 'Earrings', stock_quantity: 100 },
  { name: 'Paper Clip', price: 290, type: 'Earrings', stock_quantity: 100 },
  { name: 'Pearl Nest', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Pearl Petal', price: 290, type: 'Earrings', stock_quantity: 100 },
  { name: 'Pearly Eternal', price: 290, type: 'Earrings', stock_quantity: 100 },
  { name: 'Pearly Starfish', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Pink Hues', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Seashell', price: 250, type: 'Earrings', stock_quantity: 100 },
  { name: 'Seashore', price: 450, type: 'Earrings', stock_quantity: 100 },
  { name: 'Sparkly Starfish', price: 290, type: 'Earrings', stock_quantity: 100 },
  { name: 'Starfish', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Starlight (in blue)', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Starlight (in green)', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Starlight (in white)', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Starry Night', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Tiffany', price: 300, type: 'Earrings', stock_quantity: 100 },
  { name: 'Triple Pearl', price: 350, type: 'Earrings', stock_quantity: 100 },
  { name: 'Bling', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Blue Aura', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Bold', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Emerald', price: 400, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Gemstone', price: 450, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Green Aura', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Marly', price: 400, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Mix and Match', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Ocean Pearl', price: 400, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Pearly', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Plain V (in gold)', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Plain V (in silver)', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Red Aura', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Rod', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Scarlet', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'The Golden Ovoid', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'The OG (in gold)', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'The OG (in silver)', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Verdant Star', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Vertical Gleam', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'White Aura', price: 340, type: 'Hand Chains', stock_quantity: 100 },
  { name: 'Marly', price: 490, type: 'Back Chains', stock_quantity: 100 },
  { name: 'Pearly', price: 490, type: 'Back Chains', stock_quantity: 100 },
  { name: 'The OG', price: 680, type: 'Back Chains', stock_quantity: 100 },
  { name: 'Vertical Gleam', price: 680, type: 'Back Chains', stock_quantity: 100 },
  { name: 'Bling Drop', price: 310, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Blue Aura Drop', price: 310, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Blue Pearl', price: 370, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Double The Aura Drop', price: 350, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Double The Bling Drop', price: 400, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Emerald Seas Drop (in dark green)', price: 450, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Emerald Seas Drop (in light green)', price: 450, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Figaro', price: 290, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Green Aura Drop', price: 310, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Green Pearl', price: 370, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Lock and Key', price: 320, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Marly Drop', price: 450, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Ocean Pearl Drop', price: 450, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Paper Clip (in gold)', price: 290, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Paper Clip (in silver)', price: 290, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Rainbow', price: 290, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Red Aura Drop', price: 310, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Rhinestones Drop', price: 310, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Scarlet', price: 290, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Scarlet Drop', price: 320, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Seashell', price: 390, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Seashore', price: 400, type: 'Necklaces', stock_quantity: 100 },
  { name: 'The Golden Ovoid', price: 290, type: 'Necklaces', stock_quantity: 100 },
  { name: 'The OG Drop (in gold)', price: 290, type: 'Necklaces', stock_quantity: 100 },
  { name: 'The OG Drop (in silver)', price: 290, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Tiffany (in gold)', price: 320, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Tiffany (in silver)', price: 320, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Twisted', price: 290, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Vertical Gleam Drop', price: 290, type: 'Necklaces', stock_quantity: 100 },
  { name: 'White Aura Drop', price: 310, type: 'Necklaces', stock_quantity: 100 },
  { name: 'Seashell', price: 650, type: 'Sets', stock_quantity: 100 },
  { name: 'Seashore', price: 800, type: 'Sets', stock_quantity: 100 },
  { name: 'Twisted', price: 800, type: 'Sets', stock_quantity: 100 },
  { name: 'Bling', price: 490, type: 'Waist Chains', stock_quantity: 100 },
  { name: 'Emerald', price: 490, type: 'Waist Chains', stock_quantity: 100 },
  { name: 'Golden Ovoid', price: 490, type: 'Waist Chains', stock_quantity: 100 },
  { name: 'Ocean Pearl', price: 490, type: 'Waist Chains', stock_quantity: 100 },
  { name: 'Pearly Hoops', price: 490, type: 'Waist Chains', stock_quantity: 100 },
  { name: 'The OG', price: 490, type: 'Waist Chains', stock_quantity: 100 },
  { name: 'The OG (double layered)', price: 490, type: 'Waist Chains', stock_quantity: 100 },
  { name: 'Twisted', price: 490, type: 'Waist Chains', stock_quantity: 100 },
  { name: 'Vertical Gleam', price: 490, type: 'Waist Chains', stock_quantity: 100 },
  { name: 'The OG', price: 680, type: 'Body Chains', stock_quantity: 100 },
  { name: 'Emerald', price: 680, type: 'Body Chains', stock_quantity: 100 },
  { name: 'Vertical Gleam', price: 680, type: 'Body Chains', stock_quantity: 100 }
];


    await Product.insertMany(seedProducts);
    console.log("✅ Seeded products");
// Define variant seeds for the two products
    const variantSeeds = [
      {
        product_name: "Paper Clip",
        product_type: "Bracelets",
        variants: [
          { size: "Small", price: 210.0, stock_quantity: 100 },
          { size: "Medium", price: 220.0, stock_quantity: 100 },
          { size: "Large", price: 230.0, stock_quantity: 100 }
        ]
      },
      {
        product_name: "Paper Clip (in gold)",
        product_type: "Necklaces",
        variants: [
          { size: "Small", price: 290.0, stock_quantity: 100 },
          { size: "Medium", price: 300.0, stock_quantity: 100 },
          { size: "Large", price: 310.0, stock_quantity: 100 }
        ]
      }
    ];

    for (const seed of variantSeeds) {
  const product = await Product.findOne({
    name: seed.product_name,
    type: seed.product_type,
  });

  if (!product) {
    console.warn(`⚠️ Product not found: ${seed.product_name} (${seed.product_type})`);
    continue;
  }

  // Insert each variant and collect their IDs
  const variantDocs = await ProductVariant.insertMany(
    seed.variants.map(variant => ({
      product_id: product._id,
      size: variant.size,
      price: variant.price,
      stock_quantity: variant.stock_quantity
    }))
  );

  // Push inserted variant IDs to the product's product_variants array
  const variantIds = variantDocs.map(variant => variant._id);
  await Product.findByIdAndUpdate(product._id, {
    $push: { product_variants: { $each: variantIds } }
  });
      console.log(`✅ Inserted variants for ${seed.product_name}`);
    }

    return res.status(200).json({ message: "Database reset successfully" });
  } catch (err) {
    console.error("❌ Error resetting database:", err);
    return res.status(500).json({ message: "Error resetting database", error: err.message });
  }
};


cron.schedule("26 2 * * *", async () => {
  try {
   console.log("🎉 Running birthday promo code cron job...");
   
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const birthdayUsers = await User.findAll({
      where: {
        [Op.and]: [
          sequelize.where(sequelize.fn("MONTH", sequelize.col("birthday")), month),
          sequelize.where(sequelize.fn("DAY", sequelize.col("birthday")), day),
        ]
      }
    });

    for (const user of birthdayUsers) {
      const promo_code = generatePromoCode();
      // Email the user
      const discount = 20;
      const expiryDate = new Date();
      expiryDate.setDate(today.getDate() + 1);

      // Save promo code to DB
      await PromoCode.create({
        user_id: user.user_id,
        promo_code,
        expiry_date: expiryDate,
        discount
      });


      await sendBirthdayPromoCodeEmail(user, promo_code);
    }

    console.log("🎉 Birthday promo codes sent successfully!");
  } catch (err) {
    console.error("❌ Error in birthday cron job:", err);
  }
});

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    res.status(200).json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Failed to fetch users." });
  }
};

export const login = async (req, res) => {
  try {
    const { email } = req.body;
    
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const createdAt = new Date();


    verificationStore.set(email, { code: verificationCode, createdAt });
    
    await sendVerificationCodeEmail(email, verificationCode);


     res.status(200).json({ message: 'Verification code sent to your email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const verifyCodeAndLogin = async (req, res) => {
  try {
    const { email, code } = req.body;
    const stored = verificationStore.get(email);
    

    if (!stored) {
      return res.status(400).json({ message: 'No verification code found for this email.' });
    }

    const now = new Date();
    const diffMinutes = (now - new Date(stored.createdAt)) / (1000 * 60);

    if (diffMinutes > 5) {
      verificationStore.delete(email);
      return res.status(400).json({ message: 'Verification code expired. Please request a new one.' });
    }

    if (stored.code !== code) {
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    // Remove code after verification
    verificationStore.delete(email);

    // Check if user already exists
    let user = await User.findOne({ email });
    
    console.log(user);
    


    if (user) {
      const token = generateToken(user);
      return res.status(200).json({
        message: 'Login successful!',
        token,
        user: {
          user_id: user._id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          birthday: user.birthday,
        },
      });
    }

    // Create new user if not exists
    const newUser = await User.create({ email });
    const token = generateToken(newUser);

    return res.status(201).json({
      message: 'User created successfully!',
      token,
      user: {
        user_id: newUser._id,
        email: newUser.email,
      },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};





