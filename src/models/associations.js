import Product from './product.js';
import ProductImage from './productImage.js';

// Define the associations here
Product.hasMany(ProductImage, {
  foreignKey: 'product_id',
  as: 'images',
  onDelete: 'CASCADE',
});

ProductImage.belongsTo(Product, {
  foreignKey: 'product_id',
  onDelete: 'CASCADE',
});
