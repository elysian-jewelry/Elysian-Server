// The options a customer chose for one order line, worded the way the shop
// talks about size. Shared by the confirmation email and the operations
// sheet, so both always read the same.
//
//   size "Standard"                → "Standard Size"
//   size "Custom" + the typed size → "Custom Size: 15 cm" (exactly as typed)
//   any other option or size       → "Color: Gold", "Size: M"

const clean = (v) => (v == null ? "" : String(v).trim());
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * @param {object} attributes the line's options, e.g. { size: "Custom" }
 * @param {string|null} notes the custom size the customer typed
 * @returns {Array<{ label: string, value: string }>} `value` is "" for a
 *   part that is only a label ("Standard Size")
 */
export const orderOptionParts = (attributes, notes) => {
  const note = clean(notes);
  let noteShown = false;

  const parts = Object.entries(attributes || {})
    .map(([k, v]) => [clean(k), clean(v)])
    .filter(([k, v]) => k && v)
    .map(([k, v]) => {
      if (k.toLowerCase() === "size") {
        const size = v.toLowerCase();
        if (size === "standard") return { label: "Standard Size", value: "" };
        if (size === "custom") {
          noteShown = true;
          return { label: "Custom Size", value: note };
        }
      }
      return { label: titleCase(k), value: v };
    });

  // The product page only sends a note with a custom size, but the cart
  // accepts one on any line; show it rather than drop it.
  if (note && !noteShown) parts.push({ label: "Note", value: note });

  return parts;
};

/** Plain text for the sheet, e.g. "Custom Size: 15 cm". */
export const orderOptionsText = (attributes, notes) =>
  orderOptionParts(attributes, notes)
    .map(({ label, value }) => (value ? `${label}: ${value}` : label))
    .join(", ");
