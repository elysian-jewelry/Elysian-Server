import jwt from "jsonwebtoken";
import User from "../models/user.js";
import { sendVerificationCodeEmail  } from "../middlewares/mailer.middleware.js"; // your custom mail sender


// In-memory store (or use Redis in production)
const verificationStore = new Map(); // email -> { code, full_name, hashedPassword }


const generateToken = (user) => {
  return jwt.sign(
    {
      user_id: user._id,
      email: user.email,
      birthday: user.birthday,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
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





