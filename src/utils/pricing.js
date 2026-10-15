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
