// The one pricing rule for the shop, shared by the cart, checkout and admin:
//   • a product WITH variants is priced only by its variants — the parent
//     product's price is never used for it;
//   • a product WITHOUT variants is priced by its own price;
//   • a sellable price is a real number greater than 0.

/** True for a price that can be sold at: a finite number above 0. */
export const isValidPrice = (v) =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Price of one unit of a cart line. `item` is a CartItem document whose
 * variant_id and product_id are populated.
 *
 * A line that points to a variant is priced by that variant only. If the
 * variant no longer exists this returns undefined — never the parent
 * product's price. (populated() still reports the stored id after the
 * variant document is gone, which is how a deleted variant is told apart
 * from a line that never had one.)
 */
export const unitPriceOf = (item) =>
  item.variant_id || item.populated("variant_id")
    ? item.variant_id?.price
    : item.product_id?.price;

// Money is added up in whole piastres (1 EGP = 100 piastres), where integer
// math is exact, and turned back into pounds only for storing and showing.
// Plain float math stored totals like 559.9745 or 0.30000000000000004.
export const toPiastres = (amount) => Math.round(parseFloat(amount) * 100);
export const toPounds = (piastres) => piastres / 100;

/**
 * A price during a storewide sale (models/sale.js): the sale's percentage
 * off, rounded DOWN to a whole pound, so the discount is never less than the
 * one advertised — 375 at 15% off is 318, not 318.75. A price that would
 * round down to 0 keeps its piastres instead (1 at 50% off is 0.50). With no
 * sale, or for a price that can't be sold at, the price comes back unchanged.
 */
export const applySale = (price, sale) => {
  if (!sale || !isValidPrice(price)) return price;
  // One integer product, one division: exact for every real price.
  const discounted = toPiastres(price) * (100 - sale.percent);
  const pounds = Math.floor(discounted / 10000);
  if (pounds >= 1) return pounds;
  const piastres = Math.floor(discounted / 100);
  return piastres >= 1 ? toPounds(piastres) : price;
};

// The admin's own sale price for chosen items (sale.price_overrides), looked
// up through a map built once per sale object.
const customPriceMaps = new WeakMap();
const customKey = (productId, variantId) => `${productId}:${variantId ?? ""}`;
const customSalePrice = (sale, productId, variantId) => {
  if (!sale?.price_overrides?.length || productId == null) return undefined;
  let prices = customPriceMaps.get(sale);
  if (!prices) {
    prices = new Map(
      sale.price_overrides.map((o) => [customKey(o.product_id, o.variant_id), o.price])
    );
    customPriceMaps.set(sale, prices);
  }
  return prices.get(customKey(productId, variantId));
};

/**
 * The price of one product (or one of its options, `variantId`) during
 * `sale`: the admin's own sale price for it if one was set, the sale's
 * percentage otherwise. Never more than the regular `price` — a custom price
 * set before the regular price was lowered can't raise it. Regular prices
 * come in here and are never changed.
 */
export const salePriceOf = (price, sale, productId = null, variantId = null) => {
  if (!sale || !isValidPrice(price)) return price;
  const custom = customSalePrice(sale, productId, variantId);
  return isValidPrice(custom) ? Math.min(custom, price) : applySale(price, sale);
};

const idOf = (ref) => (ref && typeof ref === "object" && ref._id ? ref._id : ref);

/** What a customer pays for one unit of a cart line, during `sale` if any. */
export const chargedUnitPriceOf = (item, sale) =>
  salePriceOf(unitPriceOf(item), sale, idOf(item.product_id), idOf(item.variant_id) ?? null);
