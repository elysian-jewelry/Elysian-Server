import Product from "../models/product.js";
import OrderItem from "../models/orderItem.js";

// New arrivals based on name and type
const NEW_ARRIVALS = [
  { name: "Double The Bling Drop", type: "Necklaces" },
  { name: "Vertical Gleam", type: "Body Chains" },
  { name: "Marly", type: "Hand Chains" },
  { name: "Seashell", type: "Necklaces" }
];

export const getFeaturedProducts = async (req, res) => {
  try {
    // 1️⃣ Aggregate most ordered products
    const aggregated = await OrderItem.aggregate([
      {
        $group: {
          _id: "$product_id",
          totalOrdered: { $sum: "$quantity" },
        },
      },
      { $sort: { totalOrdered: -1 } },
      { $limit: 20 }, // take more to allow filtering
    ]);

    if (!aggregated.length) {
      return res.status(200).json([]);
    }

    const productIds = aggregated.map(p => p._id);

    // 2️⃣ Fetch products WITHOUT variants
    const products = await Product.find({
      _id: { $in: productIds },
      $or: [
        { product_variants: { $exists: false } },
        { product_variants: { $size: 0 } },
      ],
    })
      .populate({
        path: "images",
        select: "image_url is_primary",
        options: { limit: 4 },
      });

    // 3️⃣ Preserve order and limit to top 4
    const orderedProducts = aggregated
      .map(a =>
        products.find(p => p._id.toString() === a._id.toString())
      )
      .filter(Boolean)
      .slice(0, 4);

    res.status(200).json(formatProductResponse(orderedProducts));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error fetching featured products",
      error,
    });
  }
};



export const getNewArrivalProducts = async (req, res) => {
  try {
    const products = await Product.find({ $or: NEW_ARRIVALS })
      .sort({ name: 1 })
      .populate({
        path: "images",
        select: "image_url is_primary",
        options: { limit: 4 }
      })
      .populate({
        path: "product_variants",
        select: "variant_id size color price stock_quantity"
      });

    res.status(200).json(formatProductResponse(products));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching new arrivals", error });
  }
};


export const getProductsByType = async (req, res) => {
  try {
    const { type } = req.query;

    if (!type || typeof type !== "string") {
      return res.status(400).json({
        message: "type query parameter is required",
      });
    }

    const products = await Product.find({ type })
      .populate({
        path: "images",
        select: "image_url is_primary",
        options: { limit: 4 }
      })
      .populate({
        path: "product_variants",
        select: "variant_id size color price stock_quantity"
      })
      .sort({ sort_order: 1 }); // MongoDB equivalent of ORDER BY product_id ASC

    const formatted = products.map((product) => {
      const productObj = product.toObject();

      // 🆕 Sort images so primary comes first
      if (productObj.images && productObj.images.length > 0) {
        productObj.images.sort((a, b) => b.is_primary - a.is_primary);
      }

      // Format variants
      const variants = productObj.product_variants?.map(v => ({
        variant_id: v._id,
        size: v.size,
        color: v.color,
        price: v.price,
        stock_quantity: v.stock_quantity
      })) || [];

      if (variants.length > 0) {
        productObj.variants = variants;
        delete productObj.price; // remove product-level price if variants exist
      }

      // Normalize product_id
      productObj.product_id = productObj._id;
      delete productObj._id;
      delete productObj.__v;
      delete productObj.product_variants;

      return productObj;
    });

    res.status(200).json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching products by type", error });
  }
};



const formatProductResponse = (productsRaw) => {
  return productsRaw.map(product => {
    const plain = product.toObject();

      // 🆕 Sort images so primary image comes first
    if (plain.images && plain.images.length > 0) {
      plain.images.sort((a, b) => b.is_primary - a.is_primary);
    }


    const variants = plain.product_variants?.length
      ? plain.product_variants.map(v => ({
          variant_id: v._id,
          size: v.size,
          color: v.color,
          price: v.price,
          stock_quantity: v.stock_quantity
        }))
      : [];

    // Clean up the raw fields
    delete plain.product_variants;

    if (variants.length > 0) {
      plain.variants = variants;
      delete plain.price; // remove product-level price if variants exist
    }

    // Rename _id to product_id for compatibility
    plain.product_id = plain._id;
    delete plain._id;
    delete plain.__v;

    return plain;
  });
};


export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .populate({
        path: "images",
        select: "image_url is_primary",
        options: { limit: 4 },
      })
      .populate({
        path: "product_variants",
        select: "size price color stock_quantity",
      })
      .sort({ sort_order: 1 }); // equivalent to product_id ASC

    res.status(200).json(formatProductResponse(products));
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Error fetching products", error });
  }
};
