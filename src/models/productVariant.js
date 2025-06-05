import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";
import Product from "./product.js";

const ProductVariant = sequelize.define("ProductVariant", {
  variant_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "products",
      key: "product_id",
    },
    onDelete: "CASCADE",
  },
  size: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  stock_quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: "product_variants",
  timestamps: false,
});

// Associations
ProductVariant.belongsTo(Product, { foreignKey: "product_id", onDelete: "CASCADE" });
Product.hasMany(ProductVariant, { foreignKey: "product_id", onDelete: "CASCADE" });

export default ProductVariant;
