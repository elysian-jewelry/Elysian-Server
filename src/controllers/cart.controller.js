import Cart from "../models/cart.js";
import CartItem from "../models/cartItem.js";
import Product from "../models/product.js";
import ProductVariant from "../models/productVariant.js";
import { MAX_CART_ITEM_QUANTITY } from "../validation/cart.validation.js";
import { isValidPrice, unitPriceOf, toPiastres, toPounds } from "../utils/pricing.js";

// Convert a Mongoose Map (or plain object) into a serializable plain object.
const attrsToObject = (m) => {
  if (!m) return {};
  if (m instanceof Map) return Object.fromEntries(m);
  return { ...m };
};

export const addItemToCart = async (req, res, next) => {
  try {
    const { product_id, variant_id, quantity, notes } = req.body;
    const sanitizedNotes = typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 500) : null;
    const user_id = req.user.user_id;

    // The old guard was `!quantity || quantity <= 0`, which a JSON string
    // passes ("5" <= 0 is false). The raw value then reached
    // `existingItem.quantity + quantity`, where + is string concatenation:
    // adding "5" to an existing 5 produced "55", not 10 — and the stock
    // comparison coerced it back to a number, so a product with 60 in stock
    // accepted it. A float such as 1.5 got through too. Cast once here, and
    // use `qty` (never the raw body value) from this point on.
    const qty = Number(quantity);
    if (
      !product_id ||
      !Number.isInteger(qty) ||
      qty < 1 ||
      qty > MAX_CART_ITEM_QUANTITY
    ) {
      return res.status(400).json({ message: "Invalid product or quantity" });
    }

    const product = await Product.findById(product_id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const variants = await ProductVariant.find({
      _id: { $in: product.product_variants },
    });
    const hasVariants = variants.length > 0;

    // What this line is: which variant (or none), its price and stock, and
    // the attribute snapshot stored on a new line.
    let lineVariantId = null;
    let price;
    let stock;
    let attributes;
    let stockMessage;

    if (hasVariants) {
      if (!variant_id) {
        return res
          .status(400)
          .json({ message: "Variant ID is required for this product" });
      }

      const variant = await ProductVariant.findById(variant_id);
      if (!variant || !variant.product_id.equals(product._id)) {
        return res
          .status(400)
          .json({ message: "Variant does not belong to the specified product" });
      }

      lineVariantId = variant._id;
      // Variant products are priced only by the variant, never the product.
      price = variant.price;
      stock = variant.stock_quantity;
      // Snapshot the variant attributes so cart display works without a join.
      attributes = attrsToObject(variant.attributes);
      stockMessage = "Requested quantity exceeds available variant stock";
    } else {
      if (variant_id) {
        return res
          .status(400)
          .json({ message: "This product does not support variants" });
      }

      price = product.price;
      stock = product.stock_quantity;
      stockMessage = "Requested quantity exceeds available stock";
    }

    // Old data can still hold a missing or 0 price; don't let it into a cart.
    if (!isValidPrice(price)) {
      return res
        .status(400)
        .json({ message: "This item can't be added to the cart right now." });
    }

    if (qty > stock) {
      return res.status(400).json({ message: stockMessage });
    }

    // Get the user's cart, creating it on first use, in one atomic step. Two
    // first adds at the same moment used to both try to create it, and one
    // failed with a 500 on the unique user_id index.
    const cart = await Cart.findOneAndUpdate(
      { user_id },
      { $setOnInsert: { total_price: 0 } },
      { upsert: true, new: true }
    );

    // Add to the line for this product/option, or create it, in one atomic
    // step. Together with the unique index on cart_items, two quick adds of
    // the same item land on one line instead of creating two.
    const line = await CartItem.findOneAndUpdate(
      { cart_id: cart._id, product_id: product._id, variant_id: lineVariantId },
      {
        $inc: { quantity: qty },
        $setOnInsert: { notes: sanitizedNotes, ...(attributes && { attributes }) },
      },
      { upsert: true, new: true }
    );

    // Over the stock or the per-line maximum now? Take back only what this
    // request added, so concurrent adds can never push a line past the limit.
    if (line.quantity > Math.min(stock, MAX_CART_ITEM_QUANTITY)) {
      await CartItem.updateOne({ _id: line._id }, { $inc: { quantity: -qty } });
      // Only reachable if the line was changed by another request in between.
      await CartItem.deleteOne({ _id: line._id, quantity: { $lt: 1 } });
      return res.status(400).json({
        message:
          line.quantity > stock
            ? stockMessage
            : `Quantity must not exceed ${MAX_CART_ITEM_QUANTITY}`,
      });
    }

    // $addToSet keeps cart.items in sync without ever adding an id twice.
    await Cart.updateOne({ _id: cart._id }, { $addToSet: { items: line._id } });

    await recalculateCartTotal(cart._id);
    const updatedCart = await Cart.findById(cart._id).populate("items");

    return res.status(200).json({ message: "Product added to cart", cart: updatedCart });
  } catch (error) {
    console.error(error);
    return next(error);
  }
};

// The single place a cart's stored total is computed. Used by every cart
// action, by checkout (after removing unavailable lines) and by admin
// product/variant changes.
//
// Same pricing rule as checkout (utils/pricing.js): a variant line is priced
// by its variant only. A line with no usable price — its variant or product
// was deleted — counts as 0; checkout removes such lines.
export const recalculateCartTotal = async (cartId) => {
  const items = await CartItem.find({ cart_id: cartId })
    .populate({ path: "variant_id", select: "price" })
    .populate({ path: "product_id", select: "price" });

  const totalPiastres = items.reduce(
    (sum, item) => sum + (toPiastres(unitPriceOf(item)) || 0) * item.quantity,
    0
  );

  await Cart.findByIdAndUpdate(cartId, { total_price: toPounds(totalPiastres) });
};

