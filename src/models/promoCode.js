import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";
import User from "./user.js";

const PromoCode = sequelize.define("PromoCode", {
  promo_code_id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  promo_code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  discount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  tableName: "promo_codes",
  timestamps: false,
});

// Associations
PromoCode.belongsTo(User, { foreignKey: "user_id" });
User.hasMany(PromoCode, { foreignKey: "user_id" });

export default PromoCode;
