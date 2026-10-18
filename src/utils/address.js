// Delivery-address formatting shared by the order API, the confirmation
// email and the operations sheet, so all three always show the same thing.
//
// Orders placed before checkout asked for building, floor, landmark and a
// map pin simply don't have those parts; they're left out, not shown empty.

const clean = (v) => (v == null ? "" : String(v).trim());

/** A Google Maps link to the customer's pin, or null when there's no pin. */
export const mapUrlFor = (location) => {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (location == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
};

/**
 * @param {object} o an order, or the same fields from checkout:
 *   address (the street), building_no, floor_no, apartment_no, landmark,
 *   city, governorate (name), location { lat, lng }
 */
export const formatOrderAddress = (o) => {
  const street = clean(o.address);
  const unit = [
    clean(o.building_no) && `Building ${clean(o.building_no)}`,
    clean(o.floor_no) && `Floor ${clean(o.floor_no)}`,
    clean(o.apartment_no) && `Apt ${clean(o.apartment_no)}`,
  ]
    .filter(Boolean)
    .join(", ");
  const area = [clean(o.city), clean(o.governorate)].filter(Boolean).join(", ");
  const landmark = clean(o.landmark);

  return {
    street, // "Sakleya Street"
    unit, // "Building 26, Floor 3, Apt 5"
    area, // "Sixth Area, Nasr City, Cairo"
    landmark, // "Next to Seoudi Market", or ""
    mapUrl: mapUrlFor(o.location),
    // One line for the sheet and anywhere else that needs a single string.
    full: [street, unit, area, landmark && `Landmark: ${landmark}`]
      .filter(Boolean)
      .join(", "),
  };
};
