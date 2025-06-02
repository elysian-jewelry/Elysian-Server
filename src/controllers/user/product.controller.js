import Product from "../../models/product.js";
import ProductImage from "../../models/productImage.js";

// Get all products with max 4 images
export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      include: [{
        model: ProductImage,
        as: 'images',
        limit: 4,
        attributes: ['image_url', 'is_primary']
      }],
      order: [['product_id', 'ASC']],
    });

    res.status(200).json(products);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching products", error });
  }
};

// Get products by type with max 4 images
export const getProductsByType = async (req, res) => {
  try {
    const { type } = req.body;

    if (!type) {
      return res.status(400).json({ message: "Body parameter 'type' is required" });
    }

    const products = await Product.findAll({
      where: { type },
      include: [{
        model: ProductImage,
        as: 'images',
        limit: 4,
        attributes: ['image_url', 'is_primary']
      }],
      order: [['product_id', 'ASC']],
    });

    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: "Error fetching products by type", error });
  }
};
