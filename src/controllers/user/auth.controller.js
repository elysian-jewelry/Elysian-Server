import jwt from "jsonwebtoken";
import User from "../../models/user.js";
import { Op } from "sequelize";
import PromoCode from "../../models/promoCode.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { sendPasswordResetEmail,sendVerificationCodeEmail, sendBirthdayPromoCodeEmail  } from "../../middlewares/mailer.middleware.js"; // your custom mail sender
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
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};


export const resetDatabase = async (req, res) => {
  const resetQueries = `
    -- Drop tables in the correct order
    DROP TABLE IF EXISTS order_items;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS cart_items;
    DROP TABLE IF EXISTS carts;
    DROP TABLE IF EXISTS product_variants;
    DROP TABLE IF EXISTS product_images;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS promo_codes;
    DROP TABLE IF EXISTS users;

    -- USERS
    CREATE TABLE users (
      user_id INT NOT NULL AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL UNIQUE,
      full_name VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      birthday DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- PROMO CODES
    CREATE TABLE promo_codes (
      promo_code_id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      promo_code VARCHAR(50) NOT NULL UNIQUE,
      expiry_date DATE NOT NULL,
      discount INT NOT NULL DEFAULT 0,
      PRIMARY KEY (promo_code_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- PRODUCTS
    CREATE TABLE products (
      product_id INT NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10, 2) NULL,
      type ENUM('Earrings', 'Necklaces', 'Bracelets', 'Hand Chains', 'Back Chains', 'Body Chains', 'Waist Chains', 'Sets') NOT NULL,
      stock_quantity INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


    CREATE TABLE product_variants (
      variant_id INT NOT NULL AUTO_INCREMENT,
      product_id INT NOT NULL,
      size VARCHAR(50) NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      stock_quantity INT NOT NULL DEFAULT 0,
      PRIMARY KEY (variant_id),
      FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
      UNIQUE (product_id, size)  -- to prevent duplicate sizes for the same product
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- PRODUCT IMAGES
    CREATE TABLE product_images (
      image_id INT NOT NULL AUTO_INCREMENT,
      product_id INT NOT NULL,
      image_url TEXT NOT NULL,
      is_primary BOOLEAN DEFAULT FALSE,
      PRIMARY KEY (image_id),
      FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- CARTS
    CREATE TABLE carts (
      cart_id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      total_price DECIMAL(10, 2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (cart_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- CART ITEMS
    CREATE TABLE cart_items (
      cart_item_id INT NOT NULL AUTO_INCREMENT,
      cart_id INT NOT NULL,
      size VARCHAR(10) NULL, 
      variant_id INT NULL,
      product_id INT NULL,
      quantity INT NOT NULL DEFAULT 1,
      PRIMARY KEY (cart_item_id),
      FOREIGN KEY (cart_id) REFERENCES carts(cart_id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES product_variants(variant_id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



    -- ORDERS
    CREATE TABLE orders (
      order_id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      subtotal DECIMAL(10, 2) NOT NULL,            -- Total before discount
      discount_percent INT DEFAULT 0,             -- Discount applied (e.g., 15 for 15%)
      total_amount DECIMAL(10, 2) NOT NULL,        -- Total after discount
      address VARCHAR(255) NOT NULL,
      apartment_no VARCHAR(50) NOT NULL,
      city VARCHAR(100) NOT NULL,
      governorate ENUM('Giza', 'Cairo', 'Alexandria', '6th Of October') NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      status ENUM('Pending', 'Shipped', 'Delivered', 'Cancelled') DEFAULT 'Pending',
      PRIMARY KEY (order_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


    -- ORDER ITEMS
    CREATE TABLE order_items (
      order_item_id INT NOT NULL AUTO_INCREMENT,
      order_id INT NOT NULL,
      product_id INT NOT NULL,
      size VARCHAR(10) NULL, -- ✅ size field added
      variant_id INT NULL,
      quantity INT NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      PRIMARY KEY (order_item_id),
      FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES product_variants(variant_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- INSERT PRODUCTS (simplified here with correct SQL structure)
    INSERT INTO products (name, description, price, type, stock_quantity) VALUES
    ('Bling', '', 220, 'Bracelets', 10),
    ('Blue Pearl', '', 250, 'Bracelets', 10),
    ('Emerald', '', 250, 'Bracelets', 10),
    ('Emerald Seas (in dark green)', '', 250, 'Bracelets', 10),
    ('Emerald Seas (in light green)', '', 250, 'Bracelets', 10),
    ('Figaro', '', 220, 'Bracelets', 10),
    ('Green Pearl', '', 250, 'Bracelets', 10),
    ('Large Cuff', '', 390, 'Bracelets', 10),
    ('Lock and Key', '', 230, 'Bracelets', 10),
    ('Maris Pearl', '', 250, 'Bracelets', 10),
    ('Paper Clip', '', 210, 'Bracelets', 10),
    ('Purple Stones', '', 250, 'Bracelets', 10),
    ('Rainbow', '', 220, 'Bracelets', 10),
    ('Rod', '', 220, 'Bracelets', 10),
    ('Scarlet', '', 230, 'Bracelets', 10),
    ('Seashell', '', 290, 'Bracelets', 10),
    ('Small Cuff', '', 350, 'Bracelets', 10),
    ('Tiffany', '', 230, 'Bracelets', 10),
    ('Twisted', '', 210, 'Bracelets', 10),
    ('Bloom', '', 350, 'Earrings', 10),
    ('Blue Drip', '', 350, 'Earrings', 10),
    ('Blue Starfish', '', 350, 'Earrings', 10),
    ('Constellations', '', 350, 'Earrings', 10),
    ('Coral', '', 490, 'Earrings', 10),
    ('Engraved Eternal', '', 250, 'Earrings', 10),
    ('Eternal', '', 220, 'Earrings', 10),
    ('Green Hues', '', 290, 'Earrings', 10),
    ('La Perle', '', 350, 'Earrings', 10),
    ('Mini Seashell', '', 210, 'Earrings', 10),
    ('Paper Clip', '', 290, 'Earrings', 10),
    ('Pearl Nest', '', 350, 'Earrings', 10),
    ('Pearl Petal', '', 290, 'Earrings', 10),
    ('Pearly Eternal', '', 290, 'Earrings', 10),
    ('Pearly Starfish', '', 350, 'Earrings', 10),
    ('Pink Hues', '', 350, 'Earrings', 10),
    ('Seashell', '', 250, 'Earrings', 10),
    ('Seashore', '', 450, 'Earrings', 10),
    ('Sparkly Starfish', '', 290, 'Earrings', 10),
    ('Starfish', '', 350, 'Earrings', 10),
    ('Starlight (in blue)', '', 350, 'Earrings', 10),
    ('Starlight (in green)', '', 350, 'Earrings', 10),
    ('Starlight (in white)', '', 350, 'Earrings', 10),
    ('Starry Night', '', 350, 'Earrings', 10),
    ('Tiffany', '', 300, 'Earrings', 10),
    ('Triple Pearl', '', 350, 'Earrings', 10),
    ('Bling', '', 340, 'Hand Chains', 10),
    ('Blue Aura', '', 340, 'Hand Chains', 10),
    ('Bold', '', 340, 'Hand Chains', 10),
    ('Emerald', '', 400, 'Hand Chains', 10),
    ('Gemstone', '', 450, 'Hand Chains', 10),
    ('Green Aura', '', 340, 'Hand Chains', 10),
    ('Marly', '', 400, 'Hand Chains', 10),
    ('Mix and Match', '', 340, 'Hand Chains', 10),
    ('Ocean Pearl', '', 400, 'Hand Chains', 10),
    ('Pearly', '', 340, 'Hand Chains', 10),
    ('Plain V (in gold)', '', 340, 'Hand Chains', 10),
    ('Plain V (in silver)', '', 340, 'Hand Chains', 10),
    ('Red Aura', '', 340, 'Hand Chains', 10),
    ('Rod', '', 340, 'Hand Chains', 10),
    ('Scarlet', '', 340, 'Hand Chains', 10),
    ('The Golden Ovoid', '', 340, 'Hand Chains', 10),
    ('The OG (in gold)', '', 340, 'Hand Chains', 10),
    ('The OG (in silver)', '', 340, 'Hand Chains', 10),
    ('Verdant Star', '', 340, 'Hand Chains', 10),
    ('Vertical Gleam', '', 340, 'Hand Chains', 10),
    ('White Aura', '', 340, 'Hand Chains', 10),
    ('Marly', '', 490, 'Back Chains', 10),
    ('Pearly', '', 490, 'Back Chains', 10),
    ('The OG', '', 680, 'Back Chains', 10),
    ('Vertical Gleam', '', 680, 'Back Chains', 10),
    ('Bling Drop', '', 310, 'Necklaces', 10),
    ('Blue Aura Drop', '', 310, 'Necklaces', 10),
    ('Blue Pearl', '', 370, 'Necklaces', 10),
    ('Double The Aura Drop', '', 350, 'Necklaces', 10),
    ('Double The Bling Drop', '', 400, 'Necklaces', 10),
    ('Emerald Seas Drop (in dark green)', '', 450, 'Necklaces', 10),
    ('Emerald Seas Drop (in light green)', '', 450, 'Necklaces', 10),
    ('Figaro', '', 290, 'Necklaces', 10),
    ('Green Aura Drop', '', 310, 'Necklaces', 10),
    ('Green Pearl', '', 370, 'Necklaces', 10),
    ('Lock and Key', '', 320, 'Necklaces', 10),
    ('Marly Drop', '', 450, 'Necklaces', 10),
    ('Ocean Pearl Drop', '', 450, 'Necklaces', 10),
    ('Paper Clip (in gold)', '', 290, 'Necklaces', 10),
    ('Paper Clip (in silver)', '', 290, 'Necklaces', 10),
    ('Rainbow', '', 290, 'Necklaces', 10),
    ('Red Aura Drop', '', 310, 'Necklaces', 10),
    ('Rhinestones Drop', '', 310, 'Necklaces', 10),
    ('Scarlet', '', 290, 'Necklaces', 10),
    ('Scarlet Drop', '', 320, 'Necklaces', 10),
    ('Seashell', '', 390, 'Necklaces', 10),
    ('Seashore', '', 400, 'Necklaces', 10),
    ('The Golden Ovoid', '', 290, 'Necklaces', 10),
    ('The OG Drop (in gold)', '', 290, 'Necklaces', 10),
    ('The OG Drop (in silver)', '', 290, 'Necklaces', 10),
    ('Tiffany (in gold)', '', 320, 'Necklaces', 10),
    ('Tiffany (in silver)', '', 320, 'Necklaces', 10),
    ('Twisted', '', 290, 'Necklaces', 10),
    ('Vertical Gleam Drop', '', 290, 'Necklaces', 10),
    ('White Aura Drop', '', 310, 'Necklaces', 10),
    ('Seashell', '', 650, 'Sets', 10),
    ('Seashore', '', 800, 'Sets', 10),
    ('Twisted', '', 800, 'Sets', 10),
    ('Bling', '', 490, 'Waist Chains', 10),
    ('Emerald', '', 490, 'Waist Chains', 10),
    ('Golden Ovoid', '', 490, 'Waist Chains', 10),
    ('Ocean Pearl', '', 490, 'Waist Chains', 10),
    ('Pearly Hoops', '', 490, 'Waist Chains', 10),
    ('The OG', '', 490, 'Waist Chains', 10),
    ('The OG (double layered)', '', 490, 'Waist Chains', 10),
    ('Twisted', '', 490, 'Waist Chains', 10),
    ('Vertical Gleam', '', 490, 'Waist Chains', 10),
    ('The OG', '', 680, 'Body Chains', 10),
    ('Emerald', '', 680, 'Body Chains', 10),
    ('Vertical Gleam', '', 680, 'Body Chains', 10)


  `;

  try {
    await sequelize.query(resetQueries);
    res.status(200).json({ message: "Database reset successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error resetting database.", error });
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
    const { email, password } = req.body;

    const currentUser = await User.findOne({ where: { email } });
    if (!currentUser) {
      return res.status(404).json({ message: "User not found." });
    }

    const isMatch = await bcrypt.compare(password, currentUser.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password." });
    }

    const token = generateToken(currentUser);

    res.status(200).json({
      message: "Login successful",
      token, // ✅ Include JWT token in response
      user: {
        user_id: currentUser.user_id,
        email: currentUser.email,
        full_name: currentUser.full_name,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const signup = async (req, res) => {
  try {
    const { email, full_name, password, birthday } = req.body;

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists.' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const hashedPassword = await bcrypt.hash(password, 10);    

    // Store data temporarily
    verificationStore.set(email, { code: verificationCode, full_name, hashedPassword, birthday });


    await sendVerificationCodeEmail(email, full_name, verificationCode);

    res.status(200).json({ message: 'Verification code sent to your email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const verifyCodeAndSignup = async (req, res) => {
  try {
    const { email, code } = req.body;
    const stored = verificationStore.get(email);

    if (!stored || stored.code !== code) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    const { full_name, hashedPassword, birthday } = stored;

    // Create user
    const newUser = await User.create({
      email,
      full_name,
      password: hashedPassword,
      birthday
    });

    verificationStore.delete(email); // Remove after success

    const token = generateToken(newUser);

    res.status(201).json({
      message: 'User created successfully!',
      token,
      user: {
        user_id: newUser.user_id,
        email: newUser.email,
        full_name: newUser.full_name,
        birthday: newUser.birthday,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user_id = req.user.user_id;

    // Find the user by username
    const currentUser = await User.findOne({ user_id });
    if (!currentUser) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if the old password matches
    if (currentUser.password !== oldPassword) {
      return res.status(401).json({ message: "Invalid old password." });
    }

    // Ensure new password is different from the old password
    if (oldPassword === newPassword) {
      return res.status(400).json({ message: "New password cannot be the same as the old password." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password and save it to the database
    currentUser.password = hashedPassword;
    await currentUser.save();

    res.status(200).json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


export const sendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;
    console.log("Email: ", email);


    const currentUser = await User.findOne({ where: { email } });
    if (!currentUser) {
      return res.status(404).json({ message: "Email is not linked to any user" });
    }

    console.log( currentUser.dataValues);

    const verificationCode = crypto.randomInt(100000, 999999);
    const expirationTime = Date.now() + 5 * 60 * 1000; // 5 minutes

    verificationCodes.set(email, { code: verificationCode, expires: expirationTime });

    await sendPasswordResetEmail(currentUser, verificationCode);

    res.status(200).json({ message: "Verification code sent to email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const verifyCode = async (req, res) => {
  try {
    const { email, verificationCode } = req.body;
    const stored = verificationCodes.get(email);

    if (!stored || stored.code !== parseInt(verificationCode, 10) || Date.now() > stored.expires) {
      return res.status(400).json({ message: "Invalid or expired verification code" });
    }

    verificationCodes.delete(email);
    verifiedEmails.set(email, true); // Mark email as verified

    res.status(200).json({ message: "Verification successful." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!verifiedEmails.get(email)) {
      return res.status(403).json({ message: "Email not verified for password reset." });
    }

    const currentUser = await User.findOne({ where: { email } });
    if (!currentUser) {
      return res.status(404).json({ message: "User not found." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    currentUser.password = hashedPassword;
    await currentUser.save();

    verifiedEmails.delete(email); // One-time use

    res.status(200).json({ message: "Password has been reset successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


export const logout = async (req, res) => {
  try {
    const { username } = req.body;
    const currentUser = await User.findOne({ username });
    if (currentUser.firstLogin) {
      // Update the firstLogin field to false
      currentUser.firstLogin = false;
      await currentUser.save(); // Save the updated user to the database
    }
    res.status(200).json({ message: "Logout successful", user: currentUser });
  } catch (error) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};



