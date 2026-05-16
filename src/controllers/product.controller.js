import Product from "../models/product.js";
import HomeSection from "../models/homeSection.js";
import ProductCategory from "../models/productCategory.js";

export const getCategories = async (req, res) => {
  try {
    const managed = await ProductCategory.find({ is_active: true })
      .sort({ sort_order: 1, name: 1 })
      .select("name")
      .lean();
    return res.status(200).json(managed.map((c) => c.name));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error fetching categories", error });
  }
};

/**
 * Read the singleton home-sections document. Returns `{ featured: [], new_arrivals: [] }`
 * if it has not been created yet.
 */
const loadHomeSection = async () => {
  const doc = await HomeSection.findOne({ key: "home" }).lean();
  return doc || { featured: [], new_arrivals: [] };
};

/**
 * Hydrate a list of product ObjectIds into fully-populated product documents,
 * preserving the curator's ordering. Products that no longer exist are skipped.
 */
const hydrateProductIds = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const products = await Product.find({ _id: { $in: ids } })
    .populate({ path: "images", select: "image_url is_primary", options: { limit: 5 } })
    .populate({ path: "product_variants", select: "size price color stock_quantity" });

  const byId = new Map(products.map((p) => [String(p._id), p]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
};

export const getFeaturedProducts = async (req, res) => {
  try {
    const home = await loadHomeSection();
    const products = await hydrateProductIds(home.featured);
    return res.status(200).json(formatProductResponse(products));
  } catch (error) {
    console.error("Error fetching featured products:", error);
    return res.status(500).json({
      message: "Error fetching featured products",
      error: error.message,
    });
  }
};

export const getNewArrivalProducts = async (req, res) => {
  try {
    const home = await loadHomeSection();
    const products = await hydrateProductIds(home.new_arrivals);
    return res.status(200).json(formatProductResponse(products));
  } catch (error) {
    console.error("Error fetching new arrivals:", error);
    return res.status(500).json({
      message: "Error fetching new arrivals",
      error: error.message,
    });
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

    const populateImages = { path: "images", select: "image_url is_primary", options: { limit: 5 } };
    const populateVariants = { path: "product_variants", select: "variant_id size color price stock_quantity" };

    const ordered = await Product.find({ type, sort_order: { $gt: 0 } })
      .populate(populateImages)
      .populate(populateVariants)
      .sort({ sort_order: 1 });

    const unordered = await Product.find({ type, sort_order: { $lte: 0 } })
      .populate(populateImages)
      .populate(populateVariants);

    const products = [...ordered, ...unordered];

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
    const plain =
      typeof product.toObject === "function"
        ? product.toObject()
        : { ...product };

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
    const populateImages = { path: "images", select: "image_url is_primary", options: { limit: 5 } };
    const populateVariants = { path: "product_variants", select: "size price color stock_quantity" };

    const ordered = await Product.find({ sort_order: { $gt: 0 } })
      .populate(populateImages)
      .populate(populateVariants)
      .sort({ sort_order: 1 });

    const unordered = await Product.find({ sort_order: { $lte: 0 } })
      .populate(populateImages)
      .populate(populateVariants);

    const products = [...ordered, ...unordered];

    res.status(200).json(formatProductResponse(products));
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Error fetching products", error });
  }
};
