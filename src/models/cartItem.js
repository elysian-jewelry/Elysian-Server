import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";
import Cart from "./cart.js";
import Product from "./product.js";

const CartItem = sequelize.define("CartItem", {
  cart_item_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: true, // Optional for products that don’t need size
  }
}, {
  tableName: "cart_items",
  timestamps: false,
});

// Associations
CartItem.belongsTo(Cart, { foreignKey: "cart_id" });
Cart.hasMany(CartItem, { foreignKey: "cart_id" });

CartItem.belongsTo(Product, { foreignKey: "product_id" });
Product.hasMany(CartItem, { foreignKey: "product_id" });

export default CartItem;
