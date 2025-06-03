import Cart from "../../models/cart.js";
import CartItem from "../../models/cartItem.js";
import Product from "../../models/product.js";
import ProductImage  from "../../models/productImage.js";

// Add product to cart
export const addItemToCart = async (req, res) => {
  try {
    const { product_id, quantity, size } = req.body;
    const user_id = req.user.user_id;

    // Early validation
    if (!product_id || !quantity || quantity <= 0) {
      return res.status(400).json({ message: "Invalid product or quantity" });
    }

    // Fetch cart and product in parallel
    const [cart, product] = await Promise.all([
      Cart.findOne({ where: { user_id } }),
      Product.findByPk(product_id, {
        attributes: ['product_id', 'name', 'type', 'price', 'stock_quantity']
      })
    ]);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const requiresSize =
      product.type === 'Waist Chains' ||
      product.type === 'Body Chains' ||
      (product.type === 'Back Chains' && ['The OG', 'Vertical Gleam'].includes(product.name));

    if (requiresSize) {
      if (!size) {
        return res.status(400).json({ message: `Size is required for ${product.type}` });
      }

      const allowedSizes = ['S/M', 'M/L'];
      if (!allowedSizes.includes(size)) {
        return res.status(400).json({ message: "Size must be 'S/M' or 'M/L'" });
      }
    }

    // Create cart if not exists
    const userCart = cart || await Cart.create({ user_id });

    // Check existing item
    let item = await CartItem.findOne({
      where: {
        cart_id: userCart.cart_id,
        product_id,
        size: size || null
      }
    });

    const totalRequestedQty = item ? item.quantity + quantity : quantity;

    if (
      !requiresSize && // if size is not mandatory, check general stock
      product.stock_quantity < totalRequestedQty
    ) {
      return res.status(400).json({ message: "Not enough stock available" });
    }

    // Add or update item
    if (item) {
      item.quantity = totalRequestedQty;
      await item.save();
    } else {
      await CartItem.create({
        cart_id: userCart.cart_id,
        product_id,
        quantity,
        size: size || null
      });
    }

    // Recalculate total
    const items = await CartItem.findAll({
      where: { cart_id: userCart.cart_id },
      include: {
        model: Product,
        attributes: ['price']
      }
    });

    const totalPrice = items.reduce((sum, item) => {
      return sum + item.quantity * item.Product.price;
    }, 0);

    userCart.total_price = totalPrice;
    await userCart.save();

    return res.status(200).json({ message: "Product added to cart", cart: userCart });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error adding to cart", error });
  }
};



const recalculateCartTotal = async (cart_id) => {
  const items = await CartItem.findAll({
    where: { cart_id },
    include: Product
  });

  const total = items.reduce((sum, item) => {
    return sum + item.quantity * parseFloat(item.Product.price);
  }, 0);

  const cart = await Cart.findByPk(cart_id);
  cart.total_price = total;
  await cart.save();
};

export const incrementCartItem = async (req, res) => {
  try {
    const { cart_item_id } = req.body;
    const user_id = req.user.user_id;

    // Fetch only what's needed
    const item = await CartItem.findByPk(cart_item_id, {
      include: [
        { model: Product, attributes: ['stock_quantity', 'type'] },
        { model: Cart, attributes: ['cart_id', 'user_id'] }
      ]
    });

    if (!item) return res.status(404).json({ message: "Item not found" });
    if (item.Cart.user_id !== user_id) return res.status(403).json({ message: "Unauthorized" });

    const { stock_quantity, type } = item.Product;

    // Skip stock check for Waist Chains
    if (type !== 'Waist Chains' && stock_quantity < item.quantity + 1) {
      return res.status(400).json({ message: "Not enough stock available" });
    }

    item.quantity += 1;
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

    // Fetch minimal data
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
        attributes: ['cart_item_id', 'product_id', 'quantity', 'size'],
        include: {
          model: Product,
          attributes: ['product_id', 'name', 'price', 'type'],
          include: {
            model: ProductImage,
            as: 'images', // << This must match the alias used in the association
            where: { is_primary: true },
            attributes: ['image_url'],
            required: false,
          },
        },
      },
    });

    if (!cart || cart.CartItems.length === 0) {
      return res.status(404).json({ message: 'Cart is empty' });
    }

    return res.status(200).json({ success: true, cart });
  } catch (error) {
    console.error('Error fetching cart:', error);
    return res.status(500).json({ message: 'Error fetching cart' });
  }
};