// Increment item quantity
export const incrementCartItem = async (req, res, next) => {
  try {
    const { cart_item_id } = req.body;
    const user_id = req.user.user_id;

    const item = await CartItem.findById(cart_item_id)
      .populate("variant_id")
      .populate("product_id")
      .populate("cart_id");

    if (!item) return res.status(404).json({ message: "Item not found" });
    if (item.cart_id.user_id.toString() !== user_id)
      return res.status(403).json({ message: "Unauthorized" });

    const quantityAfterIncrement = item.quantity + 1;

    // Without this the /cart/add ceiling is trivially bypassed by repeating
    // the increment call.
    if (quantityAfterIncrement > MAX_CART_ITEM_QUANTITY) {
      return res.status(400).json({
        message: `Quantity must not exceed ${MAX_CART_ITEM_QUANTITY}`,
      });
    }

    if (item.variant_id) {
      if (item.variant_id.stock_quantity < quantityAfterIncrement) {
        return res
          .status(400)
          .json({ message: "Not enough variant stock available" });
      }
    } else {
      const product = item.product_id;
      if (!product) return res.status(500).json({ message: "Product not found" });
      if (product.stock_quantity < quantityAfterIncrement) {
        return res.status(400).json({ message: "Not enough stock available" });
      }
    }

    item.quantity = quantityAfterIncrement;
    await item.save();

    await recalculateCartTotal(item.cart_id._id);

    return res.json({ message: "Item incremented", item });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error incrementing item" });
  }
};

// Decrement item quantity
export const decrementCartItem = async (req, res, next) => {
  try {
    const { cart_item_id } = req.body;
    const user_id = req.user.user_id;

    const item = await CartItem.findById(cart_item_id).populate("cart_id");

    if (!item) return res.status(404).json({ message: "Item not found" });
    if (item.cart_id.user_id.toString() !== user_id)
      return res.status(403).json({ message: "Unauthorized" });

    if (item.quantity <= 1) {
      await CartItem.findByIdAndDelete(cart_item_id);
      await Cart.findByIdAndUpdate(item.cart_id._id, {
        $pull: { items: cart_item_id },
      });
    } else {
      item.quantity -= 1;
      await item.save();
    }

    await recalculateCartTotal(item.cart_id._id);

    return res.json({ message: "Item decremented or removed", item });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error decrementing item" });
  }
};

export const deleteCartItem = async (req, res, next) => {
  try {
    const { cart_item_id } = req.body;
    const user_id = req.user.user_id;

    const item = await CartItem.findById(cart_item_id).populate("cart_id");

    if (!item) return res.status(404).json({ message: "Item not found" });
    if (item.cart_id.user_id.toString() !== user_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await CartItem.findByIdAndDelete(cart_item_id);
    await Cart.findByIdAndUpdate(item.cart_id._id, {
      $pull: { items: item._id },
    });

    await recalculateCartTotal(item.cart_id._id);

    return res.json({ message: "Item deleted" });
  } catch (err) {
    console.error("Error deleting cart item:", err);
    return res.status(500).json({ message: "Error deleting item" });
  }
};

export const getUserCart = async (req, res, next) => {
  try {
    const user_id = req.user.user_id;

    const cart = await Cart.findOne({ user_id }).populate({
      path: "items",
      populate: [
        {
          path: "variant_id",
          model: "ProductVariant",
          populate: {
            path: "product_id",
            model: "Product",
            populate: {
              path: "images",
              model: "ProductImage",
              match: { is_primary: true },
              select: "image_url",
            },
            select: "_id name type",
          },
          select: "_id attributes price description",
        },
        {
          path: "product_id",
          model: "Product",
          populate: {
            path: "images",
            model: "ProductImage",
            match: { is_primary: true },
            select: "image_url",
          },
          select: "_id name type price",
        },
      ],
    });

    if (!cart || cart.items.length === 0) {
      return res.status(404).json({ message: "Cart is empty" });
    }

    const simplifiedCart = {
      cart_id: cart._id,
      user_id: cart.user_id,
      total_price: parseFloat(cart.total_price).toFixed(2),
      cart_items: cart.items.map((item) => {
        const variant = item.variant_id;
        const product = variant?.product_id || item.product_id || {};
        const image = product.images?.[0];

        // Prefer the snapshot stored on the cart item; fall back to the
        // current variant attributes if older items predate the migration.
        const attributes =
          attrsToObject(item.attributes) || attrsToObject(variant?.attributes);

        return {
          cart_item_id: item._id,
          quantity: item.quantity,
          variant_id: variant ? variant._id : null,
          attributes,
          variant_description: variant?.description || "",
          notes: item.notes || null,
          // Variant lines show the variant's price only, never the product's.
          price: (Number(unitPriceOf(item)) || 0).toFixed(2),
          product_id: product._id,
          product_name: product.name || null,
          product_type: product.type || null,
          image_url: image?.image_url || null,
        };
      }),
    };

    return res.status(200).json({ success: true, cart: simplifiedCart });
  } catch (error) {
    console.error("Error fetching cart:", error);
    return next(error);
  }
};
