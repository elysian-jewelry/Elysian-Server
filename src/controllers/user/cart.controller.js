import Cart from "../../models/cart.js";
import CartItem from "../../models/cartItem.js";
import Product from "../../models/product.js";
import ProductImage from "../../models/productImage.js";
import ProductVariant from "../../models/productVariant.js";

export const addItemToCart = async (req, res) => {
  try {
    const { product_id, variant_id, quantity, size } = req.body;
    const user_id = req.user.user_id;
    console.log(user_id);
    

    if (!product_id || !quantity || quantity <= 0) {
      return res.status(400).json({ message: "Invalid product or quantity" });
    }

    const product = await Product.findById(product_id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const type = product.type;
    const name = product.name;

    const requiresSize =
      type === 'Waist Chains' ||
      type === 'Body Chains' ||
      (type === 'Back Chains' && ['The OG', 'Vertical Gleam'].includes(name));

    if (requiresSize && (!size || !['S/M', 'M/L'].includes(size))) {
      return res.status(400).json({
        message: `${type} ${name || ''} requires a size of 'S/M' or 'M/L'`,
      });
    }

    let cart = await Cart.findOne({ user_id }).populate('items');
    if (!cart) {
      cart = await Cart.create({ user_id, total_price: 0, items: [] });
    }

    const variants = await ProductVariant.find({ _id: { $in: product.product_variants } });
    const hasVariants = variants.length > 0;

    let newCartItem = null;

    if (hasVariants) {
      if (!variant_id) {
        return res.status(400).json({ message: "Variant ID is required for this product" });
      }

      const variant = await ProductVariant.findById(variant_id);
      if (!variant || !variant.product_id.equals(product._id)) {
        return res.status(400).json({ message: "Variant does not belong to the specified product" });
      }

      const existingItem = await CartItem.findOne({
        cart_id: cart._id,
        product_id,
        variant_id
      });

      const totalQty = existingItem ? existingItem.quantity + quantity : quantity;
      if (variant.stock_quantity < totalQty) {
        return res.status(400).json({ message: "Requested quantity exceeds available variant stock" });
      }

      if (existingItem) {
        existingItem.quantity = totalQty;
        await existingItem.save();
        newCartItem = existingItem;
      } else {
        newCartItem = await CartItem.create({
          cart_id: cart._id,
          product_id,
          variant_id,
          quantity,
          size: variant.size
        });
        cart.items.push(newCartItem._id);
      }

    } else {
      if (variant_id) {
        return res.status(400).json({ message: "This product does not support variants" });
      }

      const existingItem = await CartItem.findOne({
        cart_id: cart._id,
        product_id,
        variant_id: null,
        ...(size ? { size } : {})
      });

      const totalQty = existingItem ? existingItem.quantity + quantity : quantity;

      if (product.stock_quantity < totalQty) {
        return res.status(400).json({ message: "Requested quantity exceeds available stock" });
      }

      if (existingItem) {
        existingItem.quantity = totalQty;
        await existingItem.save();
        newCartItem = existingItem;
      } else {
        newCartItem = await CartItem.create({
          cart_id: cart._id,
          product_id,
          variant_id: null,
          quantity,
          ...(size && { size })
        });
        cart.items.push(newCartItem._id);
      }
    }

    // Save updated cart
    await cart.save();

    // Recalculate total price
    const items = await CartItem.find({ cart_id: cart._id }).populate({
      path: 'variant_id',
      select: 'price'
    });

    const totalPrice = await Promise.all(items.map(async item => {
      if (item.variant_id && item.variant_id.price) {
        return item.quantity * parseFloat(item.variant_id.price);
      } else {
        const fallbackProduct = await Product.findById(item.product_id).select('price');
        return item.quantity * parseFloat(fallbackProduct.price);
      }
    }));

    cart.total_price = totalPrice.reduce((sum, val) => sum + val, 0);
    await cart.save();

    return res.status(200).json({ message: "Product added to cart", cart });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error adding to cart", error });
  }
};

const recalculateCartTotal = async (cartId) => {
  const cartItems = await CartItem.find({ cart_id: cartId });

  let total = 0;

  for (const item of cartItems) {
    let price = 0;

    if (item.variant_id) {
      const variant = await ProductVariant.findById(item.variant_id).select("price");
      price = variant?.price || 0;
    } else if (item.product_id) {
      const product = await Product.findById(item.product_id).select("price");
      price = product?.price || 0;
    }

    total += item.quantity * parseFloat(price);
  }

  await Cart.findByIdAndUpdate(cartId, { total_price: total });
};


// Increment item quantity
export const incrementCartItem = async (req, res) => {
  try {
    const { cart_item_id } = req.body;
    const user_id = req.user.user_id;

    const item = await CartItem.findById(cart_item_id)
      .populate("variant_id")
      .populate("product_id")
      .populate("cart_id");

    if (!item) return res.status(404).json({ message: "Item not found" });
    if (item.cart_id.user_id.toString() !== user_id) return res.status(403).json({ message: "Unauthorized" });

    const quantityAfterIncrement = item.quantity + 1;

    if (item.variant_id) {
      if (item.variant_id.stock_quantity < quantityAfterIncrement) {
        return res.status(400).json({ message: "Not enough variant stock available" });
      }
    } else {
      const product = item.product_id;
      if (!product) return res.status(500).json({ message: "Product not found" });

      if (product.type !== 'Waist Chains' && product.stock_quantity < quantityAfterIncrement) {
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
export const decrementCartItem = async (req, res) => {
  try {
    const { cart_item_id } = req.body;
    const user_id = req.user.user_id;

    const item = await CartItem.findById(cart_item_id).populate("cart_id");

    if (!item) return res.status(404).json({ message: "Item not found" });
    if (item.cart_id.user_id.toString() !== user_id) return res.status(403).json({ message: "Unauthorized" });

    if (item.quantity <= 1) {
      await CartItem.findByIdAndDelete(cart_item_id);
      await Cart.findByIdAndUpdate(item.cart_id._id, { $pull: { items: cart_item_id } });
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

export const deleteCartItem = async (req, res) => {
  try {
    const { cart_item_id } = req.body;
    const user_id = req.user.user_id;

    const item = await CartItem.findById(cart_item_id).populate("cart_id");

    if (!item) return res.status(404).json({ message: "Item not found" });
    if (item.cart_id.user_id.toString() !== user_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Remove the item from the CartItem collection
    await CartItem.findByIdAndDelete(cart_item_id);

    // Also remove its reference from the cart's items array
    await Cart.findByIdAndUpdate(item.cart_id._id, { $pull: { items: item._id } });

    // Recalculate the total price
    await recalculateCartTotal(item.cart_id._id);

    return res.json({ message: "Item deleted" });
  } catch (err) {
    console.error("Error deleting cart item:", err);
    return res.status(500).json({ message: "Error deleting item" });
  }
};


export const getUserCart = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const cart = await Cart.findOne({ user_id })
      .populate({
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
                select: "image_url"
              },
              select: "_id name type"
            },
            select: "_id size price"
          },
          {
            path: "product_id",
            model: "Product",
            populate: {
              path: "images",
              model: "ProductImage",
              match: { is_primary: true },
              select: "image_url"
            },
            select: "_id name type price"
          }
        ]
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

        return {
          cart_item_id: item._id,
          quantity: item.quantity,
          variant_id: variant ? variant._id : null,
          size: item.size || variant?.size || null,
          price: parseFloat(variant?.price || product.price || 0).toFixed(2),
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
    return res.status(500).json({ message: "Error fetching cart", error });
  }
};

