import Product from "../../models/product.js";
import ProductImage from "../../models/productImage.js";
import ProductVariant from "../../models/productVariant.js";


const FEATURED_PRODUCT_IDS = [62, 109, 34]; // example featured product IDs
const NEW_ARRIVAL_IDS = [75, 115, 52, 91];       // example new arrival product IDs


export const getNewArrivalProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: {
        product_id: NEW_ARRIVAL_IDS
      },
      include: [
        {
          model: ProductImage,
          as: "images",
          limit: 4,
          attributes: ["image_url", "is_primary"]
        },
        {
          model: ProductVariant,
          attributes: ["variant_id", "size", "price", "stock_quantity"]
        }
      ],
      order: [["product_id", "ASC"]],
    });

    res.status(200).json(formatProductResponse(products));
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching new arrivals", error });
  }
};


export const getFeaturedProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: {
        product_id: FEATURED_PRODUCT_IDS
      },
      include: [
        {
          model: ProductImage,
          as: "images",
          limit: 4,
          attributes: ["image_url", "is_primary"]
        },
        {
          model: ProductVariant,
          attributes: ["variant_id", "size", "price", "stock_quantity"]
        }
      ],
      order: [["product_id", "ASC"]],
    });

    res.status(200).json(formatProductResponse(products));
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching featured products", error });
  }
};


// Update stock quantity for a product by name and type
export const updateProductQuantity = async (req, res) => {
  const { name, type, quantity } = req.body;

  if (!name || !type || typeof quantity !== "number") {
    return res.status(400).json({ message: "name, type, and quantity (number) are required." });
  }

  try {
    const product = await Product.findOne({
      where: {
        name,
        type
      }
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    product.stock_quantity = quantity;
    await product.save();

    res.status(200).json({ message: "Stock quantity updated successfully.", product });
  } catch (error) {
    console.error("Error updating product quantity:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

const formatProductResponse = (productsRaw) => {
  return productsRaw.map(product => {
    const plain = product.toJSON();

    // Build variants if any
    const variants = plain.ProductVariants?.length
      ? plain.ProductVariants.map(v => ({
          variant_id: v.variant_id,
          size: v.size,
          price: v.price,
          stock_quantity: v.stock_quantity
        }))
      : [];

    // Remove ProductVariants from raw output
    delete plain.ProductVariants;

    // Attach variants only if present
    if (variants.length > 0) {
      plain.variants = variants;
      delete plain.price; // remove product-level price if variants exist
    }

    return plain;
  });
};

// Get all products with max 4 images + variants
export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      include: [
        {
          model: ProductImage,
          as: "images",
          limit: 4,
          attributes: ["image_url", "is_primary"]
        },
        {
          model: ProductVariant,
          attributes: ["variant_id", "size", "price", "stock_quantity"]
        }
      ],
      order: [["product_id", "ASC"]],
    });

    res.status(200).json(formatProductResponse(products));
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching products", error });
  }
};

// Get products by type with max 4 images + variants
export const getProductsByType = async (req, res) => {
  try {
    const { type } = req.body;

    if (!type) {
      return res.status(400).json({ message: "Body parameter 'type' is required" });
    }

    const products = await Product.findAll({
      where: { type },
      include: [
        {
          model: ProductImage,
          as: "images",
          limit: 4,
          attributes: ["image_url", "is_primary"]
        },
        {
          model: ProductVariant,
          attributes: ["variant_id", "size", "price", "stock_quantity"]
        }
      ],
      order: [["product_id", "ASC"]],
    });

    res.status(200).json(formatProductResponse(products));
  } catch (error) {
    res.status(500).json({ message: "Error fetching products by type", error });
  }
};