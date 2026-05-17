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

const loadHomeSection = async () => {
  const doc = await HomeSection.findOne({ key: "home" }).lean();
  return doc || { featured: [], new_arrivals: [] };
};

const VARIANT_SELECT = "_id attributes price stock_quantity description";

const hydrateProductIds = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const products = await Product.find({ _id: { $in: ids } })
    .populate({ path: "images", select: "image_url is_primary sort_order", options: { sort: { sort_order: 1 } } })
    .populate({ path: "product_variants", select: VARIANT_SELECT });

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

// Convert a Mongoose Map (or plain object) into a serializable plain object.
const attrsToObject = (m) => {
  if (!m) return {};
  if (m instanceof Map) return Object.fromEntries(m);
  return { ...m };
};

export const getProductsByType = async (req, res) => {
  try {
    const { type } = req.query;

    if (!type || typeof type !== "string") {
      return res.status(400).json({
        message: "type query parameter is required",
      });
    }

    const populateImages = { path: "images", select: "image_url is_primary sort_order", options: { sort: { sort_order: 1 } } };
    const populateVariants = { path: "product_variants", select: VARIANT_SELECT };

    const ordered = await Product.find({ type, sort_order: { $gt: 0 } })
      .populate(populateImages)
      .populate(populateVariants)
      .sort({ sort_order: 1 });

    const unordered = await Product.find({ type, sort_order: { $lte: 0 } })
      .populate(populateImages)
      .populate(populateVariants);

    const products = [...ordered, ...unordered];

    return res.status(200).json(formatProductResponse(products));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching products by type", error });
  }
};

const formatProductResponse = (productsRaw) => {
  return productsRaw.map((product) => {
    const plain =
      typeof product.toObject === "function"
        ? product.toObject()
        : { ...product };

    // Images are already sorted by sort_order from the DB populate — no re-sorting needed.

    const variants = plain.product_variants?.length
      ? plain.product_variants.map((v) => ({
          variant_id: v._id,
          attributes: attrsToObject(v.attributes),
          description: v.description || "",
          price: v.price,
          stock_quantity: v.stock_quantity,
        }))
      : [];

    delete plain.product_variants;

    if (variants.length > 0) {
      plain.variants = variants;
      delete plain.price; // remove product-level price if variants exist
    }

    // Ensure option_type is a string or null on the wire.
    plain.option_type = plain.option_type || null;

    plain.product_id = plain._id;
    delete plain._id;
    delete plain.__v;

    return plain;
  });
};

export const getAllProducts = async (req, res) => {
  try {
    const populateImages = {
  path: "images",
  select: "image_url is_primary sort_order",
  options: { sort: { sort_order: 1 } }
};
    const populateVariants = { path: "product_variants", select: VARIANT_SELECT };

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
