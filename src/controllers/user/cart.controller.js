import Cart from "../../models/cart.js";
import CartItem from "../../models/cartItem.js";
import Product from "../../models/product.js";
import ProductImage  from "../../models/productImage.js";
import ProductVariant  from "../../models/productVariant.js";


export const addItemToCart = async (req, res) => {
  try {
    const { product_id, variant_id, quantity, size } = req.body;
    const user_id = req.user.user_id;

    // Validate input
    if (!product_id || !quantity || quantity <= 0) {
      return res.status(400).json({ message: "Invalid product or quantity" });
    }



    // Fetch product
    const product = await Product.findByPk(product_id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

      // Conditional size check for specific product types and names
    const type = product.type;
    const name = product.name;

    const requiresSize = (
      type === 'Waist Chains' ||
      type === 'Body Chains' ||
      (type === 'Back Chains' && ['The OG', 'Vertical Gleam'].includes(name))
    );

    if (requiresSize) {
      if (!size || !['S/M', 'M/L'].includes(size)) {
        return res.status(400).json({
          message: `${type} ${name || ''} requires a size of 'S/M' or 'M/L'`,
        });
      }
    }

    console.log(size);
    

    // Fetch or create user's cart
    let cart = await Cart.findOne({ where: { user_id } });
    if (!cart) cart = await Cart.create({ user_id });

    // Check if product has variants
    const variants = await ProductVariant.findAll({ where: { product_id } });
    const hasVariants = variants.length > 0;

    if (hasVariants) {
      // Variant validation
      if (!variant_id) {
        return res.status(400).json({ message: "Variant ID is required for this product" });
      }

      const variant = variants.find(v => v.variant_id === variant_id);
      if (!variant) {
        return res.status(400).json({ message: "Variant does not belong to the specified product" });
      }

      const existingItem = await CartItem.findOne({
        where: { cart_id: cart.cart_id, variant_id, product_id }
      });

      const totalQty = existingItem ? existingItem.quantity + quantity : quantity;

      if (variant.stock_quantity < totalQty) {
        return res.status(400).json({ message: "Requested quantity exceeds available variant stock" });
      }

      if (existingItem) {
        existingItem.quantity = totalQty;
        await existingItem.save();
      } else {
        
        await CartItem.create({
          cart_id: cart.cart_id,
          variant_id,
          product_id,
          quantity,
          size: variant.size
        });
      }
    } else {
      // Non-variant product flow
      if (variant_id) {
        return res.status(400).json({ message: "This product does not support variants" });
      }

      

      const whereClause = {
  cart_id: cart.cart_id,
  variant_id: null,
  product_id: product_id,
};

if (size !== undefined) {
  whereClause.size = size;
}

const existingItem = await CartItem.findOne({ where: whereClause });


      const totalQty = existingItem ? existingItem.quantity + quantity : quantity;

      if (product.stock_quantity < totalQty) {
        return res.status(400).json({ message: "Requested quantity exceeds available stock" });
      }

      if (existingItem) {
        existingItem.quantity = totalQty;
        await existingItem.save();
      } else {
       const newCartItem = {
  cart_id: cart.cart_id,
  variant_id: null,
  product_id: product_id,
  quantity
};

if (size !== undefined) {
  newCartItem.size = size;
}

await CartItem.create(newCartItem);

      }
    }

    // Recalculate cart total price
    const items = await CartItem.findAll({
      where: { cart_id: cart.cart_id },
      include: {
        model: ProductVariant,
        include: {
          model: Product,
          attributes: ['price']
        }
      }
    });

    const totalPrice = await Promise.all(items.map(async item => {
      if (item.ProductVariant) {
        return item.quantity * parseFloat(item.ProductVariant.price);
      } else {
        const fallbackProduct = await Product.findByPk(product_id);
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



const recalculateCartTotal = async (cart_id) => {
  const cartItems = await CartItem.findAll({ where: { cart_id } });

  let total = 0;

  for (const item of cartItems) {
    let price = 0;

    if (item.variant_id) {
      const variant = await ProductVariant.findByPk(item.variant_id, {
        attributes: ['price']
      });
      price = variant?.price;
    } else if (item.product_id) {
      const product = await Product.findByPk(item.product_id, {
        attributes: ['price']
      });
      price = product?.price;
    }

    if (!price) {
      console.warn(`⚠️ Missing price for cart item ${item.cart_item_id}`);
      continue;
    }

    total += item.quantity * parseFloat(price);
  }

  const cart = await Cart.findByPk(cart_id);
  if (cart) {
    cart.total_price = total;
    await cart.save();
  }
};


export const incrementCartItem = async (req, res) => {
  try {
    const { cart_item_id } = req.body;
    const user_id = req.user.user_id;

    const item = await CartItem.findByPk(cart_item_id, {
      include: [
        { model: Product, attributes: ['stock_quantity', 'type'] },
        { model: ProductVariant, attributes: ['stock_quantity'] },
        { model: Cart, attributes: ['cart_id', 'user_id'] }
      ]
    });

    if (!item) return res.status(404).json({ message: "Item not found" });
    if (item.Cart.user_id !== user_id) return res.status(403).json({ message: "Unauthorized" });

    const isVariant = !!item.variant_id;
    const quantityAfterIncrement = item.quantity + 1;

    if (isVariant) {
      const stock = item.ProductVariant?.stock_quantity;
      if (stock === undefined || stock < quantityAfterIncrement) {
        return res.status(400).json({ message: "Not enough variant stock available" });
      }
    } else {
      const product = item.Product;
      if (!product) {
        return res.status(500).json({ message: "Product not found for non-variant item" });
      }

      if (product.type !== 'Waist Chains' && product.stock_quantity < quantityAfterIncrement) {
        return res.status(400).json({ message: "Not enough stock available" });
      }
    }

    item.quantity = quantityAfterIncrement;
    await item.save();

    await recalculateCartTotal(item.Cart.cart_id);

    return res.json({ message: "Item incremented", item });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error incrementing item" });
  }
};


export const decrementCartItem = async (req, res) => {
  try {
    const { cart_item_id } = req.body;
    const user_id = req.user.user_id;

    const item = await CartItem.findByPk(cart_item_id, {
      include: [
        { model: Cart, attributes: ['cart_id', 'user_id'] }
      ]
    });

    if (!item) return res.status(404).json({ message: "Item not found" });
    if (item.Cart.user_id !== user_id) return res.status(403).json({ message: "Unauthorized" });

    if (item.quantity <= 1) {
      await item.destroy();
    } else {
      item.quantity -= 1;
      await item.save();
    }

    await recalculateCartTotal(item.Cart.cart_id);

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

    const item = await CartItem.findByPk(cart_item_id, {
      include: {
        model: Cart,
        attributes: ['cart_id', 'user_id']
      }
    });

    if (!item) return res.status(404).json({ message: "Item not found" });
    if (item.Cart.user_id !== user_id) return res.status(403).json({ message: "Unauthorized" });

    await item.destroy();
    await recalculateCartTotal(item.Cart.cart_id);

    return res.json({ message: "Item deleted" });
  } catch (err) {
    return res.status(500).json({ message: "Error deleting item" });
  }
};



export const getUserCart = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const cart = await Cart.findOne({
      where: { user_id },
      attributes: ['cart_id', 'user_id', 'total_price'],
      include: {
        model: CartItem,
        attributes: ['cart_item_id', 'variant_id', 'product_id', 'quantity', 'size'],
        include: [
          {
            model: ProductVariant,
            attributes: ['variant_id', 'size', 'price'],
            include: {
              model: Product,
              attributes: ['product_id', 'name', 'type'],
              include: {
                model: ProductImage,
                as: 'images',
                where: { is_primary: true },
                attributes: ['image_url'],
                required: false,
              },
            },
          },
          {
            model: Product,
            attributes: ['product_id', 'name', 'type', 'price'],
            include: {
              model: ProductImage,
              as: 'images',
              where: { is_primary: true },
              attributes: ['image_url'],
              required: false,
            },
          },
        ],
      },
    });

    if (!cart || cart.CartItems.length === 0) {
      return res.status(404).json({ message: 'Cart is empty' });
    }

    // Simplified & unified response structure
    const simplifiedCart = {
      cart_id: cart.cart_id,
      user_id: cart.user_id,
      total_price: cart.total_price,
      cart_items: cart.CartItems.map(item => {
        const variant = item.ProductVariant;
        const product = variant?.Product || item.Product || {};
        const image = product.images?.[0];

        return {
          cart_item_id: item.cart_item_id,
          quantity: item.quantity,
          variant_id: item.variant_id,
          size: item.size || variant?.size || null,
          price: variant?.price || product.price || null,
          product_id: product.product_id,
          product_name: product.name,
          product_type: product.type,
          image_url: image?.image_url || null
        };
      }),
    };

    return res.status(200).json({ success: true, cart: simplifiedCart });
  } catch (error) {
    console.error('Error fetching cart:', error);
    return res.status(500).json({ message: 'Error fetching cart', error });
  }
};
