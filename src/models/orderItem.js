import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Order from './order.js';
import Product from './product.js';
import ProductVariant from './productVariant.js';

const OrderItem = sequelize.define('OrderItem', {
  order_item_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'order_id',
    },
    onDelete: 'CASCADE',
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products',
      key: 'product_id',
    },
    onDelete: 'CASCADE',
  },
  variant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'product_variants',
      key: 'variant_id',
    },
    onDelete: 'CASCADE',
  },
  size: {
    type: DataTypes.STRING(10),
    allowNull: true, // Optional size for non-variant products like Waist Chains
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  price_at_time: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
}, {
  tableName: 'order_items',
  timestamps: false,
});

// Associations
OrderItem.belongsTo(Order, { foreignKey: 'order_id', onDelete: 'CASCADE' });
Order.hasMany(OrderItem, { foreignKey: 'order_id', onDelete: 'CASCADE' });

OrderItem.belongsTo(Product, { foreignKey: 'product_id', onDelete: 'CASCADE' });
Product.hasMany(OrderItem, { foreignKey: 'product_id', onDelete: 'CASCADE' });

OrderItem.belongsTo(ProductVariant, { foreignKey: 'variant_id', onDelete: 'CASCADE' });
ProductVariant.hasMany(OrderItem, { foreignKey: 'variant_id', onDelete: 'CASCADE' });

export default OrderItem;
