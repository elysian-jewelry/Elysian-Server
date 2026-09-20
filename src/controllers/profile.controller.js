import User from "../models/user.js";
import { grantBirthdayPromoIfDue } from "../services/birthdayPromo.service.js";

// Get user profile
export const getUserProfile = async (req, res, next) => {
  try {
    const user_id = req.user.user_id;

    const user = await User.findById(user_id).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update user profile
export const updateUserProfile = async (req, res, next) => {
  try {
    const user_id = req.user.user_id;
    const { birthday } = req.body;

    const user = await User.findById(user_id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.birthday = birthday;

    await user.save();

    // If the date just saved is today, issue this year's birthday code now
    // rather than leaving it to the next cron tick (which would miss anyone
    // who set it after the tick). The grant is idempotent, and a mail
    // failure must not turn a successful save into an error — it is logged
    // and the cron retries.
    try {
      await grantBirthdayPromoIfDue(user);
    } catch (err) {
      console.error(`Birthday promo after profile update failed for ${user.email}:`, err?.message || err);
    }

    res.json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update profile" });
  }
};
