import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";
import Cart from "./cart.js";
import Product from "./product.js";
import ProductVariant from "./productVariant.js";

const CartItem = sequelize.define("CartItem", {
  cart_item_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  cart_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "carts",
      key: "cart_id",
    },
    onDelete: "CASCADE",
  },
  variant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: "product_variants",
      key: "variant_id",
    },
    onDelete: "CASCADE",
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: "products",
      key: "product_id",
    },
    onDelete: "CASCADE",
  },
  size: {
    type: DataTypes.STRING(10),
    allowNull: true, // Optional; used for non-variant items that require size info
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
}, {
  tableName: "cart_items",
  timestamps: false,
});

// Associations
CartItem.belongsTo(Cart, { foreignKey: "cart_id", onDelete: "CASCADE" });
Cart.hasMany(CartItem, { foreignKey: "cart_id", onDelete: "CASCADE" });

CartItem.belongsTo(ProductVariant, { foreignKey: "variant_id", onDelete: "CASCADE" });
ProductVariant.hasMany(CartItem, { foreignKey: "variant_id", onDelete: "CASCADE" });

CartItem.belongsTo(Product, { foreignKey: "product_id", onDelete: "CASCADE" });
Product.hasMany(CartItem, { foreignKey: "product_id", onDelete: "CASCADE" });

export default CartItem;
