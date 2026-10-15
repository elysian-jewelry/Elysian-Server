import mongoose from "mongoose";

const cartSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true  // Ensures one cart per user
    },
    total_price: {
      type: Number,
      default: 0.0,
    },
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CartItem",
      },
    ],
    // Set while a checkout is running on this cart, so a second checkout
    // sent at the same moment is turned away instead of ordering twice.
    checkout_locked_at: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "carts",
    timestamps: true,
  }
);

const Cart = mongoose.model("Cart", cartSchema);

export default Cart;
