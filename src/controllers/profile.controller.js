import User from "../models/user.js";

// Get user profile
export const getUserProfile = async (req, res) => {
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
export const updateUserProfile = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { first_name, last_name, birthday } = req.body;

    const user = await User.findById(user_id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Update only allowed fields
    if (first_name !== undefined) user.first_name = first_name;
    if (last_name !== undefined) user.last_name = last_name;
    if (birthday !== undefined) user.birthday = birthday;

    await user.save();

    res.json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update profile" });
  }
};
