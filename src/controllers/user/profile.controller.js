// // controllers/user/profile.controller.js

// import User from "../../model/user.js";

// export const getUserProfile = async (req, res) => {
//   try {
//     const userId = req.user.user_id;

//     const user = await User.findByPk(userId, {
//       attributes: { exclude: ["password"] },
//     });

//     if (!user) return res.status(404).json({ message: "User not found" });

//     res.json(user);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };

// export const updateUserProfile = async (req, res) => {
//   try {
//     const userId = req.user.user_id;
//     const { first_name, last_name, birthday } = req.body;

//     const user = await User.findByPk(userId);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     // Update only allowed fields
//     user.first_name = first_name;
//     user.last_name = last_name;
//     user.birthday = birthday;

//     await user.save();

//     res.json({ message: "Profile updated successfully" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to update profile" });
//   }
// };




import User from "../../models/user.js"; // Adjust the path as needed
import mongoose from "mongoose";

export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(userId).select("-__v"); // password field not present in schema

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { first_name, last_name, birthday } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Update allowed fields
    user.first_name = first_name ?? user.first_name;
    user.last_name = last_name ?? user.last_name;
    user.birthday = birthday ?? user.birthday;

    await user.save();

    res.json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update profile" });
  }
};
