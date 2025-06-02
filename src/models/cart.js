import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";
import User from "./user.js";

const Cart = sequelize.define("Cart", {
  cart_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  total_price: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
}, {
  tableName: "carts",
  timestamps: false,
});

// One-to-one: Each user has one cart
Cart.belongsTo(User, { foreignKey: "user_id" });
User.hasOne(Cart, { foreignKey: "user_id" });

export default Cart;
